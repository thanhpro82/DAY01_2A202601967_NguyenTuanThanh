import json
import os
import sys
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import functions from template.py
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from template import (
        call_openai,
        call_openai_mini,
        compare_models,
        count_tokens,
        estimate_cost,
        retry_with_backoff,
        batch_compare,
        format_comparison_table,
        OPENAI_MODEL,
        OPENAI_MINI_MODEL,
        PRICING_PER_1K_TOKENS,
    )
except ImportError as e:
    print(f"Error importing template.py: {e}")
    sys.exit(1)

try:
    import tiktoken
except ImportError:
    tiktoken = None

from openai import OpenAI

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")


class AIAppRequestHandler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        pass

    def send_json(self, data, status=200):
        try:
            body = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        except (ConnectionAbortedError, BrokenPipeError):
            pass
        except Exception as e:
            print(f"[send_json Error]: {e}")

    def do_OPTIONS(self):
        try:
            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
        except Exception:
            pass

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/" or path == "/index.html":
            file_path = os.path.join(STATIC_DIR, "index.html")
            self.serve_static_file(file_path, "text/html")
        elif path.startswith("/static/"):
            rel_path = path[len("/static/") :]
            file_path = os.path.join(STATIC_DIR, rel_path)
            ext = os.path.splitext(file_path)[1].lower()
            mime_types = {
                ".css": "text/css",
                ".js": "application/javascript",
                ".json": "application/json",
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".svg": "image/svg+xml",
                ".ico": "image/x-icon",
            }
            mime = mime_types.get(ext, "application/octet-stream")
            self.serve_static_file(file_path, mime)
        elif path == "/api/models":
            self.send_json({
                "main_model": OPENAI_MODEL,
                "mini_model": OPENAI_MINI_MODEL,
                "pricing": PRICING_PER_1K_TOKENS,
            })
        else:
            self.send_error(404, "File Not Found")

    def serve_static_file(self, file_path, mime_type):
        if not os.path.exists(file_path) or os.path.isdir(file_path):
            self.send_error(404, "File Not Found")
            return
        try:
            with open(file_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", f"{mime_type}; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except (ConnectionAbortedError, BrokenPipeError):
            pass
        except Exception as e:
            self.send_error(500, f"Error reading file: {e}")

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        content_len = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_len)

        try:
            body = json.loads(post_data.decode("utf-8")) if post_data else {}
        except Exception:
            body = {}

        if path == "/api/chat":
            self.handle_chat_stream(body)
        elif path == "/api/compare":
            self.handle_compare(body)
        elif path == "/api/calculate":
            self.handle_calculate(body)
        elif path == "/api/tokenize":
            self.handle_tokenize(body)
        elif path == "/api/batch":
            self.handle_batch(body)
        else:
            self.send_error(404, "API Endpoint Not Found")

    def handle_chat_stream(self, body):
        persona = body.get("persona", "Bạn là một trợ lý AI thông minh, hỗ trợ nhiệt tình bằng tiếng Việt.")
        user_msg = body.get("user_msg", "")
        history = body.get("history", [])
        model = body.get("model", OPENAI_MODEL)
        temperature = float(body.get("temperature", 0.7))
        top_p = float(body.get("top_p", 0.9))
        max_tokens = int(body.get("max_tokens", 512))

        if not user_msg.strip():
            self.send_json({"error": "Empty message"}, status=400)
            return

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            self.stream_mock_response(user_msg, history, persona, model)
            return

        try:
            client = OpenAI(api_key=api_key)
            messages = (
                [{"role": "system", "content": persona}]
                + history
                + [{"role": "user", "content": user_msg}]
            )

            stream = retry_with_backoff(
                lambda: client.chat.completions.create(
                    model=model,
                    messages=messages,
                    stream=True,
                    temperature=temperature,
                    top_p=top_p,
                    max_tokens=max_tokens,
                )
            )

            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            reply = ""
            for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    reply += delta
                    evt = json.dumps({"type": "chunk", "delta": delta}, ensure_ascii=False)
                    self.wfile.write(f"data: {evt}\n\n".encode("utf-8"))
                    self.wfile.flush()

            new_history = (history + [
                {"role": "user", "content": user_msg},
                {"role": "assistant", "content": reply},
            ])[-8:]

            prompt_tok = count_tokens(user_msg, model)
            reply_tok = count_tokens(reply, model)
            tot_tok = prompt_tok + reply_tok
            cost_info = estimate_cost(user_msg, reply, model)

            done_evt = json.dumps(
                {
                    "type": "done",
                    "reply": reply,
                    "history": new_history,
                    "prompt_tokens": prompt_tok,
                    "completion_tokens": reply_tok,
                    "tokens_used": tot_tok,
                    "total_cost": cost_info["total_cost"],
                },
                ensure_ascii=False,
            )
            self.wfile.write(f"data: {done_evt}\n\n".encode("utf-8"))
            self.wfile.flush()

        except (ConnectionAbortedError, BrokenPipeError):
            pass
        except Exception as e:
            try:
                err_evt = json.dumps({"type": "error", "message": str(e)}, ensure_ascii=False)
                self.wfile.write(f"data: {err_evt}\n\n".encode("utf-8"))
            except Exception:
                pass

    def stream_mock_response(self, user_msg, history, persona, model):
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            mock_reply = f"[Demo Mode — Studio Pro]\n\nChào bạn! Bạn vừa hỏi: \"{user_msg}\". Trợ lý AI đang chạy ở chế độ demo siêu mượt với đầy đủ tính năng Pro."
            
            for char in mock_reply:
                evt = json.dumps({"type": "chunk", "delta": char}, ensure_ascii=False)
                self.wfile.write(f"data: {evt}\n\n".encode("utf-8"))
                self.wfile.flush()
                time.sleep(0.012)

            new_history = (history + [
                {"role": "user", "content": user_msg},
                {"role": "assistant", "content": mock_reply},
            ])[-8:]

            prompt_tok = count_tokens(user_msg, model)
            reply_tok = count_tokens(mock_reply, model)
            tot_tok = prompt_tok + reply_tok
            cost_info = estimate_cost(user_msg, mock_reply, model)

            done_evt = json.dumps(
                {
                    "type": "done",
                    "reply": mock_reply,
                    "history": new_history,
                    "prompt_tokens": prompt_tok,
                    "completion_tokens": reply_tok,
                    "tokens_used": tot_tok,
                    "total_cost": cost_info["total_cost"],
                },
                ensure_ascii=False,
            )
            self.wfile.write(f"data: {done_evt}\n\n".encode("utf-8"))
        except (ConnectionAbortedError, BrokenPipeError):
            pass

    def handle_compare(self, body):
        prompt = body.get("prompt", "")
        if not prompt.strip():
            self.send_json({"error": "Prompt không được để trống"}, status=400)
            return

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            self.send_json({
                "prompt": prompt,
                "gpt4o_answer": f"[Demo GPT-4o Pro] Phân tích cho: '{prompt}'.\n\nModel GPT-4o trả về kết quả phân tích đa chiều, sâu sắc và lập luận logic cao.",
                "mini_answer": f"[Demo GPT-4o-Mini Pro] Phân tích cho: '{prompt}'.\n\nModel GPT-4o-Mini trả về câu trả lời tối ưu tốc độ và siêu tiết kiệm token.",
                "gpt4o_time": 0.38,
                "mini_time": 0.14,
                "gpt4o_cost": 0.000125,
            })
            return

        try:
            res = compare_models(prompt)
            res["prompt"] = prompt
            self.send_json(res)
        except Exception as e:
            self.send_json({
                "prompt": prompt,
                "gpt4o_answer": f"[Lỗi gọi API GPT-4o]: {e}\n(Kiểm tra OPENAI_API_KEY trong .env)",
                "mini_answer": f"[Lỗi gọi API Mini]: {e}\n(Kiểm tra OPENAI_API_KEY trong .env)",
                "gpt4o_time": 0.0,
                "mini_time": 0.0,
                "gpt4o_cost": 0.0,
            })

    def handle_calculate(self, body):
        text = body.get("text", "")
        prompt = body.get("prompt", "")
        response = body.get("response", "")
        model = body.get("model", OPENAI_MODEL)

        if text and not prompt and not response:
            tok_count = count_tokens(text, model)
            pricing = PRICING_PER_1K_TOKENS.get(model, PRICING_PER_1K_TOKENS["gpt-4o"])
            input_cost = tok_count / 1000 * pricing["input"]
            output_cost = tok_count / 1000 * pricing["output"]
            words = len(text.split())
            chars = len(text)
            self.send_json({
                "tokens": tok_count,
                "words": words,
                "chars": chars,
                "input_cost": input_cost,
                "output_cost": output_cost,
                "model": model
            })
            return

        tok_p = count_tokens(prompt, model)
        tok_r = count_tokens(response, model)
        cost_info = estimate_cost(prompt, response, model)

        self.send_json({
            "prompt_tokens": tok_p,
            "response_tokens": tok_r,
            "total_tokens": tok_p + tok_r,
            "cost_breakdown": cost_info,
        })

    def handle_tokenize(self, body):
        text = body.get("text", "")
        model = body.get("model", OPENAI_MODEL)
        token_pieces = []
        if tiktoken:
            try:
                try:
                    encoding = tiktoken.encoding_for_model(model)
                except KeyError:
                    encoding = tiktoken.get_encoding("cl100k_base")

                token_ids = encoding.encode(text)
                for tid in token_ids:
                    try:
                        piece_str = encoding.decode([tid])
                    except Exception:
                        piece_str = str(tid)
                    token_pieces.append({"id": tid, "piece": piece_str})
            except Exception:
                token_pieces = [{"id": i, "piece": word} for i, word in enumerate(text.split())]
        else:
            token_pieces = [{"id": i, "piece": word} for i, word in enumerate(text.split())]

        self.send_json({
            "total_tokens": len(token_pieces),
            "tokens": token_pieces,
        })

    def handle_batch(self, body):
        prompts = body.get("prompts", [])
        if not prompts:
            self.send_json({"error": "No prompts provided"}, status=400)
            return

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            # Mock batch compare
            results = []
            for p in prompts:
                results.append({
                    "prompt": p,
                    "gpt4o_answer": f"[Demo GPT-4o] Phản hồi cho: {p}",
                    "mini_answer": f"[Demo Mini] Phản hồi cho: {p}",
                    "gpt4o_time": 0.35,
                    "mini_time": 0.12,
                    "gpt4o_cost": 0.0001,
                })
            table_str = format_comparison_table(results)
            self.send_json({"results": results, "table": table_str})
            return

        try:
            results = batch_compare(prompts)
            table_str = format_comparison_table(results)
            self.send_json({"results": results, "table": table_str})
        except Exception as e:
            self.send_json({"error": str(e)}, status=500)


def run_server(port=8000):
    server_address = ("", port)
    httpd = HTTPServer(server_address, AIAppRequestHandler)
    print(f"=== Server AI Web UI is running at: http://localhost:{port} ===")
    print("Open your browser and navigate to http://localhost:8000 to use the UI!")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Server.")
        httpd.server_close()


if __name__ == "__main__":
    port = 8000
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        port = int(sys.argv[1])
    run_server(port)
