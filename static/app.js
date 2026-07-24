document.addEventListener('DOMContentLoaded', () => {
    // --- Global App State ---
    let chatHistory = [];
    let turnCount = 0;
    let totalTokensUsed = 0;
    let promptTokensUsed = 0;
    let completionTokensUsed = 0;
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
    const exportChatBtn = document.getElementById('export-chat-btn');
    const voiceRecBtn = document.getElementById('voice-rec-btn');
    const voiceStatusText = document.getElementById('voice-status-text');

    // Hyperparameters Sliders
    const tempSlider = document.getElementById('temp-slider');
    const tempVal = document.getElementById('temp-val');
    const toppSlider = document.getElementById('topp-slider');
    const toppVal = document.getElementById('topp-val');
    const maxtokSlider = document.getElementById('maxtok-slider');
    const maxtokVal = document.getElementById('maxtok-val');

    // Telemetry Sidebar Stats
    const statTTFT = document.getElementById('stat-ttft');
    const statTokSpeed = document.getElementById('stat-tok-speed');
    const statTurns = document.getElementById('stat-turns');
    const statTokens = document.getElementById('stat-tokens');
    const statCost = document.getElementById('stat-cost');
    const statHistoryLen = document.getElementById('stat-history-len');

    // Enterprise Budget Simulator Elements
    const simDauSlider = document.getElementById('sim-dau-slider');
    const simDauVal = document.getElementById('sim-dau-val');
    const simReqSlider = document.getElementById('sim-req-slider');
    const simReqVal = document.getElementById('sim-req-val');
    const simMonthlyQueries = document.getElementById('sim-monthly-queries');
    const simCost4o = document.getElementById('sim-cost-4o');
    const simCostMini = document.getElementById('sim-cost-mini');
    const simCostSaved = document.getElementById('sim-cost-saved');

    // Dashboard KPIs
    const dashKpiTurns = document.getElementById('dash-kpi-turns');
    const dashKpiTokens = document.getElementById('dash-kpi-tokens');
    const dashKpiTokBreakdown = document.getElementById('dash-kpi-tok-breakdown');
    const dashKpiCost = document.getElementById('dash-kpi-cost');
    const dashTokenRatio = document.getElementById('dash-token-ratio');
    const dashProgressFill = document.getElementById('dash-progress-fill');

    const proj1kGpt4o = document.getElementById('proj-1k-gpt4o');
    const proj1kMini = document.getElementById('proj-1k-mini');
    const proj10kGpt4o = document.getElementById('proj-10k-gpt4o');
    const proj10kMini = document.getElementById('proj-10k-mini');
    const dashRefreshBtn = document.getElementById('dash-refresh-btn');

    // --- Sliders Event Listeners ---
    if (tempSlider) tempSlider.addEventListener('input', () => tempVal.textContent = tempSlider.value);
    if (toppSlider) toppSlider.addEventListener('input', () => toppVal.textContent = toppSlider.value);
    if (maxtokSlider) maxtokSlider.addEventListener('input', () => maxtokVal.textContent = maxtokSlider.value);

    // --- Enterprise Budget Simulator Sliders ---
    function updateBudgetSimulator() {
        if (!simDauSlider || !simReqSlider) return;
        const dau = parseInt(simDauSlider.value);
        const reqPerUser = parseInt(simReqSlider.value);

        simDauVal.textContent = dau.toLocaleString();
        simReqVal.textContent = reqPerUser;

        const totalMonthlyQueries = dau * reqPerUser * 30;
        simMonthlyQueries.textContent = totalMonthlyQueries.toLocaleString();

        // Avg tokens per query ~ 300 tokens (200 prompt + 100 response)
        // GPT-4o: (200/1000 * 0.0025) + (100/1000 * 0.010) = $0.0005 + $0.0010 = $0.0015 per query
        // GPT-4o-Mini: (200/1000 * 0.00015) + (100/1000 * 0.0006) = $0.00003 + $0.00006 = $0.00009 per query
        const cost4o = totalMonthlyQueries * 0.0015;
        const costMini = totalMonthlyQueries * 0.00009;
        const saved = cost4o - costMini;
        const savedPct = Math.round((saved / cost4o) * 100);

        simCost4o.textContent = `$${cost4o.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} / tháng`;
        simCostMini.textContent = `$${costMini.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} / tháng`;
        simCostSaved.textContent = `$${saved.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} (Tiết kiệm ${savedPct}%)`;
    }

    if (simDauSlider) simDauSlider.addEventListener('input', updateBudgetSimulator);
    if (simReqSlider) simReqSlider.addEventListener('input', updateBudgetSimulator);
    updateBudgetSimulator();

    // --- 1-Click Demo Presets ---
    const presetButtons = document.querySelectorAll('.preset-btn');
    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const promptText = btn.getAttribute('data-prompt');
            userInput.value = promptText;
            sendMessage();
        });
    });

    // --- Tab Navigation ---
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetTab = item.getAttribute('data-tab');
            navItems.forEach(i => i.classList.remove('active'));
            tabPages.forEach(p => p.classList.remove('active'));

            item.classList.add('active');
            document.getElementById(targetTab).classList.add('active');

            if (targetTab === 'dashboard-tab') {
                updateDashboard();
            }
        });
    });

    if (dashRefreshBtn) {
        dashRefreshBtn.addEventListener('click', updateDashboard);
    }

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

    // --- Speech Recognition (Voice Input) ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    let isRecording = false;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang = 'vi-VN';
        recognition.continuous = false;

        recognition.onstart = () => {
            isRecording = true;
            voiceRecBtn.classList.add('recording-active');
            voiceStatusText.innerHTML = '<i class="fa-solid fa-microphone"></i> Đang nghe... Hãy nói ngay!';
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            userInput.value = transcript;
            voiceStatusText.innerHTML = '<i class="fa-solid fa-check"></i> Đã nhận diện giọng nói!';
        };

        recognition.onerror = (event) => {
            voiceStatusText.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> Lỗi Mic: ${event.error}`;
        };

        recognition.onend = () => {
            isRecording = false;
            voiceRecBtn.classList.remove('recording-active');
            setTimeout(() => {
                voiceStatusText.innerHTML = '<i class="fa-solid fa-circle-dot"></i> Mic sẵn sàng';
            }, 3000);
        };
    }

    voiceRecBtn.addEventListener('click', () => {
        if (!recognition) {
            alert('Trình duyệt không hỗ trợ Web Speech API. Vui lòng dùng Chrome hoặc Edge.');
            return;
        }
        if (isRecording) {
            recognition.stop();
        } else {
            recognition.start();
        }
    });

    // --- Export Chat to Markdown ---
    exportChatBtn.addEventListener('click', () => {
        if (chatHistory.length === 0) {
            alert('Lịch sử hội thoại đang trống!');
            return;
        }

        let mdContent = `# Lịch Sử Hội Thoại Trợ Lý AI — DAY 01\n\n`;
        mdContent += `*Thời gian xuất:* ${new Date().toLocaleString()}\n`;
        mdContent += `*Tổng lượt chat:* ${turnCount} | *Tokens:* ${totalTokensUsed} | *Chi phí:* $${totalCostUSD.toFixed(6)}\n\n---\n\n`;

        chatHistory.forEach((msg) => {
            const roleName = msg.role === 'user' ? '👤 Người dùng' : '🤖 Trợ lý AI';
            mdContent += `### ${roleName}\n${msg.content}\n\n`;
        });

        const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat_history_${Date.now()}.md`;
        a.click();
        URL.revokeObjectURL(url);
    });

    // --- Chat Logic & Streaming with Telemetry (TTFT & tok/s) ---
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

        const startTime = performance.now();
        let firstTokenTime = null;
        let streamedChunkCount = 0;

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    persona: getActivePersona(),
                    user_msg: text,
                    history: chatHistory,
                    temperature: parseFloat(tempSlider ? tempSlider.value : 0.7),
                    top_p: parseFloat(toppSlider ? toppSlider.value : 0.9),
                    max_tokens: parseInt(maxtokSlider ? maxtokSlider.value : 512)
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
                                if (firstTokenTime === null) {
                                    firstTokenTime = performance.now();
                                    const ttftMs = Math.round(firstTokenTime - startTime);
                                    if (statTTFT) statTTFT.textContent = `${ttftMs} ms`;
                                }
                                streamedChunkCount += 1;
                                accumulatedReply += data.delta;
                                bubble.textContent = accumulatedReply;
                                chatViewport.scrollTop = chatViewport.scrollHeight;
                            } else if (data.type === 'done') {
                                const endTime = performance.now();
                                const durationSec = (endTime - (firstTokenTime || startTime)) / 1000;
                                const tokCount = data.completion_tokens || streamedChunkCount || 1;
                                const speedTokSec = durationSec > 0 ? (tokCount / durationSec).toFixed(1) : '45.0';
                                
                                if (statTokSpeed) statTokSpeed.textContent = `${speedTokSec} tok/s`;

                                chatHistory = data.history || [];
                                turnCount += 1;
                                totalTokensUsed += (data.tokens_used || 0);
                                promptTokensUsed += (data.prompt_tokens || 0);
                                completionTokensUsed += (data.completion_tokens || 0);
                                totalCostUSD += (data.total_cost || 0.0);
                                updateStats();
                                updateDashboard();
                                attachActionButtons(assistantMsgEl, accumulatedReply);
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

    function attachActionButtons(msgDiv, textContent) {
        const bubble = msgDiv.querySelector('.msg-bubble');
        if (msgDiv.querySelector('.msg-actions')) return;

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'msg-actions';
        actionsDiv.innerHTML = `
            <button class="action-btn speak-btn" title="Đọc văn bản (Text-to-Speech)">
                <i class="fa-solid fa-volume-high"></i> Đọc
            </button>
            <button class="action-btn copy-btn" title="Sao chép văn bản">
                <i class="fa-solid fa-copy"></i> Copy
            </button>
        `;

        bubble.appendChild(actionsDiv);

        actionsDiv.querySelector('.speak-btn').addEventListener('click', () => {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(textContent);
                utterance.lang = 'vi-VN';
                window.speechSynthesis.speak(utterance);
            } else {
                alert('Trình duyệt không hỗ trợ Text-to-Speech');
            }
        });

        actionsDiv.querySelector('.copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(textContent);
            alert('Đã sao chép câu trả lời vào bộ nhớ tạm!');
        });
    }

    function updateStats() {
        if (statTurns) statTurns.textContent = turnCount;
        if (statTokens) statTokens.textContent = totalTokensUsed.toLocaleString();
        if (statCost) statCost.textContent = `$${totalCostUSD.toFixed(6)}`;
        if (statHistoryLen) statHistoryLen.textContent = `${chatHistory.length} / 8 msgs`;
    }

    function updateDashboard() {
        if (!dashKpiTurns) return;
        dashKpiTurns.textContent = turnCount;
        dashKpiTokens.textContent = totalTokensUsed.toLocaleString();
        dashKpiTokBreakdown.textContent = `Prompt: ${promptTokensUsed.toLocaleString()} | Reply: ${completionTokensUsed.toLocaleString()}`;
        dashKpiCost.textContent = `$${totalCostUSD.toFixed(6)}`;

        const total = totalTokensUsed || 1;
        const promptPct = Math.round((promptTokensUsed / total) * 100);
        const replyPct = 100 - promptPct;
        dashTokenRatio.textContent = `${promptPct}% Input / ${replyPct}% Output`;
        dashProgressFill.style.width = `${promptPct}%`;

        const avgCostPerTurn = turnCount > 0 ? (totalCostUSD / turnCount) : 0.0015;
        const proj1k4o = avgCostPerTurn * 1000;
        const proj1kMiniVal = proj1k4o * 0.06;
        const proj10k4o = avgCostPerTurn * 10000;
        const proj10kMiniVal = proj10k4o * 0.06;

        proj1kGpt4o.textContent = `$${proj1k4o.toFixed(2)}`;
        proj1kMini.textContent = `$${proj1kMiniVal.toFixed(2)}`;
        proj10kGpt4o.textContent = `$${proj10k4o.toFixed(2)}`;
        proj10kMini.textContent = `$${proj10kMiniVal.toFixed(2)}`;
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

    if (runCompareBtn) {
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
    }

    // --- Batch Prompt Studio ---
    const runBatchBtn = document.getElementById('run-batch-btn');
    const batchPromptsInput = document.getElementById('batch-prompts-input');
    const batchTableOutput = document.getElementById('batch-table-output');

    if (runBatchBtn) {
        runBatchBtn.addEventListener('click', async () => {
            const rawText = batchPromptsInput.value.trim();
            if (!rawText) return;

            const prompts = rawText.split('\n').map(p => p.trim()).filter(p => p.length > 0);
            if (prompts.length === 0) return;

            batchTableOutput.textContent = `⏳ Đang xử lý Batch Compare cho ${prompts.length} prompts... Xin chờ trong giây lát...`;
            runBatchBtn.disabled = true;

            try {
                const res = await fetch('/api/batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompts })
                });

                const data = await res.json();
                if (data.table) {
                    batchTableOutput.textContent = data.table;
                } else if (data.error) {
                    batchTableOutput.textContent = `Lỗi: ${data.error}`;
                }
            } catch (err) {
                batchTableOutput.textContent = `Lỗi kết nối: ${err.message}`;
            } finally {
                runBatchBtn.disabled = false;
            }
        });
    }

    // --- Visual Tokenizer & Live Inspector ---
    const calcLiveText = document.getElementById('calc-live-text');
    const calcClearText = document.getElementById('calc-clear-text');

    const calcLiveTokens = document.getElementById('calc-live-tokens');
    const calcLiveWords = document.getElementById('calc-live-words');
    const calcLiveChars = document.getElementById('calc-live-chars');
    const tokenChipsContainer = document.getElementById('token-chips-container');

    const costGpt4oIn = document.getElementById('cost-gpt4o-in');
    const costGpt4oOut = document.getElementById('cost-gpt4o-out');
    const costMiniIn = document.getElementById('cost-mini-in');
    const costMiniOut = document.getElementById('cost-mini-out');

    let calcDebounceTimer = null;

    if (calcLiveText) {
        calcLiveText.addEventListener('input', () => {
            clearTimeout(calcDebounceTimer);
            calcDebounceTimer = setTimeout(updateLiveCalculator, 150);
        });
    }

    if (calcClearText) {
        calcClearText.addEventListener('click', () => {
            calcLiveText.value = '';
            updateLiveCalculator();
        });
    }

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
            tokenChipsContainer.innerHTML = '<span class="chip-placeholder">Các mảnh token màu sắc sẽ xuất hiện tại đây...</span>';
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

            const g4in = (tok / 1000) * 0.0025;
            const g4out = (tok / 1000) * 0.010;
            const minin = (tok / 1000) * 0.00015;
            const minout = (tok / 1000) * 0.0006;

            costGpt4oIn.textContent = `$${g4in.toFixed(6)}`;
            costGpt4oOut.textContent = `$${g4out.toFixed(6)}`;
            costMiniIn.textContent = `$${minin.toFixed(6)}`;
            costMiniOut.textContent = `$${minout.toFixed(6)}`;

            const tokRes = await fetch('/api/tokenize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });

            const tokData = await tokRes.json();
            if (tokData.tokens && tokData.tokens.length > 0) {
                tokenChipsContainer.innerHTML = '';
                tokData.tokens.forEach((t, i) => {
                    const chip = document.createElement('span');
                    chip.className = `token-chip chip-c${i % 5}`;
                    chip.title = `Token ID: ${t.id}`;
                    chip.textContent = t.piece.replace(/\n/g, '↵');
                    tokenChipsContainer.appendChild(chip);
                });
            }

        } catch (err) {
            console.error('Calculator error:', err);
        }
    }

    // Initialize Dashboard on page load
    updateDashboard();
});
