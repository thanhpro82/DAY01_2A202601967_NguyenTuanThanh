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
        OPENAI_MODEL,
        OPENAI_MINI_MODEL,
        PRICING_PER_1K_TOKENS,
    )
except ImportError as e:
    print(f"Error importing template.py: {e}")
    sys.exit(1)

from openai import OpenAI

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")


class AIAppRequestHandler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        # Suppress verbose log spam
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
        else:
            self.send_error(404, "API Endpoint Not Found")

    def handle_chat_stream(self, body):
        persona = body.get("persona", "Bạn là một trợ lý AI thông minh, hỗ trợ nhiệt tình bằng tiếng Việt.")
        user_msg = body.get("user_msg", "")
        history = body.get("history", [])
        model = body.get("model", OPENAI_MODEL)

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

            mock_reply = f"[Demo Mode — Chưa cấu hình OPENAI_API_KEY trong .env]\n\nChào bạn! Bạn vừa hỏi: \"{user_msg}\". Trợ lý AI đang phản hồi dưới dạng streaming giả lập."
            
            for char in mock_reply:
                evt = json.dumps({"type": "chunk", "delta": char}, ensure_ascii=False)
                self.wfile.write(f"data: {evt}\n\n".encode("utf-8"))
                self.wfile.flush()
                time.sleep(0.015)

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
            # Fallback mock comparison
            self.send_json({
                "prompt": prompt,
                "gpt4o_answer": f"[Demo GPT-4o] Phân tích cho prompt: '{prompt}'.\nModel GPT-4o phản hồi chi tiết, toàn diện và chất lượng cao.",
                "mini_answer": f"[Demo GPT-4o-Mini] Phân tích cho prompt: '{prompt}'.\nModel GPT-4o-Mini phản hồi cực kỳ nhanh gọn và tối ưu chi phí.",
                "gpt4o_time": 0.42,
                "mini_time": 0.15,
                "gpt4o_cost": 0.000125,
            })
            return

        try:
            res = compare_models(prompt)
            res["prompt"] = prompt
            self.send_json(res)
        except Exception as e:
            # If real API call fails (e.g. invalid key or network timeout)
            self.send_json({
                "prompt": prompt,
                "gpt4o_answer": f"[Lỗi gọi API GPT-4o]: {e}\n(Vui lòng kiểm tra OPENAI_API_KEY trong file .env)",
                "mini_answer": f"[Lỗi gọi API Mini]: {e}\n(Vui lòng kiểm tra OPENAI_API_KEY trong file .env)",
                "gpt4o_time": 0.0,
                "mini_time": 0.0,
                "gpt4o_cost": 0.0,
            })

    def handle_calculate(self, body):
        text = body.get("text", "")
        prompt = body.get("prompt", "")
        response = body.get("response", "")
        model = body.get("model", OPENAI_MODEL)

        # If user provides single text box (live counter)
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
