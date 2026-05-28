document.addEventListener('DOMContentLoaded', () => {
    // State Variables
    let currentStudentName = "";
    let availableTests = [];
    let loadedTests = {}; // Cache for test contents: { testId: testData }
    let drillResults = {}; // Progress/scores cache: { drillKey: scoreString }
    
    let activeTestId = "";
    let activeTestTitle = "";
    let activeModuleId = "";
    let activeModuleName = "";
    let activeDrillIndex = -1;
    let activeQuestions = [];
    let activeAnswers = {};
    let currentQuestionIndex = 0;
    
    // DOM Elements
    const elements = {
        studentModal: document.getElementById('student-name-modal'),
        studentInput: document.getElementById('student-name-input'),
        confirmNameBtn: document.getElementById('confirm-name-btn'),
        cancelNameBtn: document.getElementById('cancel-name-btn'),
        changeNameBtn: document.getElementById('change-name-btn'),
        sidebarStudentName: document.getElementById('sidebar-student-name-val'),
        sidebarTree: document.getElementById('sidebar-tree'),
        testTitle: document.getElementById('test-title'),
        drillBadge: document.getElementById('current-drill-badge'),
        backDashboardBtn: document.getElementById('back-dashboard-btn'),
        
        passagePanel: document.getElementById('passage-panel'),
        passageText: document.getElementById('passage-text'),
        qNumBadge: document.getElementById('q-num-badge'),
        questionText: document.getElementById('question-text'),
        choicesContainer: document.getElementById('choices-container'),
        gridInContainer: document.getElementById('grid-in-container'),
        gridInInput: document.getElementById('grid-in-input'),
        checkAnswerBtn: document.getElementById('check-answer-btn'),
        gridInFeedback: document.getElementById('grid-in-feedback'),
        
        explanationContainer: document.getElementById('explanation-container'),
        explanationText: document.getElementById('explanation-text'),
        
        translateQuestionBtn: document.getElementById('translate-question-btn'),
        questionTranslation: document.getElementById('question-translation'),
        translateExplanationBtn: document.getElementById('translate-explanation-btn'),
        explanationTranslation: document.getElementById('explanation-translation'),
        
        footerQNum: document.getElementById('footer-q-num'),
        drillPagination: document.getElementById('drill-pagination'),
        prevBtn: document.getElementById('prev-btn'),
        nextBtn: document.getElementById('next-btn'),
        finishDrillBtn: document.getElementById('finish-drill-btn'),
        
        summaryModal: document.getElementById('drill-summary-modal'),
        scoreDisplay: document.getElementById('drill-score-display'),
        percentDisplay: document.getElementById('drill-percent-display'),
        summaryReviewBtn: document.getElementById('summary-review-btn'),
        summaryDashboardBtn: document.getElementById('summary-dashboard-btn')
    };

    // Initialize
    async function init() {
        initEventHandlers();
        checkStudentName();
    }

    // Student Name Check & Modal
    function checkStudentName() {
        const savedName = localStorage.getItem('sat_student_name');
        if (savedName) {
            currentStudentName = savedName;
            elements.sidebarStudentName.textContent = currentStudentName;
            loadDrillProgressAndTests();
        } else {
            showStudentNameModal(false); // Force enter name, cannot cancel easily
        }
    }

    function showStudentNameModal(allowCancel = true) {
        elements.studentInput.value = currentStudentName;
        elements.studentModal.classList.remove('hidden');
        if (allowCancel) {
            elements.cancelNameBtn.classList.remove('hidden');
        } else {
            elements.cancelNameBtn.classList.add('hidden');
        }
    }

    // Fetch tests and student drill progress
    async function loadDrillProgressAndTests() {
        elements.sidebarTree.innerHTML = '<div style="padding: 10px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">Loading tests...</div>';
        
        try {
            // 1. Fetch completed drills from Supabase to show scores in sidebar
            if (window.supabaseClient && currentStudentName) {
                const { data, error } = await window.supabaseClient
                    .from('student_results')
                    .select('test_id, total_score, raw_details')
                    .eq('student_name', currentStudentName);
                
                if (!error && data) {
                    data.forEach(row => {
                        // Check if it's a drill record
                        if (row.raw_details && row.raw_details.type === 'drill') {
                            const drillKey = row.test_id; // e.g. test4_mod1_drill0
                            const correct = row.total_score;
                            const total = row.raw_details.questions_count || 5;
                            drillResults[drillKey] = `${correct}/${total}`;
                        }
                    });
                }
            } else {
                // Read from local storage fallback
                const localDrills = localStorage.getItem('sat_drill_history');
                if (localDrills) {
                    const parsed = JSON.parse(localDrills);
                    parsed.forEach(d => {
                        if (d.student_name === currentStudentName) {
                            const drillKey = d.drill_key;
                            drillResults[drillKey] = `${d.correct}/${d.total}`;
                        }
                    });
                }
            }

            // 2. Fetch available tests list
            if (window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('sat_tests')
                    .select('id, title')
                    .order('id');
                if (error) throw error;
                
                // Sort tests numerically
                data.sort((a, b) => {
                    const numA = parseInt(a.id.replace(/\D/g, '')) || 0;
                    const numB = parseInt(b.id.replace(/\D/g, '')) || 0;
                    return numA - numB;
                });
                
                availableTests = data;
            } else {
                // Local fallbacks
                availableTests = [
                    { id: 'test4', title: 'SAT Practice Test 4' },
                    { id: 'test8', title: 'SAT Practice Test 8' },
                    { id: 'test9', title: 'SAT Practice Test 9' },
                    { id: 'test10', title: 'SAT Practice Test 10' },
                    { id: 'test11', title: 'SAT Practice Test 11' }
                ];
            }
            
            renderTreeSidebar();
        } catch (err) {
            console.error("Error initializing practice data:", err);
            elements.sidebarTree.innerHTML = '<div style="padding: 10px; text-align: center; color: var(--error); font-size: 0.9rem;">Error loading tests. Check configuration.</div>';
        }
    }

    // Render hierarchical tree sidebar
    function renderTreeSidebar() {
        elements.sidebarTree.innerHTML = '';
        const rootUl = document.createElement('ul');
        rootUl.className = 'tree-list';
        
        availableTests.forEach(test => {
            const testLi = document.createElement('li');
            testLi.className = 'tree-item';
            
            const testNode = document.createElement('div');
            testNode.className = 'tree-node';
            testNode.dataset.testId = test.id;
            testNode.innerHTML = `
                <span class="tree-toggle-icon">▶</span>
                <span class="tree-node-icon">📁</span>
                <span class="tree-node-title">${test.title}</span>
            `;
            
            // Sub-list for modules (initially hidden)
            const subUl = document.createElement('ul');
            subUl.className = 'tree-list hidden';
            
            testNode.addEventListener('click', async () => {
                const toggle = testNode.querySelector('.tree-toggle-icon');
                const isExpanded = !subUl.classList.contains('hidden');
                
                if (isExpanded) {
                    subUl.classList.add('hidden');
                    toggle.classList.remove('open');
                } else {
                    subUl.classList.remove('hidden');
                    toggle.classList.add('open');
                    
                    // Lazy-load test questions and render modules if not done yet
                    if (!loadedTests[test.id]) {
                        subUl.innerHTML = '<li class="tree-item" style="padding-left:20px; font-size:0.85rem; color:var(--text-muted);">Loading modules...</li>';
                        try {
                            let testData;
                            if (window.supabaseClient) {
                                const { data, error } = await window.supabaseClient
                                    .from('sat_tests')
                                    .select('content')
                                    .eq('id', test.id)
                                    .single();
                                if (error) throw error;
                                testData = data.content;
                            } else {
                                const res = await fetch(`data/${test.id}_parsed.json`);
                                testData = await res.json();
                            }
                            loadedTests[test.id] = testData;
                            renderModulesAndDrills(test.id, subUl);
                        } catch (err) {
                            console.error(`Error loading test ${test.id}:`, err);
                            subUl.innerHTML = '<li class="tree-item" style="padding-left:20px; font-size:0.85rem; color:var(--error);">Failed to load modules</li>';
                        }
                    } else {
                        // Already loaded, just render (handles refresh of scores)
                        renderModulesAndDrills(test.id, subUl);
                    }
                }
            });
            
            testLi.appendChild(testNode);
            testLi.appendChild(subUl);
            rootUl.appendChild(testLi);
        });
        
        elements.sidebarTree.appendChild(rootUl);
    }

    // Render modules and their 5-question drills
    function renderModulesAndDrills(testId, containerUl) {
        containerUl.innerHTML = '';
        const testData = loadedTests[testId];
        if (!testData || !testData.modules) return;
        
        testData.modules.forEach((module, modIdx) => {
            const modLi = document.createElement('li');
            modLi.className = 'tree-item';
            
            const modNode = document.createElement('div');
            modNode.className = 'tree-node';
            modNode.style.paddingLeft = '20px';
            modNode.innerHTML = `
                <span class="tree-toggle-icon">▶</span>
                <span class="tree-node-icon">📘</span>
                <span class="tree-node-title" style="font-weight: 500;">${module.name}</span>
            `;
            
            const drillUl = document.createElement('ul');
            drillUl.className = 'tree-list hidden';
            
            modNode.addEventListener('click', (e) => {
                e.stopPropagation();
                const toggle = modNode.querySelector('.tree-toggle-icon');
                const isExpanded = !drillUl.classList.contains('hidden');
                
                if (isExpanded) {
                    drillUl.classList.add('hidden');
                    toggle.classList.remove('open');
                } else {
                    drillUl.classList.remove('hidden');
                    toggle.classList.add('open');
                }
            });
            
            // Generate drills (5 questions each)
            const questions = module.questions || [];
            const DRILL_SIZE = 5;
            const numDrills = Math.ceil(questions.length / DRILL_SIZE);
            
            for (let d = 0; d < numDrills; d++) {
                const drillLi = document.createElement('li');
                drillLi.className = 'tree-item';
                
                const startQ = d * DRILL_SIZE + 1;
                const endQ = Math.min(questions.length, (d + 1) * DRILL_SIZE);
                const drillName = `Drill ${d + 1} (Q${startQ} - Q${endQ})`;
                const drillKey = `${testId}_mod${modIdx}_drill${d}`;
                
                // Show completion score if exists
                const scoreStr = drillResults[drillKey] || '';
                const scoreHtml = scoreStr ? `<span class="drill-status-badge">${scoreStr}</span>` : '';
                
                const drillNode = document.createElement('div');
                drillNode.className = 'tree-node';
                drillNode.style.paddingLeft = '40px';
                
                // Keep active state highlighted if selected
                if (activeTestId === testId && activeModuleId === `mod${modIdx}` && activeDrillIndex === d) {
                    drillNode.classList.add('active-drill');
                }
                
                drillNode.innerHTML = `
                    <span class="tree-node-icon">📄</span>
                    <span class="tree-node-title">${drillName}</span>
                    ${scoreHtml}
                `;
                
                drillNode.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Clear previous active highlights
                    document.querySelectorAll('.active-drill').forEach(el => el.classList.remove('active-drill'));
                    drillNode.classList.add('active-drill');
                    
                    startDrill(testId, testData.title, `mod${modIdx}`, module.name, d);
                });
                
                drillLi.appendChild(drillNode);
                drillUl.appendChild(drillLi);
            }
            
            modLi.appendChild(modNode);
            modLi.appendChild(drillUl);
            containerUl.appendChild(modLi);
        });
    }

    // Start a 5-question drill
    function startDrill(testId, testTitle, moduleId, moduleName, drillIdx) {
        activeTestId = testId;
        activeTestTitle = testTitle;
        activeModuleId = moduleId;
        activeModuleName = moduleName;
        activeDrillIndex = drillIdx;
        
        const testData = loadedTests[testId];
        const module = testData.modules.find(m => testData.modules.indexOf(m) === parseInt(moduleId.replace('mod', '')));
        
        const DRILL_SIZE = 5;
        const allQuestions = module.questions || [];
        activeQuestions = allQuestions.slice(drillIdx * DRILL_SIZE, (drillIdx + 1) * DRILL_SIZE);
        
        // Reset answers & UI state
        activeAnswers = {};
        currentQuestionIndex = 0;
        
        // Update header & badges
        elements.testTitle.textContent = testTitle;
        elements.drillBadge.textContent = `${moduleName} - Drill ${drillIdx + 1}`;
        elements.drillBadge.classList.remove('hidden');
        
        // Set up pagination footer indicators
        elements.drillPagination.innerHTML = '';
        activeQuestions.forEach((_, idx) => {
            const btn = document.createElement('button');
            btn.className = 'nav-grid-item';
            btn.textContent = idx + 1;
            btn.addEventListener('click', () => navigateTo(idx));
            elements.drillPagination.appendChild(btn);
        });
        
        elements.finishDrillBtn.classList.add('hidden');
        
        navigateTo(0);
    }

    // Render single question
    function renderQuestion() {
        if (activeQuestions.length === 0) return;
        
        const q = activeQuestions[currentQuestionIndex];
        const isAnswered = activeAnswers.hasOwnProperty(q.id);
        const selectedVal = activeAnswers[q.id];
        
        // Update footer texts
        elements.footerQNum.textContent = `Question ${currentQuestionIndex + 1} of ${activeQuestions.length}`;
        elements.qNumBadge.textContent = currentQuestionIndex + 1;
        
        // Update active page dot
        const dots = elements.drillPagination.children;
        for (let i = 0; i < dots.length; i++) {
            dots[i].classList.remove('current');
            // Style dot with success or error if already answered
            const dotQ = activeQuestions[i];
            dots[i].style.backgroundColor = '';
            dots[i].style.borderColor = '';
            dots[i].style.color = '';
            
            if (activeAnswers.hasOwnProperty(dotQ.id)) {
                const wasCorrect = activeAnswers[dotQ.id] === dotQ.correctAnswer;
                dots[i].style.backgroundColor = wasCorrect ? 'var(--success)' : 'var(--error)';
                dots[i].style.borderColor = wasCorrect ? 'var(--success)' : 'var(--error)';
                dots[i].style.color = 'white';
            }
        }
        if (dots[currentQuestionIndex]) {
            dots[currentQuestionIndex].classList.add('current');
        }
        
        // Navigation Buttons
        elements.prevBtn.disabled = currentQuestionIndex === 0;
        elements.nextBtn.disabled = currentQuestionIndex === activeQuestions.length - 1;
        
        // Check if drill finished button should show
        checkDrillFinishedStatus();

        // Passage Display
        if (q.passage) {
            elements.passagePanel.classList.remove('hidden');
            elements.passageText.innerHTML = marked.parse(q.passage || '');
        } else {
            elements.passagePanel.classList.add('hidden');
        }
        
        // Question Text
        elements.questionText.innerHTML = marked.parse(q.question || '');
        
        // Reset Translation fields
        elements.questionTranslation.classList.add('hidden');
        elements.questionTranslation.textContent = '';
        elements.explanationTranslation.classList.add('hidden');
        elements.explanationTranslation.textContent = '';
        
        // Input Options (MCQ vs. Grid-in)
        if (q.type === 'multiple-choice') {
            elements.choicesContainer.classList.remove('hidden');
            elements.gridInContainer.classList.add('hidden');
            renderChoices(q, isAnswered, selectedVal);
        } else {
            elements.choicesContainer.classList.add('hidden');
            elements.gridInContainer.classList.remove('hidden');
            renderGridIn(q, isAnswered, selectedVal);
        }
        
        // Explanation
        if (isAnswered) {
            elements.explanationContainer.classList.remove('hidden');
            elements.explanationText.textContent = q.explanation || '';
        } else {
            elements.explanationContainer.classList.add('hidden');
        }
        
        // MathJax formatting
        if (window.MathJax && typeof window.MathJax.typeset === 'function') {
            window.MathJax.typeset();
        }
    }

    // Render MCQ Options
    function renderChoices(q, isAnswered, selectedVal) {
        elements.choicesContainer.innerHTML = '';
        
        q.choices.forEach(choice => {
            const letter = choice.charAt(0); // A, B, C or D
            const label = document.createElement('label');
            label.className = 'choice-label';
            
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'q-choice';
            radio.value = letter;
            
            if (isAnswered) {
                radio.disabled = true;
                label.classList.add('locked');
                
                if (letter === q.correctAnswer) {
                    label.classList.add(selectedVal === letter ? 'correct' : 'correct-missed');
                } else if (selectedVal === letter && selectedVal !== q.correctAnswer) {
                    label.classList.add('incorrect');
                }
            } else {
                radio.addEventListener('change', () => {
                    activeAnswers[q.id] = letter;
                    // Trigger immediate feedback
                    renderQuestion();
                });
            }
            
            const text = document.createElement('span');
            text.className = 'choice-text';
            text.innerHTML = marked.parse(choice || '');
            
            label.appendChild(radio);
            label.appendChild(text);
            elements.choicesContainer.appendChild(label);
        });
    }

    // Render Grid-In
    function renderGridIn(q, isAnswered, selectedVal) {
        elements.gridInInput.value = isAnswered ? selectedVal : '';
        elements.gridInInput.disabled = isAnswered;
        
        if (isAnswered) {
            elements.checkAnswerBtn.classList.add('hidden');
            elements.gridInFeedback.classList.remove('hidden');
            
            const isCorrect = selectedVal.toLowerCase().trim() === q.correctAnswer.toLowerCase().trim();
            if (isCorrect) {
                elements.gridInFeedback.className = 'grid-in-feedback correct';
                elements.gridInFeedback.innerHTML = `<strong>Correct!</strong> Your answer matches the required answer: ${q.correctAnswer}`;
                elements.gridInInput.style.borderColor = 'var(--success)';
            } else {
                elements.gridInFeedback.className = 'grid-in-feedback incorrect';
                elements.gridInFeedback.innerHTML = `<strong>Incorrect.</strong> Correct answer is: ${q.correctAnswer}`;
                elements.gridInInput.style.borderColor = 'var(--error)';
            }
        } else {
            elements.checkAnswerBtn.classList.remove('hidden');
            elements.gridInFeedback.classList.add('hidden');
            elements.gridInInput.style.borderColor = '';
            
            // Clear prior click listeners by cloning button
            const newBtn = elements.checkAnswerBtn.cloneNode(true);
            elements.checkAnswerBtn.replaceWith(newBtn);
            elements.checkAnswerBtn = newBtn;
            
            elements.checkAnswerBtn.addEventListener('click', () => {
                const val = elements.gridInInput.value.trim();
                if (!val) {
                    alert("Please enter an answer.");
                    return;
                }
                activeAnswers[q.id] = val;
                renderQuestion();
            });
        }
    }

    // Navigation pagination
    function navigateTo(index) {
        if (index >= 0 && index < activeQuestions.length) {
            currentQuestionIndex = index;
            renderQuestion();
        }
    }

    // Check if user answered all 5 questions in the current drill
    function checkDrillFinishedStatus() {
        let allAnswered = true;
        activeQuestions.forEach(q => {
            if (!activeAnswers.hasOwnProperty(q.id)) {
                allAnswered = false;
            }
        });
        
        if (allAnswered) {
            elements.finishDrillBtn.classList.remove('hidden');
        } else {
            elements.finishDrillBtn.classList.add('hidden');
        }
    }

    // Finish current drill and submit results
    async function finishDrill() {
        let correctCount = 0;
        activeQuestions.forEach(q => {
            const isCorrect = activeAnswers[q.id].toLowerCase().trim() === q.correctAnswer.toLowerCase().trim();
            if (isCorrect) correctCount++;
        });
        
        const totalQ = activeQuestions.length;
        const drillKey = `${activeTestId}_${activeModuleId}_drill${activeDrillIndex}`;
        const isRW = activeModuleName.toLowerCase().includes('reading') || activeModuleName.toLowerCase().includes('writing');
        
        const resultRecord = {
            student_name: currentStudentName,
            test_id: drillKey,
            total_score: correctCount,
            rw_score: isRW ? correctCount : 0,
            math_score: !isRW ? correctCount : 0,
            raw_details: {
                type: 'drill',
                test_id: activeTestId,
                test_title: activeTestTitle,
                module_id: activeModuleId,
                module_name: activeModuleName,
                drill_index: activeDrillIndex,
                drill_name: `Drill ${activeDrillIndex + 1} (Q${activeDrillIndex * 5 + 1} - Q${activeDrillIndex * 5 + totalQ})`,
                questions_count: totalQ,
                correct_count: correctCount,
                answers: activeAnswers,
                question_details: activeQuestions.map(q => ({
                    id: q.id,
                    number: q.number,
                    selected: activeAnswers[q.id],
                    correct: q.correctAnswer,
                    is_correct: activeAnswers[q.id].toLowerCase().trim() === q.correctAnswer.toLowerCase().trim()
                }))
            }
        };

        elements.finishDrillBtn.disabled = true;
        elements.finishDrillBtn.textContent = 'Saving Drill...';

        try {
            // Save to Supabase
            if (window.supabaseClient) {
                const { error } = await window.supabaseClient
                    .from('student_results')
                    .insert([resultRecord]);
                if (error) throw error;
            }
            
            // Save to local storage history list
            const localDrills = localStorage.getItem('sat_drill_history');
            let historyList = localDrills ? JSON.parse(localDrills) : [];
            historyList.push({
                id: Date.now().toString(),
                student_name: currentStudentName,
                drill_key: drillKey,
                date: new Date().toISOString(),
                test_id: activeTestId,
                test_title: activeTestTitle,
                module_name: activeModuleName,
                correct: correctCount,
                total: totalQ
            });
            localStorage.setItem('sat_drill_history', JSON.stringify(historyList));
            
            // Cache score immediately
            drillResults[drillKey] = `${correctCount}/${totalQ}`;
            
            // Update sidebar UI with score
            const activeUl = document.querySelector('.active-drill').parentElement.parentElement;
            renderModulesAndDrills(activeTestId, activeUl);
            
            // Show score modal
            elements.scoreDisplay.textContent = `${correctCount} / ${totalQ}`;
            elements.percentDisplay.textContent = `${Math.round((correctCount / totalQ) * 100)}% Correct`;
            elements.summaryModal.classList.remove('hidden');
        } catch (err) {
            console.error("Error saving drill result:", err);
            alert("Error saving drill. Proceeding anyway.");
            elements.summaryModal.classList.remove('hidden');
        } finally {
            elements.finishDrillBtn.disabled = false;
            elements.finishDrillBtn.textContent = 'Finish Drill';
        }
    }

    // AI Translation handler
    async function handleTranslation(textToTranslate, outputContainer, button) {
        if (!textToTranslate) return;
        
        button.disabled = true;
        const originalText = button.innerHTML;
        button.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg> Translating...';
        outputContainer.classList.remove('hidden');
        outputContainer.textContent = 'Translating using AI...';

        try {
            const response = await fetch('/api/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: textToTranslate })
            });

            if (!response.ok) {
                throw new Error('Translation failed');
            }

            const data = await response.json();
            outputContainer.innerHTML = marked.parse(data.translation);
        } catch (error) {
            console.error('Translation error:', error);
            outputContainer.textContent = 'Failed to translate. Please check API configuration or try again later.';
        } finally {
            button.disabled = false;
            button.innerHTML = originalText;
        }
    }

    // Initialize Event Handlers
    function initEventHandlers() {
        elements.confirmNameBtn.addEventListener('click', () => {
            const val = elements.studentInput.value.trim();
            if (!val) {
                alert("Please enter your name.");
                return;
            }
            currentStudentName = val;
            localStorage.setItem('sat_student_name', val);
            elements.sidebarStudentName.textContent = currentStudentName;
            elements.studentModal.classList.add('hidden');
            loadDrillProgressAndTests();
        });

        elements.cancelNameBtn.addEventListener('click', () => {
            if (currentStudentName) {
                elements.studentModal.classList.add('hidden');
            }
        });

        elements.changeNameBtn.addEventListener('click', () => {
            showStudentNameModal(true);
        });

        elements.backDashboardBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });

        // Translate Events
        elements.translateQuestionBtn.addEventListener('click', () => {
            if (activeQuestions[currentQuestionIndex]) {
                handleTranslation(
                    activeQuestions[currentQuestionIndex].question,
                    elements.questionTranslation,
                    elements.translateQuestionBtn
                );
            }
        });

        elements.translateExplanationBtn.addEventListener('click', () => {
            if (activeQuestions[currentQuestionIndex]) {
                handleTranslation(
                    activeQuestions[currentQuestionIndex].explanation,
                    elements.explanationTranslation,
                    elements.translateExplanationBtn
                );
            }
        });

        // Footer Prev/Next
        elements.prevBtn.addEventListener('click', () => {
            navigateTo(currentQuestionIndex - 1);
        });
        
        elements.nextBtn.addEventListener('click', () => {
            navigateTo(currentQuestionIndex + 1);
        });

        elements.finishDrillBtn.addEventListener('click', finishDrill);

        // Modal Action Items
        elements.summaryReviewBtn.addEventListener('click', () => {
            elements.summaryModal.classList.add('hidden');
        });

        elements.summaryDashboardBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }

    init();
});
