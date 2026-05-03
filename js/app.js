document.addEventListener('DOMContentLoaded', () => {
    let testData = null;
    let currentModuleIndex = 0;
    let currentQuestionIndex = 0;
    let answers = {};
    let markedQuestions = new Set();
    let isReviewMode = false;
    let timer = null;
    let breakTimer = null;
    let currentStudentName = "";

    // DOM Elements
    const views = {
        dashboard: document.getElementById('dashboard-view'),
        intro: document.getElementById('intro-view'),
        exam: document.getElementById('exam-view'),
        break: document.getElementById('break-view'),
        result: document.getElementById('result-view'),
        history: document.getElementById('history-view')
    };

    const header = {
        main: document.getElementById('app-header'),
        title: document.getElementById('test-title'),
        moduleName: document.getElementById('current-module-name'),
        timerContainer: document.getElementById('timer-container'),
        timeDisplay: document.getElementById('time-display'),
        toggleTimerBtn: document.getElementById('toggle-timer-btn'),
        finishBtn: document.getElementById('finish-module-btn')
    };

    const footer = {
        main: document.getElementById('app-footer'),
        qNum: document.getElementById('footer-q-num'),
        navBtn: document.getElementById('nav-btn'),
        navDropdown: document.getElementById('nav-dropdown'),
        navGrid: document.getElementById('nav-grid'),
        prevBtn: document.getElementById('prev-btn'),
        nextBtn: document.getElementById('next-btn')
    };

    const examUI = {
        passagePanel: document.getElementById('passage-panel'),
        passageText: document.getElementById('passage-text'),
        qNumBadge: document.getElementById('q-num-badge'),
        markBtn: document.getElementById('mark-review-btn'),
        questionText: document.getElementById('question-text'),
        choicesContainer: document.getElementById('choices-container'),
        gridInContainer: document.getElementById('grid-in-container'),
        gridInInput: document.getElementById('grid-in-input'),
        explanationContainer: document.getElementById('explanation-container'),
        explanationText: document.getElementById('explanation-text')
    };

    // Initialize
    async function initDashboard() {
        initEventHandlers();
        
        try {
            const grid = document.getElementById('test-grid');
            if (window.supabaseClient) {
                const { data, error } = await window.supabaseClient.from('sat_tests').select('id, title').order('id');
                if (error) throw error;
                renderTestGrid(data);
            } else {
                // Fallback to local
                renderTestGrid([{id: 'test4', title: 'SAT Practice Test 4'}]);
            }
        } catch (err) {
            console.error("Error loading tests from Supabase:", err);
            renderTestGrid([{id: 'test4', title: 'SAT Practice Test 4'}]);
        }
    }
    
    function renderTestGrid(tests) {
        const grid = document.getElementById('test-grid');
        grid.innerHTML = '';
        tests.forEach(t => {
            const card = document.createElement('div');
            card.className = 'test-card';
            card.innerHTML = `<h3>${t.title}</h3><span>Full-length digital practice test</span>`;
            card.addEventListener('click', () => loadAndStartTest(t.id));
            grid.appendChild(card);
        });
    }

    async function loadAndStartTest(testId) {
        try {
            document.getElementById('test-title').textContent = "Loading...";
            if (window.supabaseClient) {
                const { data, error } = await window.supabaseClient.from('sat_tests').select('content').eq('id', testId).single();
                if (error) throw error;
                testData = data.content;
            } else {
                const res = await fetch(`data/${testId}_parsed.json`);
                testData = await res.json();
            }
            
            document.getElementById('test-title').textContent = testData.title || "SAT Practice Test";
            switchView('intro');
        } catch (err) {
            console.error("Error loading specific test data:", err);
            alert("Could not load this test.");
        }
    }

    // Initialize app
    initDashboard();
    checkSavedProgress();

    function checkSavedProgress() {
        const saved = StorageManager.getSavedProgress();
        const container = document.getElementById('resume-test-container');
        if (saved) {
            container.classList.remove('hidden');
            const modName = saved.testData.modules[saved.currentModuleIndex].name;
            document.getElementById('resume-test-info').textContent = `${saved.testData.title || 'SAT Practice Test'} - ${modName}`;
        } else {
            container.classList.add('hidden');
        }
    }

    function saveProgressAndExit() {
        if (!timer) return;
        
        const stateToSave = {
            currentStudentName,
            testData,
            currentModuleIndex,
            currentQuestionIndex,
            answers,
            markedQuestions: Array.from(markedQuestions),
            remainingSeconds: timer.remainingSeconds
        };
        
        StorageManager.saveProgress(stateToSave);
        
        if (timer) timer.stop();
        if (breakTimer) clearInterval(breakTimer);
        
        // Anti-Cheat: Exit Fullscreen when exiting
        try {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else if (document.webkitFullscreenElement) {
                document.webkitExitFullscreen();
            }
        } catch (e) {}
        
        switchView('dashboard');
        checkSavedProgress();
    }

    function resumeSavedTest() {
        const saved = StorageManager.getSavedProgress();
        if (!saved) return;
        
        currentStudentName = saved.currentStudentName;
        testData = saved.testData;
        currentModuleIndex = saved.currentModuleIndex;
        currentQuestionIndex = saved.currentQuestionIndex;
        answers = saved.answers || {};
        markedQuestions = new Set(saved.markedQuestions || []);
        isReviewMode = false;
        
        document.getElementById('test-title').textContent = testData.title || "SAT Practice Test";
        
        // Switch to exam
        switchView('exam');
        header.moduleName.textContent = testData.modules[currentModuleIndex].name;
        
        // Re-initialize timer
        if (timer) timer.stop();
        timer = new Timer(header.timeDisplay, () => finishCurrentModule(true));
        
        // Timer takes minutes, so convert seconds back to minutes for start()
        timer.start(Math.ceil(saved.remainingSeconds / 60)); // start loosely
        timer.remainingSeconds = saved.remainingSeconds; // override with precise seconds
        timer.updateDisplay();
        
        // Anti-Cheat: Request Fullscreen
        try {
            const el = document.documentElement;
            if (el.requestFullscreen) {
                el.requestFullscreen().catch(err => {});
            }
        } catch(e) {}
        
        renderQuestion();
        updateNavGrid();
        
        // Show Save & Exit button
        document.getElementById('save-exit-btn').classList.remove('hidden');
    }

    function discardSavedTest() {
        if (confirm("Are you sure you want to discard your saved progress? This cannot be undone.")) {
            StorageManager.clearSavedProgress();
            checkSavedProgress();
        }
    }

    function switchView(viewName) {
        Object.values(views).forEach(v => v.classList.remove('active'));
        views[viewName].classList.add('active');

        if (viewName === 'exam') {
            header.timerContainer.classList.remove('hidden');
            header.finishBtn.classList.remove('hidden');
            footer.main.classList.remove('hidden');
            // document.getElementById('save-exit-btn').classList.remove('hidden'); // handled in startModule/resume
        } else {
            header.timerContainer.classList.add('hidden');
            header.finishBtn.classList.add('hidden');
            footer.main.classList.add('hidden');
            header.moduleName.textContent = '';
            document.getElementById('save-exit-btn').classList.add('hidden');
        }
    }

    function initEventHandlers() {
        document.getElementById('start-test-btn').addEventListener('click', () => {
            document.getElementById('student-name-input').value = "";
            document.getElementById('student-name-modal').classList.remove('hidden');
        });

        document.getElementById('cancel-name-btn').addEventListener('click', () => {
            document.getElementById('student-name-modal').classList.add('hidden');
        });

        document.getElementById('confirm-name-btn').addEventListener('click', () => {
            const nameInput = document.getElementById('student-name-input').value.trim();
            if (!nameInput) {
                alert("Please enter your name to begin.");
                return;
            }
            currentStudentName = nameInput;
            document.getElementById('student-name-modal').classList.add('hidden');
            startTest();
        });

        if(document.getElementById('view-history-btn')) document.getElementById('view-history-btn').addEventListener('click', showHistory);
        if(document.getElementById('dashboard-view-history-btn')) document.getElementById('dashboard-view-history-btn').addEventListener('click', showHistory);
        document.getElementById('history-back-btn').addEventListener('click', () => switchView('dashboard'));
        if(document.getElementById('back-to-dashboard-btn')) document.getElementById('back-to-dashboard-btn').addEventListener('click', () => switchView('dashboard'));
        
        document.getElementById('clear-history-btn').addEventListener('click', () => {
            if (confirm("Are you sure you want to delete all your local history?")) {
                StorageManager.clearHistory();
                showHistory(); // Refresh view
            }
        });

        document.getElementById('save-exit-btn').addEventListener('click', saveProgressAndExit);
        document.getElementById('resume-saved-test-btn').addEventListener('click', resumeSavedTest);
        document.getElementById('discard-saved-test-btn').addEventListener('click', discardSavedTest);
        
        document.getElementById('resume-test-btn').addEventListener('click', () => {
            if (breakTimer) clearInterval(breakTimer);
            startModule(2); // Start Math 1 (index 2)
        });
        document.getElementById('review-test-btn').addEventListener('click', startReview);
        document.getElementById('back-home-btn').addEventListener('click', () => {
            isReviewMode = false;
            switchView('dashboard');
        });

        header.toggleTimerBtn.addEventListener('click', () => {
            if (timer) {
                const isHidden = timer.toggleVisibility();
                header.toggleTimerBtn.textContent = isHidden ? "Show" : "Hide";
            }
        });

        header.finishBtn.addEventListener('click', finishCurrentModule);
        footer.prevBtn.addEventListener('click', () => navigateTo(currentQuestionIndex - 1));
        footer.nextBtn.addEventListener('click', () => navigateTo(currentQuestionIndex + 1));
        
        examUI.markBtn.addEventListener('click', toggleMark);
        footer.navBtn.addEventListener('click', () => footer.navDropdown.classList.toggle('hidden'));
        
        // Hide nav dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!footer.navBtn.contains(e.target) && !footer.navDropdown.contains(e.target)) {
                footer.navDropdown.classList.add('hidden');
            }
        });

        examUI.gridInInput.addEventListener('input', (e) => {
            if (isReviewMode) return;
            const q = getCurrentQuestion();
            answers[q.id] = e.target.value.trim();
            updateNavGrid();
        });

        // Anti-Cheat: Overlay Dismissal
        document.getElementById('return-exam-btn').addEventListener('click', () => {
            document.getElementById('anti-cheat-overlay').classList.add('hidden');
            // Try to reclaim fullscreen
            try {
                if (document.documentElement.requestFullscreen) {
                    document.documentElement.requestFullscreen();
                }
            } catch(e) {}
        });

        // Anti-Cheat: Focus Tracking
        window.addEventListener('blur', handleFocusLoss);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                handleFocusLoss();
            }
        });

        // Anti-Cheat: Prevent Context Menu (Right Click)
        document.addEventListener('contextmenu', e => {
            if (!isReviewMode && views.exam.classList.contains('active')) {
                e.preventDefault();
            }
        });

        // Anti-Cheat: Prevent Copy/Paste and F12
        document.addEventListener('keydown', e => {
            if (!isReviewMode && views.exam.classList.contains('active')) {
                // Prevent F12
                if (e.key === 'F12') e.preventDefault();
                // Prevent Ctrl+C, Ctrl+V, Ctrl+P, Cmd+C, Cmd+V, Cmd+P
                if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'p'].includes(e.key.toLowerCase())) {
                    e.preventDefault();
                }
            }
        });
    }

    function handleFocusLoss() {
        // Only trigger warning if they are currently taking a test (not in review mode, not in intro/result/dashboard)
        if (!isReviewMode && views.exam.classList.contains('active')) {
            document.getElementById('anti-cheat-overlay').classList.remove('hidden');
        }
    }

    function startTest() {
        answers = {};
        markedQuestions.clear();
        isReviewMode = false;
        
        // Anti-Cheat: Request Fullscreen
        try {
            const el = document.documentElement;
            let fsPromise = null;
            if (el.requestFullscreen) {
                fsPromise = el.requestFullscreen();
            } else if (el.webkitRequestFullscreen) { // Safari
                fsPromise = el.webkitRequestFullscreen();
            }
            
            if (fsPromise !== undefined && fsPromise !== null) {
                fsPromise.catch(err => {
                    console.error("Fullscreen request failed:", err);
                    alert("Please enable Fullscreen manually (F11 or View -> Enter Full Screen) for the best exam experience.");
                });
            }
        } catch (err) {
            console.error("Fullscreen API error:", err);
        }

        startModule(0);
    }

    function startModule(moduleIndex) {
        if (moduleIndex >= testData.modules.length) {
            endTest();
            return;
        }

        // Handle break between module 1 (RW2) and 2 (Math1)
        if (moduleIndex === 2 && currentModuleIndex === 1 && !isReviewMode) {
            startBreak();
            currentModuleIndex = moduleIndex;
            return;
        }

        currentModuleIndex = moduleIndex;
        currentQuestionIndex = 0;
        const module = testData.modules[currentModuleIndex];
        
        header.moduleName.textContent = module.name;
        header.finishBtn.textContent = isReviewMode ? "Next Module" : "Next Module (Finish)";

        switchView('exam');
        document.getElementById('save-exit-btn').classList.remove('hidden');
        buildNavGrid();
        renderQuestion();

        if (!isReviewMode) {
            if (timer) timer.stop();
            timer = new Timer(header.timeDisplay, () => finishCurrentModule(true));
            timer.start(module.timeLimit);
        }
    }

    function startBreak() {
        switchView('break');
        let breakSeconds = 10 * 60;
        const display = document.getElementById('break-timer');
        
        if (breakTimer) clearInterval(breakTimer);
        breakTimer = setInterval(() => {
            breakSeconds--;
            const m = Math.floor(breakSeconds / 60);
            const s = breakSeconds % 60;
            display.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            if (breakSeconds <= 0) {
                clearInterval(breakTimer);
                startModule(2);
            }
        }, 1000);
    }

    function finishCurrentModule(force = false) {
        if (!isReviewMode && !force) {
            const modal = document.getElementById('confirm-modal');
            modal.classList.remove('hidden');
            
            document.getElementById('modal-cancel-btn').onclick = () => {
                modal.classList.add('hidden');
            };
            
            document.getElementById('modal-confirm-btn').onclick = () => {
                modal.classList.add('hidden');
                if (timer) timer.stop();
                startModule(currentModuleIndex + 1);
            };
        } else {
            if (timer) timer.stop();
            startModule(currentModuleIndex + 1);
        }
    }

    function endTest() {
        // Anti-Cheat: Exit Fullscreen when test ends
        try {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else if (document.webkitFullscreenElement) {
                document.webkitExitFullscreen();
            }
        } catch (e) {}

        document.getElementById('save-exit-btn').classList.add('hidden');

        if (!isReviewMode) {
            StorageManager.clearSavedProgress();
            const results = ScoringManager.calculateScore(answers, testData);
            StorageManager.saveTestResult(results);
            displayResults(results);

            // Upload to Supabase Cloud Score Tracking
            if (window.supabaseClient && currentStudentName) {
                const cloudResult = {
                    student_name: currentStudentName,
                    test_id: results.testId,
                    total_score: results.total,
                    rw_score: results.rw,
                    math_score: results.math
                };
                window.supabaseClient.from('student_results').insert([cloudResult])
                    .then(({ error }) => {
                        if (error) console.error("Error saving score to cloud:", error);
                        else console.log("Score successfully saved to cloud.");
                    });
            }
        } else {
            switchView('result');
        }
    }

    function displayResults(results) {
        document.getElementById('total-score-val').textContent = results.total;
        document.getElementById('rw-score-val').textContent = results.rw;
        document.getElementById('math-score-val').textContent = results.math;
        switchView('result');
    }

    function getCurrentQuestion() {
        return testData.modules[currentModuleIndex].questions[currentQuestionIndex];
    }

    function renderQuestion() {
        const module = testData.modules[currentModuleIndex];
        const q = module.questions[currentQuestionIndex];
        
        // Update footer and headers
        footer.qNum.textContent = `Question ${currentQuestionIndex + 1} of ${module.questions.length}`;
        examUI.qNumBadge.textContent = currentQuestionIndex + 1;
        
        // Buttons state
        footer.prevBtn.disabled = currentQuestionIndex === 0;
        if (currentQuestionIndex === module.questions.length - 1) {
            footer.nextBtn.textContent = "Finish Module";
        } else {
            footer.nextBtn.textContent = "Next";
        }

        // Mark state
        if (markedQuestions.has(q.id)) {
            examUI.markBtn.classList.add('marked');
        } else {
            examUI.markBtn.classList.remove('marked');
        }

        // Passage
        if (q.passage) {
            examUI.passagePanel.classList.remove('hidden');
            examUI.passageText.innerHTML = marked.parse(q.passage || '');
        } else {
            examUI.passagePanel.classList.add('hidden');
        }

        // Question
        examUI.questionText.innerHTML = marked.parse(q.question || '');

        // Input type
        if (q.type === 'multiple-choice') {
            examUI.choicesContainer.classList.remove('hidden');
            examUI.gridInContainer.classList.add('hidden');
            renderChoices(q);
        } else {
            examUI.choicesContainer.classList.add('hidden');
            examUI.gridInContainer.classList.remove('hidden');
            examUI.gridInInput.value = answers[q.id] || '';
            examUI.gridInInput.disabled = isReviewMode;
            
            // Review logic for grid in
            if (isReviewMode) {
                examUI.gridInInput.classList.remove('correct', 'incorrect');
                if (answers[q.id] === q.correctAnswer) {
                    examUI.gridInInput.style.borderColor = 'var(--success)';
                } else {
                    examUI.gridInInput.style.borderColor = 'var(--error)';
                }
            } else {
                examUI.gridInInput.style.borderColor = '';
            }
        }

        // Explanation
        if (isReviewMode) {
            examUI.explanationContainer.classList.remove('hidden');
            const explanationHtml = q.explanation ? marked.parse(q.explanation) : '';
            examUI.explanationText.innerHTML = `<strong>Correct Answer: ${q.correctAnswer}</strong><br><br>${explanationHtml}`;
        } else {
            examUI.explanationContainer.classList.add('hidden');
        }

        updateNavGrid();
        
        if (window.MathJax) {
            MathJax.typesetPromise();
        }
    }

    function renderChoices(q) {
        examUI.choicesContainer.innerHTML = '';
        const currentAnswer = answers[q.id];

        q.choices.forEach(choice => {
            const letter = choice.charAt(0);
            const label = document.createElement('label');
            label.className = 'choice-label';
            
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'q-choice';
            radio.value = letter;
            radio.disabled = isReviewMode;
            
            if (currentAnswer === letter) {
                radio.checked = true;
                label.classList.add('selected');
            }

            // Review Mode Styling
            if (isReviewMode) {
                if (letter === q.correctAnswer) {
                    label.classList.add(currentAnswer === letter ? 'correct' : 'correct-missed');
                } else if (currentAnswer === letter && currentAnswer !== q.correctAnswer) {
                    label.classList.add('incorrect');
                }
            }

            radio.addEventListener('change', () => {
                if (!isReviewMode) {
                    answers[q.id] = letter;
                    document.querySelectorAll('.choice-label').forEach(l => l.classList.remove('selected'));
                    label.classList.add('selected');
                    updateNavGrid();
                }
            });

            const text = document.createElement('span');
            text.className = 'choice-text';
            text.innerHTML = marked.parse(choice || ''); // Convert markdown to HTML

            label.appendChild(radio);
            label.appendChild(text);
            examUI.choicesContainer.appendChild(label);
        });
    }

    function toggleMark() {
        const qId = getCurrentQuestion().id;
        if (markedQuestions.has(qId)) {
            markedQuestions.delete(qId);
            examUI.markBtn.classList.remove('marked');
        } else {
            markedQuestions.add(qId);
            examUI.markBtn.classList.add('marked');
        }
        updateNavGrid();
    }

    function navigateTo(index) {
        const module = testData.modules[currentModuleIndex];
        if (index === module.questions.length) {
            finishCurrentModule();
        } else if (index >= 0 && index < module.questions.length) {
            currentQuestionIndex = index;
            renderQuestion();
        }
    }

    function buildNavGrid() {
        const module = testData.modules[currentModuleIndex];
        footer.navGrid.innerHTML = '';
        
        module.questions.forEach((q, idx) => {
            const item = document.createElement('div');
            item.className = 'nav-grid-item';
            item.textContent = idx + 1;
            item.addEventListener('click', () => navigateTo(idx));
            footer.navGrid.appendChild(item);
        });
        updateNavGrid();
    }

    function updateNavGrid() {
        const module = testData.modules[currentModuleIndex];
        const items = footer.navGrid.children;
        
        module.questions.forEach((q, idx) => {
            const item = items[idx];
            item.className = 'nav-grid-item'; // Reset
            
            if (idx === currentQuestionIndex) item.classList.add('current');
            if (answers[q.id]) item.classList.add('answered');
            if (markedQuestions.has(q.id)) item.classList.add('marked');
            
            // In review mode, show red/green on nav grid
            if (isReviewMode) {
                if (answers[q.id] === q.correctAnswer) {
                    item.style.backgroundColor = 'var(--success)';
                    item.style.borderColor = 'var(--success)';
                    item.style.color = 'white';
                } else {
                    item.style.backgroundColor = 'var(--error)';
                    item.style.borderColor = 'var(--error)';
                    item.style.color = 'white';
                }
            }
        });
    }

    function startReview() {
        isReviewMode = true;
        startModule(0);
    }

    function showHistory() {
        const history = StorageManager.getHistory();
        const tbody = document.getElementById('history-tbody');
        tbody.innerHTML = '';

        if (history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No tests taken yet.</td></tr>';
        } else {
            history.forEach(h => {
                const tr = document.createElement('tr');
                const date = new Date(h.date).toLocaleDateString();
                tr.innerHTML = `
                    <td>${date}</td>
                    <td><strong>${h.total}</strong></td>
                    <td>${h.rw}</td>
                    <td>${h.math}</td>
                    <td><button class="view-btn" onclick="appLoadHistoryResult('${h.id}')">View</button></td>
                `;
                tbody.appendChild(tr);
            });
        }
        switchView('history');
    }

    // Expose for inline onclick
    window.appLoadHistoryResult = function(id) {
        const res = StorageManager.getResultById(id);
        if (res) {
            displayResults(res);
        }
    };
});
