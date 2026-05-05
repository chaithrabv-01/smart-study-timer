/**
 * Smart Study Timer - Main JavaScript
 * Handles Theming, Authentication, Timer Logic, and Dashboard features.
 */

// --- STATE & SETTINGS ---
function loadTimerSettings() {
    const saved = JSON.parse(localStorage.getItem('timerSettings'));
    if (saved) return saved;
    return { pomodoro: 25, shortBreak: 5, longBreak: 15 };
}

let timerSettings = loadTimerSettings();
let POMODORO_TIME = timerSettings.pomodoro * 60;
let SHORT_BREAK_TIME = timerSettings.shortBreak * 60;
let LONG_BREAK_TIME = timerSettings.longBreak * 60;

let timerInterval = null;
let timeLeft = POMODORO_TIME;
let isRunning = false;
let currentMode = 'pomodoro';
let currentTotalTime = POMODORO_TIME;

// --- UTILITIES ---

// Improved Alarm Sound using Web Audio API
function playAlarmSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Play a sequence of 3 beeps
        for (let i = 0; i < 3; i++) {
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime + (i * 0.4)); // A5
            oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + (i * 0.4) + 0.3); // Drop to A4
            
            gainNode.gain.setValueAtTime(0, audioCtx.currentTime + (i * 0.4));
            gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + (i * 0.4) + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + (i * 0.4) + 0.3);
            
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            oscillator.start(audioCtx.currentTime + (i * 0.4));
            oscillator.stop(audioCtx.currentTime + (i * 0.4) + 0.35);
        }
    } catch(e) {
        console.log("Audio not supported or blocked", e);
    }
}

// Global Toast Notification function
function showToast(message, icon = "fa-info-circle") {
    let toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fa-solid ${icon}" style="color: var(--primary-color);"></i> <span>${message}</span>`;
    document.body.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function sendNotification(message) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Smart Study Timer", { body: message, icon: "⏱️" });
    }
}

// --- THEMING ---
const themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    
    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        }
    });
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Request notification permission
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }

    const path = window.location.pathname;

    // Route Protection & Setup
    if (path.includes('dashboard.html')) {
        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        if (!currentUser) {
            const urlParams = new URLSearchParams(window.location.search);
            const room = urlParams.get('room');
            window.location.href = room ? `login.html?room=${room}` : 'login.html';
            return;
        }
        setupDashboard(currentUser);
        setupTimer();
    } else if (path.includes('login.html')) {
        setupLogin();
    } else if (path.includes('register.html')) {
        setupRegister();
    } else {
        // index.html
        setupTimer();
        setupAI(false);
    }
});

// --- AUTHENTICATION ---

function setupRegister() {
    const urlParams = new URLSearchParams(window.location.search);
    const room = urlParams.get('room');
    if (room) {
        document.querySelectorAll('a[href="login.html"]').forEach(a => {
            a.href = `login.html?room=${room}`;
        });
    }

    const form = document.getElementById('registerForm');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('regName').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value;

        let valid = true;
        if (!name) { document.getElementById('nameError').classList.add('active'); valid = false; }
        else { document.getElementById('nameError').classList.remove('active'); }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) { document.getElementById('emailError').classList.add('active'); valid = false; }
        else { document.getElementById('emailError').classList.remove('active'); }

        if (password.length < 6) { document.getElementById('passwordError').classList.add('active'); valid = false; }
        else { document.getElementById('passwordError').classList.remove('active'); }

        if (!valid) return;

        let users = JSON.parse(localStorage.getItem('users')) || [];
        if (users.find(u => u.email === email)) {
            alert("Email already registered!");
            return;
        }

        // Initialize new fields if missing
        if (!users.find(u => u.email === email)) {
            users.push({ 
                name, 
                email, 
                password, 
                stats: { points: 0, sessionsCompleted: 0, distractions: 0, streak: 0 }, 
                goals: [],
                history: {},
                lastActiveDate: new Date().toISOString().split('T')[0]
            });
            localStorage.setItem('users', JSON.stringify(users));
        }

        document.getElementById('successModal').classList.add('active');
    });
}

function setupLogin() {
    const urlParams = new URLSearchParams(window.location.search);
    const room = urlParams.get('room');
    if (room) {
        document.querySelectorAll('a[href="register.html"]').forEach(a => {
            a.href = `register.html?room=${room}`;
        });
    }

    const form = document.getElementById('loginForm');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;

        let users = JSON.parse(localStorage.getItem('users')) || [];
        const user = users.find(u => u.email === email);

        if (!user) {
            document.getElementById('loginEmailError').classList.add('active');
            document.getElementById('loginPasswordError').classList.remove('active');
            return;
        } else {
            document.getElementById('loginEmailError').classList.remove('active');
        }

        if (user.password !== password) {
            document.getElementById('loginPasswordError').classList.add('active');
            return;
        }
        
        // Ensure legacy users have new fields
        if (!user.history) user.history = {};
        if (typeof user.stats.streak === 'undefined') user.stats.streak = 0;
        
        // Streak Logic Calculation
        const today = new Date().toISOString().split('T')[0];
        if (user.lastActiveDate) {
            const lastActive = new Date(user.lastActiveDate);
            const currentDate = new Date(today);
            const diffTime = Math.abs(currentDate - lastActive);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            
            if (diffDays === 1) {
                // Logged in yesterday, streak continues (but don't increment until a session is done or just keep it)
            } else if (diffDays > 1) {
                // Streak broken
                user.stats.streak = 0;
            }
        }
        user.lastActiveDate = today;
        
        // Update user in DB
        const index = users.findIndex(u => u.email === email);
        if (index !== -1) {
            users[index] = user;
            localStorage.setItem('users', JSON.stringify(users));
        }

        localStorage.setItem('currentUser', JSON.stringify(user));
        
        const urlParams = new URLSearchParams(window.location.search);
        const room = urlParams.get('room');
        window.location.href = room ? `dashboard.html?room=${room}` : 'dashboard.html';
    });
}

// --- TIMER LOGIC ---
function setupTimer() {
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resetBtn = document.getElementById('resetBtn');
    const timeDisplay = document.getElementById('timeDisplay');
    const progressCircle = document.getElementById('progressCircle');
    const modeBtns = document.querySelectorAll('.timer-mode-btn');
    const focusModeBtn = document.getElementById('focusModeBtn');

    function updateDisplay() {
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        timeDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        document.title = `${timeDisplay.textContent} - SmartTimer`;

        // Circular Progress Update
        const percentage = ((currentTotalTime - timeLeft) / currentTotalTime) * 360;
        if (progressCircle) {
            progressCircle.style.background = `conic-gradient(var(--primary-color) ${percentage}deg, var(--card-border) 0deg)`;
        }
    }

    function switchMode(mode) {
        clearInterval(timerInterval);
        isRunning = false;
        currentMode = mode;
        if (mode === 'pomodoro') { timeLeft = POMODORO_TIME; currentTotalTime = POMODORO_TIME; }
        else if (mode === 'shortBreak') { timeLeft = SHORT_BREAK_TIME; currentTotalTime = SHORT_BREAK_TIME; }
        else if (mode === 'longBreak') { timeLeft = LONG_BREAK_TIME; currentTotalTime = LONG_BREAK_TIME; }
        
        startBtn.style.display = 'inline-flex';
        if(pauseBtn) pauseBtn.style.display = 'none';
        updateDisplay();

        modeBtns.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.mode === mode) btn.classList.add('active');
        });
    }

    function timerComplete() {
        clearInterval(timerInterval);
        isRunning = false;
        playAlarmSound();
        startBtn.style.display = 'inline-flex';
        if(pauseBtn) pauseBtn.style.display = 'none';
        
        let msg = currentMode === 'pomodoro' ? 'Focus session complete! Time for a break.' : 'Break is over! Ready to focus?';
        sendNotification(msg);

        // Update Dashboard Stats if logged in
        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        if (currentUser && currentMode === 'pomodoro') {
            currentUser.stats.sessionsCompleted += 1;
            currentUser.stats.points += 50;
            
            // Log history for today
            const today = new Date().toISOString().split('T')[0];
            if (!currentUser.history) currentUser.history = {};
            if (!currentUser.history[today]) currentUser.history[today] = 0;
            currentUser.history[today] += 1;
            
            // Increment streak if this is the first session today and they were active yesterday
            if (currentUser.history[today] === 1) {
                currentUser.stats.streak += 1;
            }
            
            updateUserRecord(currentUser);
            updateDashboardUI(currentUser);
        }
    }

    startBtn.addEventListener('click', () => {
        if (!isRunning) {
            isRunning = true;
            startBtn.style.display = 'none';
            if(pauseBtn) pauseBtn.style.display = 'inline-flex';
            
            timerInterval = setInterval(() => {
                if (timeLeft > 0) {
                    timeLeft--;
                    updateDisplay();
                } else {
                    timerComplete();
                }
            }, 1000);
        }
    });

    if(pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            clearInterval(timerInterval);
            isRunning = false;
            startBtn.style.display = 'inline-flex';
            pauseBtn.style.display = 'none';
        });
    }

    resetBtn.addEventListener('click', () => switchMode(currentMode));

    modeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => switchMode(e.target.dataset.mode));
    });

    if (focusModeBtn) {
        focusModeBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.log(`Error attempting to enable fullscreen: ${err.message}`);
                });
                document.body.classList.add('focus-mode-active');
                focusModeBtn.innerHTML = '<i class="fa-solid fa-compress"></i> Exit Focus Mode';
            } else {
                document.exitFullscreen();
                document.body.classList.remove('focus-mode-active');
                focusModeBtn.innerHTML = '<i class="fa-solid fa-expand"></i> Focus Mode';
            }
        });
    }

    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && document.body.classList.contains('focus-mode-active')) {
            document.body.classList.remove('focus-mode-active');
            if(focusModeBtn) focusModeBtn.innerHTML = '<i class="fa-solid fa-expand"></i> Focus Mode';
        }
    });

    // --- SETTINGS MODAL LOGIC ---
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    
    if (settingsBtn && settingsModal) {
        settingsBtn.addEventListener('click', () => {
            // Populate current values
            document.getElementById('pomodoroSetting').value = timerSettings.pomodoro;
            document.getElementById('shortBreakSetting').value = timerSettings.shortBreak;
            document.getElementById('longBreakSetting').value = timerSettings.longBreak;
            settingsModal.classList.add('active');
        });
        
        closeSettingsBtn.addEventListener('click', () => {
            settingsModal.classList.remove('active');
        });
        
        saveSettingsBtn.addEventListener('click', () => {
            const p = parseInt(document.getElementById('pomodoroSetting').value) || 25;
            const sb = parseInt(document.getElementById('shortBreakSetting').value) || 5;
            const lb = parseInt(document.getElementById('longBreakSetting').value) || 15;
            
            timerSettings = { pomodoro: p, shortBreak: sb, longBreak: lb };
            localStorage.setItem('timerSettings', JSON.stringify(timerSettings));
            
            POMODORO_TIME = timerSettings.pomodoro * 60;
            SHORT_BREAK_TIME = timerSettings.shortBreak * 60;
            LONG_BREAK_TIME = timerSettings.longBreak * 60;
            
            settingsModal.classList.remove('active');
            showToast('Timer settings saved!', 'fa-check-circle');
            
            // Only update current time if timer is not running
            if (!isRunning) {
                switchMode(currentMode);
            }
        });
    }

    updateDisplay();
}

// --- DASHBOARD LOGIC ---

function setupDashboard(user) {
    document.getElementById('welcomeMsg').textContent = `Hello, ${user.name.split(' ')[0]}!`;
    
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    });

    // Goals
    const goalInput = document.getElementById('goalInput');
    const addGoalBtn = document.getElementById('addGoalBtn');
    const goalList = document.getElementById('goalList');

    let goalTimerInterval = null;

    function renderGoals() {
        goalList.innerHTML = '';
        user.goals.forEach((goal, index) => {
            const li = document.createElement('li');
            li.className = 'goal-item flex-col';
            li.style.alignItems = 'flex-start';
            li.style.gap = '0.5rem';
            
            const isCompleted = goal.completed;
            const progressPct = Math.min(100, Math.round(((goal.spentTime || 0) / (goal.requiredTime || 1)) * 100));

            li.innerHTML = `
                <div class="flex-between" style="width: 100%;">
                    <div class="goal-content">
                        <input type="checkbox" class="goal-checkbox" ${isCompleted ? 'checked' : ''} data-index="${index}">
                        <span style="${isCompleted ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
                            ${goal.text}
                        </span>
                    </div>
                    <button class="btn btn-outline" style="padding: 0.2rem 0.5rem; border: none;" onclick="deleteGoal(${index})">
                        <i class="fa-solid fa-trash" style="color: var(--danger-color)"></i>
                    </button>
                </div>
                ${!isCompleted && goal.requiredTime ? `
                <div class="flex-between" style="width: 100%; font-size: 0.85rem; opacity: 0.9;">
                    <div class="flex-center" style="gap: 0.5rem;">
                        <button class="btn ${goal.isRunning ? 'btn-danger' : 'btn-outline'}" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;" onclick="toggleGoalTimer(${index})">
                            <i class="fa-solid ${goal.isRunning ? 'fa-pause' : 'fa-play'}"></i> ${goal.isRunning ? 'Pause' : 'Start'}
                        </button>
                        <span>${goal.spentTime || 0} / ${goal.requiredTime} mins</span>
                    </div>
                    <div style="flex: 1; margin: 0 1rem; background: var(--card-border); height: 6px; border-radius: 3px; overflow: hidden;">
                        <div style="width: ${progressPct}%; height: 100%; background: var(--primary-color); transition: width 0.3s;"></div>
                    </div>
                </div>
                ` : ''}
            `;
            goalList.appendChild(li);
        });

        let activeGoalIndex = null;
        const goalSummaryModal = document.getElementById('goalSummaryModal');
        const closeGoalSummaryBtn = document.getElementById('closeGoalSummaryBtn');
        const submitGoalSummaryBtn = document.getElementById('submitGoalSummaryBtn');
        const goalSummaryText = document.getElementById('goalSummaryText');

        if (closeGoalSummaryBtn && submitGoalSummaryBtn) {
            closeGoalSummaryBtn.onclick = () => {
                goalSummaryModal.classList.remove('active');
                if (activeGoalIndex !== null) {
                    user.goals[activeGoalIndex].completed = false; // Revert if cancelled
                    updateUserRecord(user);
                    renderGoals();
                    activeGoalIndex = null;
                }
            };
            submitGoalSummaryBtn.onclick = () => {
                const summary = goalSummaryText.value.trim();
                if (summary.length < 20) {
                    showToast('Summary must be at least 20 characters!', 'fa-triangle-exclamation');
                    return;
                }
                user.stats.points += 10; // Extra points for summary + completion
                user.goals[activeGoalIndex].summary = summary;
                user.goals[activeGoalIndex].completionTime = new Date().toISOString();
                updateUserRecord(user);
                renderGoals();
                updateDashboardUI(user);
                goalSummaryModal.classList.remove('active');
                showToast('Goal completed! +10 Points', 'fa-star');
                goalSummaryText.value = '';
                activeGoalIndex = null;
            };
        }

        document.querySelectorAll('.goal-checkbox').forEach(cb => {
            cb.addEventListener('click', (e) => {
                const idx = e.target.dataset.index;
                const goal = user.goals[idx];
                if (!goal.completed && (goal.spentTime || 0) < (goal.requiredTime || 0)) {
                    e.preventDefault();
                    showToast(`You must complete the required time (${goal.requiredTime} mins) before marking this goal as done.`, 'fa-triangle-exclamation');
                    return;
                }
            });

            cb.addEventListener('change', (e) => {
                const idx = e.target.dataset.index;
                const goal = user.goals[idx];
                
                goal.completed = e.target.checked;
                goal.isRunning = false;
                
                if(goal.completed) {
                    activeGoalIndex = idx;
                    if(goalSummaryModal) goalSummaryModal.classList.add('active');
                } else {
                    updateUserRecord(user);
                    renderGoals();
                    updateDashboardUI(user);
                }
            });
        });
    }

    window.toggleGoalTimer = function(index) {
        user.goals.forEach((g, i) => { if (i !== index) g.isRunning = false; }); 
        user.goals[index].isRunning = !user.goals[index].isRunning;
        updateUserRecord(user);
        renderGoals();
    };

    if (goalTimerInterval) clearInterval(goalTimerInterval);
    goalTimerInterval = setInterval(() => {
        let needsRender = false;
        if (user && user.goals) {
            user.goals.forEach((goal) => {
                if (goal.isRunning && !goal.completed) {
                    if (typeof goal.spentSeconds === 'undefined') goal.spentSeconds = 0;
                    goal.spentSeconds += 1;
                    
                    // Update progress visually every second instead of re-rendering everything
                    if (goal.spentSeconds >= 60) {
                        goal.spentSeconds = 0;
                        goal.spentTime = (goal.spentTime || 0) + 1;
                        needsRender = true;
                        if (goal.spentTime === goal.requiredTime) {
                            showToast(`Time completed for "${goal.text}"! You can now mark it as done.`, 'fa-star');
                            goal.isRunning = false;
                        }
                    }
                }
            });
            if (needsRender) {
                updateUserRecord(user);
                renderGoals();
            }
        }
    }, 1000);

    window.deleteGoal = function(index) {
        user.goals.splice(index, 1);
        updateUserRecord(user);
        renderGoals();
    };

    addGoalBtn.addEventListener('click', () => {
        const text = goalInput.value.trim();
        const timeInput = document.getElementById('goalTimeInput');
        const timeVal = parseInt(timeInput ? timeInput.value : 0);
        
        if (text && timeVal > 0) {
            user.goals.push({ 
                text, 
                requiredTime: timeVal, 
                spentTime: 0, 
                spentSeconds: 0, 
                completed: false, 
                isRunning: false 
            });
            updateUserRecord(user);
            goalInput.value = '';
            if(timeInput) timeInput.value = '';
            renderGoals();
        } else {
            showToast("Please enter a goal title and required minutes.", "fa-xmark");
        }
    });

    // Distractions
    const logDistractionBtn = document.getElementById('logDistractionBtn');
    if (logDistractionBtn) {
        logDistractionBtn.addEventListener('click', () => {
            user.stats.distractions += 1;
            updateUserRecord(user);
            updateDashboardUI(user);
        });
    }

    // --- TIMETABLE GENERATOR LOGIC ---
    const generatePlanBtn = document.getElementById('generatePlanBtn');
    const timetableContainer = document.getElementById('timetableContainer');
    if (generatePlanBtn && timetableContainer) {
        // Add subject button logic
        const addSubjectBtn = document.getElementById('addSubjectBtn');
        const subjectList = document.getElementById('subjectList');
        if (addSubjectBtn && subjectList) {
            addSubjectBtn.addEventListener('click', () => {
                const newEntry = document.createElement('div');
                newEntry.className = 'subject-entry flex-col';
                newEntry.style = 'border: 1px solid var(--card-border); padding: 0.5rem; border-radius: 8px; gap: 0.5rem; margin-top: 0.5rem;';
                newEntry.innerHTML = `
                    <div class="flex-between">
                        <input type="text" class="form-input subject-name" placeholder="Subject (e.g. Math)" style="flex: 1;">
                        <button class="btn btn-outline" style="padding: 0.2rem 0.5rem; border: none; margin-left: 0.5rem;" onclick="this.parentElement.parentElement.remove()">
                            <i class="fa-solid fa-trash" style="color: var(--danger-color)"></i>
                        </button>
                    </div>
                    <div class="flex-between" style="gap: 0.5rem;">
                        <select class="form-input subject-priority" style="padding: 0.5rem; font-size: 0.8rem;">
                            <option value="3">High Priority</option>
                            <option value="2">Medium Priority</option>
                            <option value="1">Low Priority</option>
                        </select>
                        <select class="form-input subject-difficulty" style="padding: 0.5rem; font-size: 0.8rem;">
                            <option value="hard">Hard</option>
                            <option value="medium">Medium</option>
                            <option value="easy">Easy</option>
                        </select>
                    </div>
                `;
                subjectList.appendChild(newEntry);
            });
        }

        generatePlanBtn.addEventListener('click', () => {
            const subjectEntries = document.querySelectorAll('.subject-entry');
            let subjects = [];
            
            subjectEntries.forEach(entry => {
                const name = entry.querySelector('.subject-name').value.trim();
                const priority = parseInt(entry.querySelector('.subject-priority').value);
                const difficulty = entry.querySelector('.subject-difficulty').value;
                if (name) {
                    subjects.push({ name, priority, difficulty });
                }
            });

            if (subjects.length === 0) {
                showToast("Please add at least one subject.", "fa-triangle-exclamation");
                return;
            }

            const startTimeInput = document.getElementById('plannerStartTime').value;
            const endTimeInput = document.getElementById('plannerEndTime').value;
            const sessionLen = parseInt(document.getElementById('plannerSessionLen').value);
            const peakFocus = document.getElementById('plannerPeakFocus').value;
            
            if (!startTimeInput || !endTimeInput) {
                showToast("Please set start and end times.", "fa-triangle-exclamation");
                return;
            }

            let start = new Date();
            let end = new Date();
            const [sh, sm] = startTimeInput.split(':');
            start.setHours(parseInt(sh), parseInt(sm), 0, 0);
            
            const [eh, em] = endTimeInput.split(':');
            end.setHours(parseInt(eh), parseInt(em), 0, 0);
            
            if (end <= start) {
                end.setDate(end.getDate() + 1); // next day if end time is past midnight
            }
            
            const totalMinutes = (end - start) / 60000;
            
            if (totalMinutes < sessionLen) {
                showToast("Total time is less than one session.", "fa-triangle-exclamation");
                return;
            }

            let totalWeight = subjects.reduce((acc, curr) => acc + curr.priority, 0);
            
            let blocks = [];
            let currentMin = 0;
            let sessionCount = 0;
            
            let avgCycleTime = sessionLen + 5; 
            let approxSessions = Math.floor(totalMinutes / avgCycleTime);
            if (approxSessions === 0) approxSessions = 1;
            
            subjects.forEach(sub => {
                sub.quota = Math.round((sub.priority / totalWeight) * approxSessions);
                if (sub.quota === 0) sub.quota = 1; 
            });
            
            // Sort by difficulty (Hard first, as standard approach to tackle tough tasks early)
            subjects.sort((a, b) => {
                const diffMap = { 'hard': 3, 'medium': 2, 'easy': 1 };
                return diffMap[b.difficulty] - diffMap[a.difficulty];
            });

            // Alternate subjects smoothly
            let sessionList = [];
            while(true) {
                let added = false;
                subjects.forEach(sub => {
                    if (sub.quota > 0) {
                        sessionList.push(sub.name);
                        sub.quota--;
                        added = true;
                    }
                });
                if (!added) break;
            }
            
            let currentTime = new Date(start);
            let sessionIdx = 0;
            
            while (currentMin < totalMinutes && sessionIdx < sessionList.length) {
                // Focus Block
                blocks.push({ type: 'focus', duration: sessionLen, title: sessionList[sessionIdx] });
                currentMin += sessionLen;
                sessionIdx++;
                sessionCount++;
                
                if (currentMin >= totalMinutes || sessionIdx >= sessionList.length) break;
                
                // Break Block
                if (sessionCount % 3 === 0) {
                    blocks.push({ type: 'break', duration: 15, title: 'Long Break' });
                    currentMin += 15;
                } else {
                    blocks.push({ type: 'break', duration: 5, title: 'Short Break' });
                    currentMin += 5;
                }
            }
            
            // Fill remaining time
            while (currentMin + sessionLen <= totalMinutes) {
                 blocks.push({ type: 'focus', duration: sessionLen, title: subjects[0].name + " (Review)" });
                 currentMin += sessionLen;
                 sessionCount++;
                 if (currentMin >= totalMinutes) break;
                 if (sessionCount % 3 === 0) {
                    blocks.push({ type: 'break', duration: 15, title: 'Long Break' });
                    currentMin += 15;
                } else {
                    blocks.push({ type: 'break', duration: 5, title: 'Short Break' });
                    currentMin += 5;
                }
            }
            
            // Render blocks
            timetableContainer.innerHTML = '';
            blocks.forEach(block => {
                const startTimeStr = currentTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                currentTime = new Date(currentTime.getTime() + block.duration * 60000);
                const endTimeStr = currentTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                
                const item = document.createElement('div');
                item.className = `timetable-item ${block.type === 'break' ? 'break' : ''}`;
                item.innerHTML = `
                    <div class="timetable-time">${startTimeStr} - ${endTimeStr}</div>
                    <div>${block.title}</div>
                `;
                timetableContainer.appendChild(item);
            });
            
            timetableContainer.style.display = 'flex';
        });
    }

    // --- PEERJS VOICE CHAT LOGIC ---
    const startVoiceBtn = document.getElementById('startVoiceBtn');
    const voiceRoomControls = document.getElementById('voiceRoomControls');
    const myPeerIdDisplay = document.getElementById('myPeerId');
    const inviteWhatsAppBtn = document.getElementById('inviteWhatsAppBtn');
    const joinVoiceBtn = document.getElementById('joinVoiceBtn');
    const friendRoomIdInput = document.getElementById('friendRoomId');
    const remoteAudio = document.getElementById('remoteAudio');
    const myVoiceStatus = document.getElementById('myVoiceStatus');
    const groupStudyList = document.getElementById('groupStudyList');
    
    let peer = null;
    let localStream = null;
    let currentCall = null;
    
    // Function to add a user to the visual list
    function addFriendToList(id) {
        const li = document.createElement('li');
        li.className = 'user-item';
        li.id = `peer-${id}`;
        li.innerHTML = `
            <div class="user-avatar"><i class="fa-solid fa-user"></i></div>
            <div style="flex: 1;">Friend (${id.substring(0,4)})</div>
            <div class="user-status" style="background: var(--success-color);"></div>
        `;
        groupStudyList.appendChild(li);
    }
    
    if (startVoiceBtn) {
        startVoiceBtn.addEventListener('click', () => {
            if (peer) return; // Already started
            
            startVoiceBtn.disabled = true;
            startVoiceBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting...';
            
            // Get Microphone Access
            navigator.mediaDevices.getUserMedia({video: false, audio: true}).then((stream) => {
                localStream = stream;
                myVoiceStatus.style.background = 'var(--success-color)';
                
                // Initialize PeerJS
                peer = new Peer(); 
                
                peer.on('open', function(id) {
                    voiceRoomControls.style.display = 'block';
                    myPeerIdDisplay.textContent = id;
                    startVoiceBtn.style.display = 'none';
                    showToast("Voice Room created!", "fa-check");
                });
                
                // Receive Call
                peer.on('call', function(call) {
                    call.answer(localStream); // Answer with our microphone
                    currentCall = call;
                    
                    call.on('stream', function(remoteStream) {
                        remoteAudio.srcObject = remoteStream;
                        addFriendToList(call.peer);
                        showToast("Friend joined the room!", "fa-users");
                        const endVoiceBtn = document.getElementById('endVoiceBtn');
                        if (endVoiceBtn) endVoiceBtn.style.display = 'inline-flex';
                    });
                    
                    call.on('close', () => {
                        const el = document.getElementById(`peer-${call.peer}`);
                        if(el) el.remove();
                    });
                });
                
                peer.on('error', function(err) {
                    console.log('PeerJS error:', err);
                    showToast("Error connecting to voice server.", "fa-triangle-exclamation");
                });
                
            }).catch(err => {
                console.log('Failed to get local stream', err);
                showToast("Microphone access denied or unavailable.", "fa-microphone-slash");
                startVoiceBtn.disabled = false;
                startVoiceBtn.innerHTML = '<i class="fa-solid fa-microphone"></i> Start';
            });
        });
        
        // Invite via WhatsApp
        inviteWhatsAppBtn.addEventListener('click', () => {
            const roomId = myPeerIdDisplay.textContent;
            
            // Generate full join URL
            const joinUrl = new URL(window.location.href);
            joinUrl.searchParams.set('room', roomId);
            
            const message = `Hey! Join my Smart Study Room for a voice session.\n\nClick this link to join: ${joinUrl.toString()}`;
            const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
            window.open(whatsappUrl, '_blank');
        });
        
        // Join Room
        joinVoiceBtn.addEventListener('click', () => {
            const friendId = friendRoomIdInput.value.trim();
            if (!friendId) return showToast("Please enter a Room ID", "fa-xmark");
            
            if (!localStream) {
                // User hasn't started their own mic yet, get it first
                navigator.mediaDevices.getUserMedia({video: false, audio: true}).then((stream) => {
                    localStream = stream;
                    myVoiceStatus.style.background = 'var(--success-color)';
                    
                    if (!peer) {
                        peer = new Peer();
                        peer.on('open', () => { makeCall(friendId); });
                        peer.on('error', (err) => { console.log(err); });
                    } else {
                        makeCall(friendId);
                    }
                }).catch(err => {
                    showToast("Microphone access needed to join.", "fa-microphone-slash");
                });
            } else {
                makeCall(friendId);
            }
        });
        
        function makeCall(friendId) {
            joinVoiceBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Joining...';
            joinVoiceBtn.disabled = true;
            
            const call = peer.call(friendId, localStream);
            currentCall = call;
            
            call.on('stream', function(remoteStream) {
                remoteAudio.srcObject = remoteStream;
                joinVoiceBtn.innerHTML = '<i class="fa-solid fa-phone-flip"></i> Connected';
                addFriendToList(friendId);
                showToast("Connected to room!", "fa-check");
                const endVoiceBtn = document.getElementById('endVoiceBtn');
                if (endVoiceBtn) {
                    endVoiceBtn.style.display = 'inline-flex';
                    joinVoiceBtn.style.display = 'none';
                }
            });
            
            call.on('close', () => {
                const el = document.getElementById(`peer-${friendId}`);
                if(el) el.remove();
                joinVoiceBtn.innerHTML = '<i class="fa-solid fa-phone-flip"></i> Join';
                joinVoiceBtn.style.display = 'inline-flex';
                joinVoiceBtn.disabled = false;
                const endVoiceBtn = document.getElementById('endVoiceBtn');
                if (endVoiceBtn) endVoiceBtn.style.display = 'none';
            });
        }

        const endVoiceBtn = document.getElementById('endVoiceBtn');
        if (endVoiceBtn) {
            endVoiceBtn.addEventListener('click', () => {
                if (currentCall) {
                    currentCall.close();
                }
                if (peer) {
                    peer.destroy();
                    peer = null;
                }
                if (localStream) {
                    localStream.getTracks().forEach(track => track.stop());
                    localStream = null;
                }
                groupStudyList.innerHTML = `
                    <li class="user-item">
                        <div class="user-avatar"><i class="fa-solid fa-user"></i></div>
                        <div style="flex: 1;">You</div>
                        <div class="user-status" id="myVoiceStatus" style="background: #ccc;"></div>
                    </li>
                `;
                remoteAudio.srcObject = null;
                voiceRoomControls.style.display = 'none';
                startVoiceBtn.style.display = 'inline-flex';
                startVoiceBtn.disabled = false;
                startVoiceBtn.innerHTML = '<i class="fa-solid fa-microphone"></i> Start';
                joinVoiceBtn.style.display = 'inline-flex';
                joinVoiceBtn.disabled = false;
                joinVoiceBtn.innerHTML = '<i class="fa-solid fa-phone-flip"></i> Join';
                endVoiceBtn.style.display = 'none';
                showToast("Call ended", "fa-phone-slash");
            });
        }

        // Auto-fill room ID if present in URL
        const urlParams = new URLSearchParams(window.location.search);
        const roomToJoin = urlParams.get('room');
        if (roomToJoin) {
            friendRoomIdInput.value = roomToJoin;
            showToast("Ready to join! Click 'Join Room' to connect.", "fa-phone");
            
            // Highlight the input box briefly
            friendRoomIdInput.style.transition = "box-shadow 0.3s ease";
            friendRoomIdInput.style.boxShadow = "0 0 10px var(--primary-color)";
            setTimeout(() => friendRoomIdInput.style.boxShadow = "none", 3000);
        }
    }

    renderGoals();
    updateDashboardUI(user);
    setupAI(true, user);
}

function updateUserRecord(user) {
    localStorage.setItem('currentUser', JSON.stringify(user));
    let users = JSON.parse(localStorage.getItem('users')) || [];
    const index = users.findIndex(u => u.email === user.email);
    if (index !== -1) {
        users[index] = user;
        localStorage.setItem('users', JSON.stringify(users));
    }
}

function updateDashboardUI(user) {
    // Stats
    document.getElementById('prodScore').textContent = user.stats.points || 0;
    document.getElementById('distractionCount').textContent = user.stats.distractions || 0;

    // Badges (Real Logic)
    if (user.stats.streak >= 3) {
        document.getElementById('badge3Day').classList.add('earned');
    } else {
        document.getElementById('badge3Day').classList.remove('earned');
    }
    if (user.stats.streak >= 7) {
        document.getElementById('badge7Day').classList.add('earned');
    } else {
        document.getElementById('badge7Day').classList.remove('earned');
    }

    // Chart.js Real Data Generation
    const chartCanvas = document.getElementById('analyticsChart');
    if (chartCanvas) {
        // Prepare last 7 days data
        const labels = [];
        const data = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateString = d.toISOString().split('T')[0];
            const displayLabel = d.toLocaleDateString('en-US', { weekday: 'short' });
            labels.push(displayLabel);
            
            // Get data from user history or 0
            if (user.history && user.history[dateString]) {
                data.push(user.history[dateString]);
            } else {
                data.push(0);
            }
        }

        // Destroy existing chart if it exists to prevent overlap
        if (window.myAnalyticsChart) {
            window.myAnalyticsChart.destroy();
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#f5f5f7' : '#1d1d1f';

        window.myAnalyticsChart = new Chart(chartCanvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Sessions Completed',
                    data: data,
                    backgroundColor: 'rgba(0, 102, 204, 0.7)',
                    borderColor: 'rgba(0, 102, 204, 1)',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1, color: textColor },
                        grid: { color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }
                    },
                    x: {
                        ticks: { color: textColor },
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }
}

// --- AI SUGGESTIONS ---
function setupAI(isLoggedin, user = null) {
    const aiText = document.getElementById('aiText');
    if (!aiText) return;

    const hour = new Date().getHours();
    let suggestion = "";

    if (!isLoggedin) {
        if (hour < 12) suggestion = "Morning! The brain is most alert now. Try tackling your hardest task first.";
        else if (hour < 18) suggestion = "Afternoon energy dip? Try a 25-minute Pomodoro session to regain momentum.";
        else suggestion = "Evening study. Keep the lighting warm and focus on reviewing material rather than new complex concepts.";
    } else {
        const uncompletedGoals = user.goals.filter(g => !g.completed).length;
        const streak = user.stats.streak || 0;
        
        if (user.stats.distractions > 5) {
            suggestion = "You've logged a few distractions. Consider entering Fullscreen Focus Mode and putting your phone in another room.";
        } else if (uncompletedGoals > 0 && hour < 18) {
            suggestion = `You have ${uncompletedGoals} goal(s) left. Break them down and tackle the hardest one using a Pomodoro!`;
        } else if (streak >= 3) {
            suggestion = `You're on a ${streak}-day streak! Keep the momentum going, consistency is the key to real learning.`;
        } else if (user.stats.sessionsCompleted === 0) {
            suggestion = "Ready to start your first session of the day? Try setting a small, achievable goal first.";
        } else if (hour >= 20) {
            suggestion = `Great job today with ${user.stats.points} points. Make sure to wind down soon to consolidate your memory.`;
        } else {
            suggestion = `You're doing great! Keep up the pace. Don't forget to write summaries for completed goals to earn extra points.`;
        }
    }

    aiText.style.opacity = 0;
    setTimeout(() => {
        aiText.innerHTML = `<strong>Tip:</strong> ${suggestion}`;
        aiText.style.transition = 'opacity 0.5s';
        aiText.style.opacity = 1;
    }, 500);
}
