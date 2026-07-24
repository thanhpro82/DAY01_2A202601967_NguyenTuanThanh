document.addEventListener('DOMContentLoaded', () => {
    // --- Global App State ---
    let chatHistory = [];
    let turnCount = 0;
    let totalTokensUsed = 0;
    let totalCostUSD = 0.0;
    let isStreaming = false;

    // --- DOM Elements ---
    const navItems = document.querySelectorAll('.nav-item');
    const tabPages = document.querySelectorAll('.tab-page');

    const personaSelect = document.getElementById('persona-select');
    const customPersonaBox = document.getElementById('custom-persona-box');
    const customPersonaInput = document.getElementById('custom-persona-input');

    const chatViewport = document.getElementById('chat-viewport');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const clearChatBtn = document.getElementById('clear-chat-btn');

    const statTurns = document.getElementById('stat-turns');
    const statTokens = document.getElementById('stat-tokens');
    const statCost = document.getElementById('stat-cost');
    const statHistoryLen = document.getElementById('stat-history-len');

    // --- Tab Navigation ---
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetTab = item.getAttribute('data-tab');
            navItems.forEach(i => i.classList.remove('active'));
            tabPages.forEach(p => p.classList.remove('active'));

            item.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
        });
    });

    // --- Persona Selector Toggle ---
    personaSelect.addEventListener('change', () => {
        if (personaSelect.value === 'custom') {
            customPersonaBox.classList.remove('hidden');
        } else {
            customPersonaBox.classList.add('hidden');
        }
    });

    function getActivePersona() {
        if (personaSelect.value === 'custom') {
            return customPersonaInput.value.trim() || 'Bạn là trợ lý AI thông minh.';
        }
        return personaSelect.value;
    }

    // --- Chat Logic & Streaming ---
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    sendBtn.addEventListener('click', sendMessage);

    clearChatBtn.addEventListener('click', () => {
        chatHistory = [];
        chatViewport.innerHTML = `
            <div class="message system-welcome">
                <div class="msg-avatar"><i class="fa-solid fa-sparkles"></i></div>
                <div class="msg-bubble">
                    <p>Lịch sử hội thoại đã được xóa thành công. Hãy bắt đầu câu hỏi mới!</p>
                </div>
            </div>
        `;
        updateStats();
    });

    async function sendMessage() {
        const text = userInput.value.trim();
        if (!text || isStreaming) return;

        if (text.toLowerCase() === 'quit' || text.toLowerCase() === 'exit' || text.toLowerCase() === 'bye') {
            appendMessage('user', text);
            appendMessage('assistant', 'Phiên hội thoại kết thúc theo yêu cầu người dùng (Quit). Chúc bạn một ngày tốt lành!');
            userInput.value = '';
            return;
        }

        appendMessage('user', text);
        userInput.value = '';

        const assistantMsgEl = appendMessage('assistant', '');
        const bubble = assistantMsgEl.querySelector('.msg-bubble');
        isStreaming = true;
        sendBtn.disabled = true;

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    persona: getActivePersona(),
                    user_msg: text,
                    history: chatHistory
                })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let accumulatedReply = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunkText = decoder.decode(value);
                const lines = chunkText.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.slice(6).trim();
                        if (!jsonStr) continue;

                        try {
                            const data = JSON.parse(jsonStr);
                            if (data.type === 'chunk') {
                                accumulatedReply += data.delta;
                                bubble.textContent = accumulatedReply;
                                chatViewport.scrollTop = chatViewport.scrollHeight;
                            } else if (data.type === 'done') {
                                chatHistory = data.history || [];
                                turnCount += 1;
                                totalTokensUsed += (data.tokens_used || 0);
                                totalCostUSD += (data.total_cost || 0.0);
                                updateStats();
                            } else if (data.type === 'error') {
                                bubble.textContent = `[Lỗi API]: ${data.message}`;
                            }
                        } catch (err) {
                            console.error('SSE Error:', err);
                        }
                    }
                }
            }
        } catch (err) {
            bubble.textContent = `[Lỗi kết nối Server]: ${err.message}`;
        } finally {
            isStreaming = false;
            sendBtn.disabled = false;
        }
    }

    function appendMessage(role, content) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;

        const avatarIcon = role === 'user' ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-robot"></i>';
        
        msgDiv.innerHTML = `
            <div class="msg-avatar">${avatarIcon}</div>
            <div class="msg-bubble">${escapeHtml(content)}</div>
        `;

        chatViewport.appendChild(msgDiv);
        chatViewport.scrollTop = chatViewport.scrollHeight;
        return msgDiv;
    }

    function updateStats() {
        statTurns.textContent = turnCount;
        statTokens.textContent = totalTokensUsed.toLocaleString();
        statCost.textContent = `$${totalCostUSD.toFixed(6)}`;
        statHistoryLen.textContent = `${chatHistory.length} / 8 msgs`;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // --- Model Comparison Studio ---
    const runCompareBtn = document.getElementById('run-compare-btn');
    const comparePromptInput = document.getElementById('compare-prompt-input');

    const gpt4oOutput = document.getElementById('gpt4o-output');
    const miniOutput = document.getElementById('mini-output');

    const gpt4oLatency = document.getElementById('gpt4o-latency');
    const miniLatency = document.getElementById('mini-latency');

    const gpt4oCost = document.getElementById('gpt4o-cost');
    const miniCost = document.getElementById('mini-cost');

    runCompareBtn.addEventListener('click', async () => {
        const prompt = comparePromptInput.value.trim();
        if (!prompt) return;

        gpt4oOutput.innerHTML = '<p class="placeholder-text"><i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý câu hỏi với GPT-4o...</p>';
        miniOutput.innerHTML = '<p class="placeholder-text"><i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý câu hỏi với GPT-4o-Mini...</p>';
        runCompareBtn.disabled = true;

        try {
            const res = await fetch('/api/compare', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: prompt })
            });

            const data = await res.json();

            gpt4oOutput.textContent = data.gpt4o_answer || 'Không có phản hồi';
            miniOutput.textContent = data.mini_answer || 'Không có phản hồi';

            gpt4oLatency.textContent = `${(data.gpt4o_time || 0).toFixed(2)}s`;
            miniLatency.textContent = `${(data.mini_time || 0).toFixed(2)}s`;

            const g4cost = data.gpt4o_cost || 0;
            gpt4oCost.textContent = `$${g4cost.toFixed(6)}`;
            
            const approxMiniCost = g4cost * 0.06;
            miniCost.textContent = `$${approxMiniCost.toFixed(6)}`;

        } catch (err) {
            gpt4oOutput.textContent = `Lỗi kết nối: ${err.message}`;
            miniOutput.textContent = `Lỗi kết nối: ${err.message}`;
        } finally {
            runCompareBtn.disabled = false;
        }
    });

    // --- Live Real-Time Token & Cost Calculator ---
    const calcLiveText = document.getElementById('calc-live-text');
    const calcClearText = document.getElementById('calc-clear-text');

    const calcLiveTokens = document.getElementById('calc-live-tokens');
    const calcLiveWords = document.getElementById('calc-live-words');
    const calcLiveChars = document.getElementById('calc-live-chars');

    const costGpt4oIn = document.getElementById('cost-gpt4o-in');
    const costGpt4oOut = document.getElementById('cost-gpt4o-out');
    const costMiniIn = document.getElementById('cost-mini-in');
    const costMiniOut = document.getElementById('cost-mini-out');

    let calcDebounceTimer = null;

    calcLiveText.addEventListener('input', () => {
        clearTimeout(calcDebounceTimer);
        calcDebounceTimer = setTimeout(updateLiveCalculator, 150);
    });

    calcClearText.addEventListener('click', () => {
        calcLiveText.value = '';
        updateLiveCalculator();
    });

    async function updateLiveCalculator() {
        const text = calcLiveText.value;
        if (!text) {
            calcLiveTokens.textContent = '0';
            calcLiveWords.textContent = '0';
            calcLiveChars.textContent = '0';
            costGpt4oIn.textContent = '$0.000000';
            costGpt4oOut.textContent = '$0.000000';
            costMiniIn.textContent = '$0.000000';
            costMiniOut.textContent = '$0.000000';
            return;
        }

        try {
            const res = await fetch('/api/calculate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });

            const data = await res.json();
            const tok = data.tokens || 0;

            calcLiveTokens.textContent = tok.toLocaleString();
            calcLiveWords.textContent = (data.words || 0).toLocaleString();
            calcLiveChars.textContent = (data.chars || 0).toLocaleString();

            // Pricing reference:
            // GPT-4o: Input $0.0025 / 1k, Output $0.010 / 1k
            // GPT-4o-Mini: Input $0.00015 / 1k, Output $0.0006 / 1k
            const g4in = (tok / 1000) * 0.0025;
            const g4out = (tok / 1000) * 0.010;
            const minin = (tok / 1000) * 0.00015;
            const minout = (tok / 1000) * 0.0006;

            costGpt4oIn.textContent = `$${g4in.toFixed(6)}`;
            costGpt4oOut.textContent = `$${g4out.toFixed(6)}`;
            costMiniIn.textContent = `$${minin.toFixed(6)}`;
            costMiniOut.textContent = `$${minout.toFixed(6)}`;

        } catch (err) {
            console.error('Calculator error:', err);
        }
    }
});
