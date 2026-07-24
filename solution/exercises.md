# K4 — Ngày 1: Bài Tập & Phản Ánh
## Khám Phá LLM API | Phiếu Thực Hành

**Thời lượng:** 14h00–18h00
**Cách làm:** Trả lời từng câu ngay sau khi hoàn thành block tương ứng —
đừng để dồn hết về cuối buổi. Thay dòng `*Câu trả lời của bạn*` bằng câu
trả lời thật (chấm tự động sẽ đếm số câu đã trả lời).

---

## Block 1 — API Cơ Bản (trả lời sau Checkpoint 1)

### Câu 1.1 — Độ nhạy của temperature
Gọi `call_openai` với temperature 0.0, 0.7, 1.2 và 1.8 dùng prompt
**"Hãy kể cho tôi một sự thật thú vị về Hà Nội."**

**Bạn nhận thấy quy luật gì qua bốn phản hồi? Ở mức nào phản hồi bắt đầu
kém mạch lạc?** (2–3 câu)
> Qua 4 lần chạy, temperature càng thấp thì câu trả lời càng ổn định, đi thẳng vào thông tin; càng cao thì nội dung đa dạng hơn nhưng cũng dài và "bay" hơn. Ở 0.0 và 0.7 phản hồi khá chặt chẽ, còn từ khoảng 1.2 bắt đầu có xu hướng lan man hơn (dù vẫn đúng ý chính). Mức 1.8 sáng tạo nhất nhưng dễ kém tập trung nếu dùng cho tác vụ cần độ chính xác cao.

### Câu 1.2 — Chọn temperature cho sản phẩm
**Bạn sẽ đặt temperature bao nhiêu cho trợ lý soạn thảo hợp đồng pháp lý,
và bao nhiêu cho trợ lý viết slogan quảng cáo? Giải thích khác biệt.**
> Với trợ lý soạn thảo hợp đồng pháp lý, mình chọn temperature thấp khoảng 0.1–0.2 để câu chữ nhất quán, giảm rủi ro diễn đạt mơ hồ hoặc bịa thêm ý. Với trợ lý viết slogan quảng cáo, mình chọn cao hơn khoảng 1.0–1.3 để tăng độ sáng tạo, nhiều phương án ngôn từ mới lạ. Khác biệt nằm ở mục tiêu: pháp lý ưu tiên độ chính xác và ổn định, còn marketing ưu tiên ý tưởng đa dạng và đột phá.

### Câu 1.3 — Đánh đổi chi phí
Kịch bản: 20.000 người dùng hoạt động mỗi ngày, mỗi người gọi API 2 lần,
mỗi lần trung bình ~500 token đầu ra.

**Ước tính chi phí mỗi ngày của model lớn so với model nhỏ cho workload này
(dựa trên bảng giá trong template). Nêu một trường hợp model lớn xứng đáng
với chi phí và một trường hợp model nhỏ là lựa chọn đúng:**
> Mỗi ngày có 20.000 x 2 = 40.000 lượt gọi; mỗi lượt ~500 output token nên tổng output là 20.000.000 token/ngày. Theo bảng giá: model lớn gpt-4o có output $0.010/1K token => khoảng $2,000/ngày; model nhỏ gpt-4o-mini có output $0.0006/1K token => khoảng $120/ngày (rẻ hơn khoảng 16.7 lần). Model lớn xứng đáng khi cần chất lượng suy luận cao cho tác vụ quan trọng (ví dụ tư vấn nghiệp vụ phức tạp), còn model nhỏ phù hợp cho FAQ, phân loại đơn giản hoặc chatbot hỗ trợ cơ bản cần tối ưu chi phí.

---

## Block 2 — System Prompt & Token (trả lời sau Checkpoint 2)

### Câu 2.1 — Sức mạnh của persona
Gọi `chat_with_system_prompt` hai lần với cùng câu hỏi
**"Giải thích máy học (machine learning) là gì?"** nhưng hai system prompt
khác nhau:
- "Bạn là một nhà thơ, trả lời mọi thứ bằng hình ảnh ví von, tránh thuật ngữ."
- "Bạn là kỹ sư phần mềm senior, trả lời chính xác, có ví dụ code khi phù hợp."

**Hai phản hồi khác nhau như thế nào (giọng văn, độ dài, mức kỹ thuật)?
Từ đó rút ra system prompt điều khiển được những khía cạnh nào của phản hồi?**
(3–4 câu)
> Với system prompt nhà thơ, câu trả lời giàu hình ảnh ví von, ít thuật ngữ và thiên về giọng văn mềm, ngắn gọn hơn. Với system prompt kỹ sư senior, câu trả lời dài hơn, chính xác hơn, có thuật ngữ chuyên môn và thậm chí đưa ví dụ code khi phù hợp. Từ đó có thể thấy system prompt điều khiển được giọng văn, mức độ kỹ thuật, độ dài, mức độ chi tiết và cách ưu tiên thông tin của phản hồi.

### Câu 2.2 — tiktoken vs đếm từ
Chọn một đoạn văn tiếng Việt ~150 từ. So sánh số token theo `count_tokens`
(tiktoken) với ước lượng `số từ / 0.75` mà Part 1 đã dùng.

**Hai con số chênh nhau bao nhiêu phần trăm? Nếu dùng ước lượng thô để dự
toán ngân sách API cho ứng dụng tiếng Việt, bạn sẽ dự toán thiếu hay thừa —
và vì sao?**
> Với đoạn văn mẫu này, `count_tokens` cho 133 token còn ước lượng thô theo `số từ / 0.75` ra khoảng 149 token, lệch khoảng 12% so với số thật. Nếu dùng cách ước lượng thô để dự toán ngân sách cho tiếng Việt, mình sẽ nghiêng về việc dự toán thừa một chút, vì công thức từ/0.75 không khớp tốt với cách tách token thực tế của tiktoken và tiếng Việt có đặc thù riêng về từ ghép, dấu và cách mã hóa.

---

## Block 3 — Streaming & Độ Bền (trả lời sau Checkpoint 3)

### Câu 3.1 — Trải nghiệm người dùng với streaming
**Xét ba ứng dụng: (a) chatbot văn bản, (b) trợ lý giọng nói đọc to phản hồi,
(c) pipeline dịch tài liệu chạy ngầm ban đêm. Ứng dụng nào hưởng lợi nhiều
nhất từ streaming, ứng dụng nào không cần — và tại sao?** (1 đoạn văn)
> Chatbot văn bản hưởng lợi nhiều nhất từ streaming vì người dùng nhìn thấy phản hồi xuất hiện ngay, giảm cảm giác chờ và có thể đọc/cắt ngang khi đã đủ thông tin. Trợ lý giọng nói cũng hưởng lợi, nhưng theo cách khác: streaming giúp bắt đầu phát âm sớm hơn, tạo cảm giác tự nhiên và phản hồi nhanh hơn cho người nghe. Ngược lại, pipeline dịch tài liệu chạy ngầm ban đêm hầu như không cần streaming vì đây là tác vụ batch, không có người dùng tương tác trực tiếp và mục tiêu chính là hoàn thành đúng, đủ, chứ không phải phản hồi tức thời.

### Câu 3.2 — Vì sao backoff theo cấp số nhân?
**Khi API quá tải và hàng nghìn client cùng retry, exponential backoff giúp
gì so với delay cố định? Tra cứu thêm: kỹ thuật "jitter" (thêm độ trễ ngẫu
nhiên) giải quyết vấn đề gì còn sót lại?**
> Exponential backoff giúp giảm áp lực lên server bằng cách làm cho các lần retry thưa dần theo thời gian, thay vì tất cả client cùng đập lại API ở một nhịp cố định và tạo ra “bão retry”. So với delay cố định, cách này giảm khả năng client đồng loạt thất bại rồi đồng loạt thử lại, nên hệ thống có thời gian hồi phục. Jitter thêm độ trễ ngẫu nhiên để tránh việc nhiều client vẫn vô tình retry cùng lúc sau mỗi mốc chờ giống nhau, từ đó phá đồng bộ và giảm hiện tượng thundering herd.

---

## Block 4 — Mini-Project (trả lời sau Checkpoint 4)

### Câu 4.1 — Thiết kế persona
**Viết lại system prompt bạn dùng cho trợ lý của mình. Chỉ ra 2 chỗ trong
prompt mà nếu xóa đi, hành vi trợ lý sẽ thay đổi rõ rệt — và mô tả thay đổi
đó:**
> System prompt mình dùng là: "Bạn là trợ giảng thân thiện của khóa AI, trả lời ngắn gọn bằng tiếng Việt, ưu tiên đúng ý trước rồi mới giải thích thêm khi cần." Nếu bỏ cụm "trợ giảng thân thiện của khóa AI" thì trợ lý sẽ bớt mang vai trò hỗ trợ học tập, câu trả lời dễ trở nên chung chung và ít bám vào ngữ cảnh bài lab. Nếu bỏ cụm "trả lời ngắn gọn bằng tiếng Việt" thì câu trả lời có thể dài hơn, lan man hơn hoặc đổi sang văn phong không nhất quán, làm mất đúng kiểu phản hồi mình muốn cho bài thực hành.

### Câu 4.2 — Hạn chế & cải thiện
**Trợ lý của bạn giữ history 4 lượt cuối. Hãy mô tả một tình huống hội thoại
cụ thể mà giới hạn này khiến trợ lý trả lời sai/mất ngữ cảnh, và đề xuất một
cách khắc phục (ví dụ: tóm tắt các lượt cũ, tăng giới hạn có chọn lọc...):**
> Một tình huống cụ thể là người dùng hỏi đầu tiên về quy ước đặt tên repo, sau đó đổi chủ đề sang temperature, streaming và retry trong vài lượt, rồi quay lại hỏi "tên repo mình nên đặt theo mẫu nào?". Vì history chỉ giữ 4 lượt cuối, phần thông tin ban đầu về quy ước đặt tên có thể bị cắt mất, khiến trợ lý trả lời như thể chưa từng có ngữ cảnh trước đó hoặc nhắc lại thiếu chính xác. Cách khắc phục hợp lý là lưu một bản tóm tắt ngắn các quyết định quan trọng của phiên chat, hoặc chỉ tăng history có chọn lọc cho các thông tin nền quan trọng như yêu cầu nộp bài, tên project, và persona hiện tại.

---

## Danh Sách Kiểm Tra Nộp Bài

- [ ] `python grade.py` — xem điểm tự động, mục tiêu ≥ 75/100
- [ ] Cả 4 checkpoint pytest đều pass
- [ ] Tất cả 9 câu trong file này đã được trả lời
- [ ] Đã copy bài làm vào folder `solution/`, push lên GitHub cá nhân và nộp link repo vào vlearn (theo hướng dẫn README)
