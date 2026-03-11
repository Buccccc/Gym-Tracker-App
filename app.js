// ============================================================
// Gym Progressive Overload Tracker — Application Logic
// ============================================================

// ===== Constants =====
const FOCUS_GROUPS = {
    Push: ['Chest', 'Shoulders', 'Triceps'],
    Pull: ['Back', 'Biceps', 'Forearms'],
    Legs: ['Quads/Glutes', 'Hamstrings', 'Calves', 'Core']
};

const ALL_MUSCLE_GROUPS = Object.values(FOCUS_GROUPS).flat();
const PEOPLE_OPTIONS = ['Solo', '1', '2', '3+'];
const EFFORT_OPTIONS = ['Light', 'Medium', 'Hard', 'Max'];

// ===== Cached Data =====
let cachedExercises = [];
let cachedSets = [];
let cachedSessions = [];
let cachedLocations = [];

// ===== State =====
let currentView = 'log';
let logSetState = { step: 0, focus: '', muscleGroup: '', exercise: '' };
let analysisChart = null;

// ===== API Helper =====
async function api(action, params = {}) {
    const baseUrl = localStorage.getItem('gymtracker_api_url');
    if (!baseUrl) throw new Error('API URL not configured');
    const url = new URL(baseUrl);
    url.searchParams.set('action', action);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
    }
    const response = await fetch(url.toString(), { redirect: 'follow' });
    if (!response.ok) throw new Error('Network error');
    const result = await response.json();
    if (result.success === false) {
        throw new Error(result.error || 'API error');
    }
    return result;
}

// ===== Toast System =====
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ===== Loading Helpers =====
function setButtonLoading(btn, loading) {
    if (loading) {
        btn.classList.add('loading');
        btn.disabled = true;
    } else {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

// ===== Date Helper =====
function todayStr() {
    return new Date().toISOString().split('T')[0];
}

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', init);

async function init() {
    registerServiceWorker();

    const apiUrl = localStorage.getItem('gymtracker_api_url');
    if (!apiUrl) {
        showSetupModal();
        return;
    }

    await loadAllData();
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}

function showSetupModal() {
    document.getElementById('loading-screen').style.display = 'none';
    const modal = document.getElementById('setup-modal');
    modal.style.display = 'flex';

    const saveBtn = document.getElementById('setup-save-btn');
    const input = document.getElementById('setup-api-url');
    const errorEl = document.getElementById('setup-error');

    saveBtn.onclick = async () => {
        const url = input.value.trim();
        if (!url) {
            errorEl.textContent = 'Please enter a URL';
            errorEl.style.display = 'block';
            return;
        }
        try {
            new URL(url);
        } catch {
            errorEl.textContent = 'Please enter a valid URL';
            errorEl.style.display = 'block';
            return;
        }
        errorEl.style.display = 'none';
        localStorage.setItem('gymtracker_api_url', url);
        modal.style.display = 'none';
        document.getElementById('loading-screen').style.display = 'flex';
        await loadAllData();
    };
}

async function loadAllData() {
    const loadingScreen = document.getElementById('loading-screen');
    loadingScreen.style.display = 'flex';

    try {
        const [exercisesRes, setsRes, sessionsRes, locationsRes] = await Promise.all([
            api('getExercises'),
            api('getSets'),
            api('getSessions'),
            api('getLocations')
        ]);

        cachedExercises = exercisesRes.data || [];
        cachedSets = setsRes.data || [];
        cachedSessions = sessionsRes.data || [];
        cachedLocations = locationsRes.data || [];

        loadingScreen.style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        document.getElementById('bottom-nav').style.display = 'flex';

        setupNavigation();
        switchView('log');

    } catch (err) {
        loadingScreen.style.display = 'none';
        showToast('Failed to connect: ' + err.message, 'error');
        showSetupModal();
    }
}

// ===== Navigation =====
function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchView(view);
        });
    });
}

function switchView(viewName) {
    currentView = viewName;

    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    document.getElementById(`view-${viewName}`).style.display = 'block';

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    if (viewName === 'log') {
        initLogView();
    } else if (viewName === 'settings') {
        initSettingsView();
    } else if (viewName === 'analysis') {
        initAnalysisView();
    }
}

// ============================================================
// PAGE: LOG VIEW
// ============================================================
function initLogView() {
    showLogHome();
    document.getElementById('card-log-set').onclick = () => startLogSet();
    document.getElementById('card-log-session').onclick = () => startLogSession();
}

function showLogHome() {
    document.getElementById('log-home').style.display = 'block';
    document.getElementById('log-set-flow').style.display = 'none';
    document.getElementById('log-session-flow').style.display = 'none';
}

// ----- Log Set Flow -----
function startLogSet() {
    document.getElementById('log-home').style.display = 'none';
    document.getElementById('log-set-flow').style.display = 'block';

    logSetState = { step: 1, focus: '', muscleGroup: '', exercise: '' };
    showLogSetStep(1);
    renderSetStep1();

    document.getElementById('log-set-back').onclick = () => {
        if (logSetState.step <= 1) {
            showLogHome();
        } else {
            logSetState.step--;
            showLogSetStep(logSetState.step);
        }
    };
}

function showLogSetStep(step) {
    for (let i = 1; i <= 4; i++) {
        document.getElementById(`log-set-step${i}`).style.display = i === step ? 'block' : 'none';
    }
}

function renderSetStep1() {
    const container = document.getElementById('set-focus-group');
    container.innerHTML = '';
    Object.keys(FOCUS_GROUPS).forEach(focus => {
        const btn = createPillBtn(focus, () => {
            logSetState.focus = focus;
            logSetState.step = 2;
            showLogSetStep(2);
            renderSetStep2();
        });
        container.appendChild(btn);
    });
}

function renderSetStep2() {
    const container = document.getElementById('set-mg-group');
    container.innerHTML = '';
    const groups = FOCUS_GROUPS[logSetState.focus] || [];
    groups.forEach(mg => {
        const btn = createPillBtn(mg, () => {
            logSetState.muscleGroup = mg;
            logSetState.step = 3;
            showLogSetStep(3);
            renderSetStep3();
        });
        container.appendChild(btn);
    });
}

function renderSetStep3() {
    const container = document.getElementById('set-exercise-group');
    container.innerHTML = '';
    const exercises = cachedExercises.filter(e => e.muscleGroup === logSetState.muscleGroup);

    if (exercises.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No exercises found for ${logSetState.muscleGroup}.</p>
                <button class="link-btn" onclick="switchView('settings')">Add some in Settings →</button>
            </div>
        `;
        return;
    }

    exercises.forEach(ex => {
        const btn = createPillBtn(ex.name, () => {
            logSetState.exercise = ex.name;
            logSetState.step = 4;
            showLogSetStep(4);
            renderSetStep4();
        });
        container.appendChild(btn);
    });
}

function renderSetStep4() {
    document.getElementById('set-exercise-title').textContent = logSetState.exercise;

    // Record calculation
    const recordContent = document.getElementById('set-record-content');
    const exerciseSets = cachedSets.filter(s => s.exercise === logSetState.exercise);

    if (exerciseSets.length === 0) {
        recordContent.innerHTML = '<p class="no-record">No previous records</p>';
    } else {
        const maxWeight = Math.max(...exerciseSets.map(s => parseFloat(s.weight)));
        const setsAtMax = exerciseSets.filter(s => parseFloat(s.weight) === maxWeight);
        const maxReps = Math.max(...setsAtMax.map(s => parseInt(s.reps)));
        const bestSets = setsAtMax.filter(s => parseInt(s.reps) === maxReps);
        const recordSet = bestSets.sort((a, b) => b.date.localeCompare(a.date))[0];

        recordContent.innerHTML = `
            <p class="record-detail">Weight: <span>${maxWeight} kg</span></p>
            <p class="record-detail">Reps at ${maxWeight} kg: <span>${maxReps}</span></p>
            <p class="record-date">Set on: ${recordSet.date}</p>
        `;
    }

    // Reset inputs
    document.getElementById('set-weight').value = '';
    document.getElementById('set-reps').value = '';
    document.getElementById('set-weight-error').textContent = '';
    document.getElementById('set-reps-error').textContent = '';
    document.getElementById('set-weight').classList.remove('invalid');
    document.getElementById('set-reps').classList.remove('invalid');

    // Date
    document.getElementById('set-date').value = todayStr();
    document.getElementById('set-date-body').style.display = 'none';
    const toggle = document.getElementById('set-date-toggle');
    toggle.querySelector('span').textContent = '▸ Override date';
    toggle.onclick = () => {
        const body = document.getElementById('set-date-body');
        if (body.style.display === 'none') {
            body.style.display = 'block';
            toggle.querySelector('span').textContent = '▾ Override date';
        } else {
            body.style.display = 'none';
            toggle.querySelector('span').textContent = '▸ Override date';
        }
    };

    // Save handler
    const saveBtn = document.getElementById('save-set-btn');
    saveBtn.onclick = () => saveSet();
}

async function saveSet() {
    const weightInput = document.getElementById('set-weight');
    const repsInput = document.getElementById('set-reps');
    const weightError = document.getElementById('set-weight-error');
    const repsError = document.getElementById('set-reps-error');
    const saveBtn = document.getElementById('save-set-btn');

    let valid = true;

    const weight = parseFloat(weightInput.value);
    const reps = parseInt(repsInput.value);

    weightError.textContent = '';
    repsError.textContent = '';
    weightInput.classList.remove('invalid');
    repsInput.classList.remove('invalid');

    if (!weightInput.value || weight <= 0 || isNaN(weight)) {
        weightError.textContent = 'Enter a valid weight > 0';
        weightInput.classList.add('invalid');
        valid = false;
    }

    if (!repsInput.value || reps <= 0 || isNaN(reps)) {
        repsError.textContent = 'Enter valid reps > 0';
        repsInput.classList.add('invalid');
        valid = false;
    }

    if (!valid) return;

    const date = document.getElementById('set-date').value || todayStr();

    setButtonLoading(saveBtn, true);

    try {
        await api('addSet', {
            date,
            focus: logSetState.focus,
            muscleGroup: logSetState.muscleGroup,
            exercise: logSetState.exercise,
            weight,
            reps
        });

        const setsRes = await api('getSets');
        cachedSets = setsRes.data || [];

        showToast('Set logged! 💪');
        showLogHome();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    } finally {
        setButtonLoading(saveBtn, false);
    }
}

// ----- Log Session Flow -----
function startLogSession() {
    document.getElementById('log-home').style.display = 'none';
    document.getElementById('log-session-flow').style.display = 'block';

    // Date
    document.getElementById('session-date').value = todayStr();
    document.getElementById('session-date-body').style.display = 'none';
    const toggle = document.getElementById('session-date-toggle');
    toggle.querySelector('span').textContent = '▸ Override date';
    toggle.onclick = () => {
        const body = document.getElementById('session-date-body');
        if (body.style.display === 'none') {
            body.style.display = 'block';
            toggle.querySelector('span').textContent = '▾ Override date';
        } else {
            body.style.display = 'none';
            toggle.querySelector('span').textContent = '▸ Override date';
        }
    };

    // Focus
    const focusContainer = document.getElementById('session-focus-group');
    focusContainer.innerHTML = '';
    let sessionFocus = '';
    Object.keys(FOCUS_GROUPS).forEach(focus => {
        const btn = createPillBtn(focus, () => {
            sessionFocus = focus;
            focusContainer.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderSessionMuscleGroups(focus);
        });
        focusContainer.appendChild(btn);
    });

    // Muscle groups container hidden initially
    document.getElementById('session-mg-container').style.display = 'none';

    // Duration
    document.getElementById('session-duration').value = '';

    // Location
    const locationContainer = document.getElementById('session-location-group');
    locationContainer.innerHTML = '';
    let sessionLocation = '';
    if (cachedLocations.length === 0) {
        locationContainer.innerHTML = `
            <div class="empty-state" style="padding:12px 0;">
                <p style="font-size:0.85rem;">No locations configured.</p>
                <button class="link-btn" onclick="switchView('settings')">Add in Settings →</button>
            </div>
        `;
    } else {
        cachedLocations.forEach(loc => {
            const btn = createPillBtn(loc.name, () => {
                sessionLocation = loc.name;
                locationContainer.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
            locationContainer.appendChild(btn);
        });
    }

    // People
    const peopleContainer = document.getElementById('session-people-group');
    peopleContainer.innerHTML = '';
    let sessionPeople = '';
    PEOPLE_OPTIONS.forEach(opt => {
        const btn = createPillBtn(opt, () => {
            sessionPeople = opt;
            peopleContainer.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
        peopleContainer.appendChild(btn);
    });

    // Effort
    const effortContainer = document.getElementById('session-effort-group');
    effortContainer.innerHTML = '';
    let sessionEffort = '';
    EFFORT_OPTIONS.forEach(opt => {
        const btn = createPillBtn(opt, () => {
            sessionEffort = opt;
            effortContainer.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
        effortContainer.appendChild(btn);
    });

    // Clear errors
    clearSessionErrors();

    // Back button
    document.getElementById('log-session-back').onclick = () => showLogHome();

    // Save
    document.getElementById('save-session-btn').onclick = async () => {
        clearSessionErrors();
        let valid = true;

        if (!sessionFocus) {
            document.getElementById('session-focus-error').textContent = 'Select a focus';
            valid = false;
        }

        const checkedMgs = [];
        document.querySelectorAll('#session-mg-checks .check-btn.checked').forEach(b => {
            checkedMgs.push(b.dataset.value);
        });
        if (sessionFocus && checkedMgs.length === 0) {
            document.getElementById('session-mg-error').textContent = 'Select at least one muscle group';
            valid = false;
        }

        const duration = parseInt(document.getElementById('session-duration').value);
        if (!document.getElementById('session-duration').value || duration <= 0 || isNaN(duration)) {
            document.getElementById('session-duration-error').textContent = 'Enter a valid duration > 0';
            document.getElementById('session-duration').classList.add('invalid');
            valid = false;
        }

        if (!sessionLocation) {
            document.getElementById('session-location-error').textContent = 'Select a location';
            valid = false;
        }

        if (!sessionPeople) {
            document.getElementById('session-people-error').textContent = 'Select training partners';
            valid = false;
        }

        if (!sessionEffort) {
            document.getElementById('session-effort-error').textContent = 'Select effort level';
            valid = false;
        }

        if (!valid) return;

        const date = document.getElementById('session-date').value || todayStr();
        const saveBtn = document.getElementById('save-session-btn');
        setButtonLoading(saveBtn, true);

        try {
            await api('addSession', {
                date,
                focus: sessionFocus,
                muscleGroups: checkedMgs.join(','),
                duration,
                location: sessionLocation,
                people: sessionPeople,
                effort: sessionEffort
            });

            const sessionsRes = await api('getSessions');
            cachedSessions = sessionsRes.data || [];

            showToast('Session logged! 🏋️');
            showLogHome();
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setButtonLoading(saveBtn, false);
        }
    };
}

function renderSessionMuscleGroups(focus) {
    const container = document.getElementById('session-mg-container');
    const checksContainer = document.getElementById('session-mg-checks');
    container.style.display = 'block';
    checksContainer.innerHTML = '';

    const groups = FOCUS_GROUPS[focus] || [];
    groups.forEach(mg => {
        const btn = document.createElement('button');
        btn.className = 'check-btn checked';
        btn.textContent = mg;
        btn.dataset.value = mg;
        btn.onclick = () => btn.classList.toggle('checked');
        checksContainer.appendChild(btn);
    });
}

function clearSessionErrors() {
    ['session-focus-error', 'session-mg-error', 'session-duration-error',
     'session-location-error', 'session-people-error', 'session-effort-error'].forEach(id => {
        document.getElementById(id).textContent = '';
    });
    document.getElementById('session-duration').classList.remove('invalid');
}

// ============================================================
// PAGE: SETTINGS VIEW
// ============================================================
function initSettingsView() {
    setupAccordions();
    setupApiConfig();
    setupManageExercises();
    setupManageLocations();
    setupEditSets();
    setupEditSessions();
}

function setupAccordions() {
    document.querySelectorAll('.accordion-header').forEach(header => {
        header.onclick = () => {
            const targetId = header.dataset.accordion;
            const body = document.getElementById(targetId);
            const isOpen = body.classList.contains('open');

            // Close all
            document.querySelectorAll('.accordion-body').forEach(b => b.classList.remove('open'));
            document.querySelectorAll('.accordion-header').forEach(h => h.classList.remove('open'));

            if (!isOpen) {
                body.classList.add('open');
                header.classList.add('open');
            }
        };
    });
}

function setupApiConfig() {
    const urlDisplay = document.getElementById('current-api-url');
    const savedUrl = localStorage.getItem('gymtracker_api_url') || '';
    urlDisplay.textContent = savedUrl ? savedUrl.substring(0, 50) + '...' : 'Not configured';

    document.getElementById('change-api-btn').onclick = () => {
        document.getElementById('change-api-form').style.display = 'block';
        document.getElementById('new-api-url').value = localStorage.getItem('gymtracker_api_url') || '';
    };

    document.getElementById('cancel-api-btn').onclick = () => {
        document.getElementById('change-api-form').style.display = 'none';
    };

    document.getElementById('save-new-api-btn').onclick = () => {
        const newUrl = document.getElementById('new-api-url').value.trim();
        if (!newUrl) {
            showToast('Please enter a URL', 'error');
            return;
        }
        try {
            new URL(newUrl);
        } catch {
            showToast('Invalid URL format', 'error');
            return;
        }
        localStorage.setItem('gymtracker_api_url', newUrl);
        urlDisplay.textContent = newUrl.substring(0, 50) + '...';
        document.getElementById('change-api-form').style.display = 'none';
        showToast('API URL updated');
    };
}

function setupManageExercises() {
    // Populate muscle group dropdown
    const mgSelect = document.getElementById('add-exercise-mg');
    mgSelect.innerHTML = '<option value="">Select muscle group...</option>';
    ALL_MUSCLE_GROUPS.forEach(mg => {
        const opt = document.createElement('option');
        opt.value = mg;
        opt.textContent = mg;
        mgSelect.appendChild(opt);
    });

    // Search/filter as user types
    const nameInput = document.getElementById('add-exercise-name');
    const searchResults = document.getElementById('exercise-search-results');

    nameInput.addEventListener('input', () => {
        const mg = mgSelect.value;
        const query = nameInput.value.trim().toLowerCase();
        searchResults.innerHTML = '';

        if (!mg || !query) return;

        const matches = cachedExercises.filter(e =>
            e.muscleGroup === mg && e.name.toLowerCase().includes(query)
        );

        if (matches.length > 0) {
            searchResults.innerHTML = '<p class="search-label">Existing exercises:</p>';
            matches.forEach(m => {
                const div = document.createElement('div');
                div.className = 'search-item';
                div.textContent = m.name;
                searchResults.appendChild(div);
            });
        }
    });

    mgSelect.addEventListener('change', () => {
        nameInput.dispatchEvent(new Event('input'));
    });

    // Add exercise button
    const addBtn = document.getElementById('add-exercise-btn');
    addBtn.onclick = async () => {
        const mg = mgSelect.value;
        const name = nameInput.value.trim();

        if (!mg) {
            showToast('Select a muscle group', 'error');
            return;
        }
        if (!name) {
            showToast('Enter an exercise name', 'error');
            return;
        }

        setButtonLoading(addBtn, true);
        try {
            await api('addExercise', { muscleGroup: mg, name });
            const res = await api('getExercises');
            cachedExercises = res.data || [];
            nameInput.value = '';
            searchResults.innerHTML = '';
            renderExistingExercises();
            showToast('Exercise added! ✅');
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setButtonLoading(addBtn, false);
        }
    };

    renderExistingExercises();
}

function renderExistingExercises() {
    const container = document.getElementById('existing-exercises-list');
    container.innerHTML = '';

    const grouped = {};
    cachedExercises.forEach(ex => {
        if (!grouped[ex.muscleGroup]) grouped[ex.muscleGroup] = [];
        grouped[ex.muscleGroup].push(ex);
    });

    if (Object.keys(grouped).length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No exercises yet.</p></div>';
        return;
    }

    Object.keys(grouped).sort().forEach(mg => {
        const header = document.createElement('div');
        header.className = 'group-header';
        header.textContent = mg;
        container.appendChild(header);

        grouped[mg].forEach(ex => {
            const item = document.createElement('div');
            item.className = 'group-item';
            item.innerHTML = `
                <span>${ex.name}</span>
                <button class="delete-btn" title="Remove">✕</button>
            `;
            item.querySelector('.delete-btn').onclick = async () => {
                if (!confirm(`Remove "${ex.name}"?`)) return;
                try {
                    await api('removeExercise', { muscleGroup: ex.muscleGroup, name: ex.name });
                    const res = await api('getExercises');
                    cachedExercises = res.data || [];
                    renderExistingExercises();
                    showToast('Exercise removed');
                } catch (err) {
                    showToast('Error: ' + err.message, 'error');
                }
            };
            container.appendChild(item);
        });
    });
}

function setupManageLocations() {
    renderLocations();

    const addBtn = document.getElementById('add-location-btn');
    const input = document.getElementById('add-location-name');

    addBtn.onclick = async () => {
        const name = input.value.trim();
        if (!name) {
            showToast('Enter a location name', 'error');
            return;
        }
        setButtonLoading(addBtn, true);
        try {
            await api('addLocation', { name });
            const res = await api('getLocations');
            cachedLocations = res.data || [];
            input.value = '';
            renderLocations();
            showToast('Location added! 📍');
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setButtonLoading(addBtn, false);
        }
    };
}

function renderLocations() {
    const container = document.getElementById('locations-list');
    container.innerHTML = '';

    if (cachedLocations.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No locations yet.</p></div>';
        return;
    }

    cachedLocations.forEach(loc => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <span>${loc.name}</span>
            <button class="delete-btn" title="Remove">✕</button>
        `;
        item.querySelector('.delete-btn').onclick = async () => {
            if (!confirm(`Remove "${loc.name}"?`)) return;
            try {
                await api('removeLocation', { name: loc.name });
                const res = await api('getLocations');
                cachedLocations = res.data || [];
                renderLocations();
                showToast('Location removed');
            } catch (err) {
                showToast('Error: ' + err.message, 'error');
            }
        };
        container.appendChild(item);
    });
}

function setupEditSets() {
    // Populate filter
    const filterSelect = document.getElementById('filter-sets-exercise');
    filterSelect.innerHTML = '<option value="">All Exercises</option>';
    const exerciseNames = [...new Set(cachedSets.map(s => s.exercise))].sort();
    exerciseNames.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        filterSelect.appendChild(opt);
    });

    filterSelect.onchange = () => renderEditSets(filterSelect.value);
    renderEditSets('');
}

function renderEditSets(filterExercise) {
    const container = document.getElementById('sets-list');
    container.innerHTML = '';

    let sets = [...cachedSets].sort((a, b) => b.date.localeCompare(a.date));
    if (filterExercise) {
        sets = sets.filter(s => s.exercise === filterExercise);
    }

    if (sets.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No sets logged yet.</p></div>';
        return;
    }

    sets.forEach(s => {
        const item = document.createElement('div');
        item.className = 'edit-item';
        item.innerHTML = `
            <div class="edit-item-primary">${s.exercise} — ${s.weight} kg × ${s.reps} reps</div>
            <div class="edit-item-secondary">${s.date} • ${s.muscleGroup}</div>
        `;
        item.onclick = () => openEditSetModal(s);
        container.appendChild(item);
    });
}

function openEditSetModal(set) {
    const modal = document.getElementById('edit-set-modal');
    modal.style.display = 'flex';

    document.getElementById('edit-set-date').value = set.date;
    document.getElementById('edit-set-focus').value = set.focus;
    document.getElementById('edit-set-exercise').value = set.exercise;
    document.getElementById('edit-set-weight').value = set.weight;
    document.getElementById('edit-set-reps').value = set.reps;
    document.getElementById('edit-set-row').value = set.row;

    // Populate muscle group select based on focus
    populateEditSetMG(set.focus, set.muscleGroup);

    document.getElementById('edit-set-focus').onchange = (e) => {
        populateEditSetMG(e.target.value, '');
    };

    document.getElementById('edit-set-cancel').onclick = () => {
        modal.style.display = 'none';
    };

    document.getElementById('edit-set-save').onclick = async () => {
        const saveBtn = document.getElementById('edit-set-save');
        setButtonLoading(saveBtn, true);
        try {
            await api('updateSet', {
                row: document.getElementById('edit-set-row').value,
                date: document.getElementById('edit-set-date').value,
                focus: document.getElementById('edit-set-focus').value,
                muscleGroup: document.getElementById('edit-set-mg').value,
                exercise: document.getElementById('edit-set-exercise').value,
                weight: document.getElementById('edit-set-weight').value,
                reps: document.getElementById('edit-set-reps').value
            });
            const res = await api('getSets');
            cachedSets = res.data || [];
            modal.style.display = 'none';
            renderEditSets(document.getElementById('filter-sets-exercise').value);
            showToast('Set updated! ✅');
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setButtonLoading(saveBtn, false);
        }
    };

    document.getElementById('edit-set-delete').onclick = async () => {
        if (!confirm('Delete this set permanently?')) return;
        const deleteBtn = document.getElementById('edit-set-delete');
        setButtonLoading(deleteBtn, true);
        try {
            await api('deleteSet', { row: document.getElementById('edit-set-row').value });
            const res = await api('getSets');
            cachedSets = res.data || [];
            modal.style.display = 'none';
            renderEditSets(document.getElementById('filter-sets-exercise').value);
            showToast('Set deleted');
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setButtonLoading(deleteBtn, false);
        }
    };
}

function populateEditSetMG(focus, selectedMG) {
    const mgSelect = document.getElementById('edit-set-mg');
    mgSelect.innerHTML = '';
    const groups = FOCUS_GROUPS[focus] || ALL_MUSCLE_GROUPS;
    groups.forEach(mg => {
        const opt = document.createElement('option');
        opt.value = mg;
        opt.textContent = mg;
        if (mg === selectedMG) opt.selected = true;
        mgSelect.appendChild(opt);
    });
}

function setupEditSessions() {
    renderEditSessions();
}

function renderEditSessions() {
    const container = document.getElementById('sessions-list');
    container.innerHTML = '';

    const sessions = [...cachedSessions].sort((a, b) => b.date.localeCompare(a.date));

    if (sessions.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No sessions logged yet.</p></div>';
        return;
    }

    sessions.forEach(s => {
        const item = document.createElement('div');
        item.className = 'edit-item';
        item.innerHTML = `
            <div class="edit-item-primary">${s.date} — ${s.focus}</div>
            <div class="edit-item-secondary">${s.muscleGroups} • ${s.duration} min</div>
        `;
        item.onclick = () => openEditSessionModal(s);
        container.appendChild(item);
    });
}

function openEditSessionModal(session) {
    const modal = document.getElementById('edit-session-modal');
    modal.style.display = 'flex';

    document.getElementById('edit-session-date').value = session.date;
    document.getElementById('edit-session-focus').value = session.focus;
    document.getElementById('edit-session-mg').value = session.muscleGroups;
    document.getElementById('edit-session-duration').value = session.duration;
    document.getElementById('edit-session-location').value = session.location;
    document.getElementById('edit-session-people').value = session.people;
    document.getElementById('edit-session-effort').value = session.effort;
    document.getElementById('edit-session-row').value = session.row;

    document.getElementById('edit-session-cancel').onclick = () => {
        modal.style.display = 'none';
    };

    document.getElementById('edit-session-save').onclick = async () => {
        const saveBtn = document.getElementById('edit-session-save');
        setButtonLoading(saveBtn, true);
        try {
            await api('updateSession', {
                row: document.getElementById('edit-session-row').value,
                date: document.getElementById('edit-session-date').value,
                focus: document.getElementById('edit-session-focus').value,
                muscleGroups: document.getElementById('edit-session-mg').value,
                duration: document.getElementById('edit-session-duration').value,
                location: document.getElementById('edit-session-location').value,
                people: document.getElementById('edit-session-people').value,
                effort: document.getElementById('edit-session-effort').value
            });
            const res = await api('getSessions');
            cachedSessions = res.data || [];
            modal.style.display = 'none';
            renderEditSessions();
            showToast('Session updated! ✅');
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setButtonLoading(saveBtn, false);
        }
    };

    document.getElementById('edit-session-delete').onclick = async () => {
        if (!confirm('Delete this session permanently?')) return;
        const deleteBtn = document.getElementById('edit-session-delete');
        setButtonLoading(deleteBtn, true);
        try {
            await api('deleteSession', { row: document.getElementById('edit-session-row').value });
            const res = await api('getSessions');
            cachedSessions = res.data || [];
            modal.style.display = 'none';
            renderEditSessions();
            showToast('Session deleted');
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setButtonLoading(deleteBtn, false);
        }
    };
}

// ============================================================
// PAGE: ANALYSIS VIEW
// ============================================================
function initAnalysisView() {
    let analysisFocus = '';
    let analysisMG = '';
    let analysisExercise = '';

    // Focus
    const focusContainer = document.getElementById('analysis-focus-group');
    focusContainer.innerHTML = '';
    Object.keys(FOCUS_GROUPS).forEach(focus => {
        const btn = createPillBtn(focus, () => {
            analysisFocus = focus;
            analysisMG = '';
            analysisExercise = '';
            focusContainer.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderAnalysisMG(focus);
            document.getElementById('analysis-exercise-container').style.display = 'none';
            document.getElementById('analysis-chart-container').style.display = 'none';
            document.getElementById('analysis-prompt').style.display = 'block';
        });
        focusContainer.appendChild(btn);
    });

    document.getElementById('analysis-mg-container').style.display = 'none';
    document.getElementById('analysis-exercise-container').style.display = 'none';
    document.getElementById('analysis-chart-container').style.display = 'none';
    document.getElementById('analysis-prompt').style.display = 'block';

    function renderAnalysisMG(focus) {
        const container = document.getElementById('analysis-mg-container');
        const group = document.getElementById('analysis-mg-group');
        container.style.display = 'block';
        group.innerHTML = '';

        const groups = FOCUS_GROUPS[focus] || [];
        groups.forEach(mg => {
            const btn = createPillBtn(mg, () => {
                analysisMG = mg;
                analysisExercise = '';
                group.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderAnalysisExercises(mg);
                document.getElementById('analysis-chart-container').style.display = 'none';
                document.getElementById('analysis-prompt').style.display = 'block';
            });
            group.appendChild(btn);
        });
    }

    function renderAnalysisExercises(mg) {
        const container = document.getElementById('analysis-exercise-container');
        const group = document.getElementById('analysis-exercise-group');
        container.style.display = 'block';
        group.innerHTML = '';

        const exercises = cachedExercises.filter(e => e.muscleGroup === mg);

        if (exercises.length === 0) {
            group.innerHTML = '<div class="empty-state" style="padding:12px 0;"><p style="font-size:0.85rem;">No exercises for this muscle group.</p></div>';
            return;
        }

        exercises.forEach(ex => {
            const btn = createPillBtn(ex.name, () => {
                analysisExercise = ex.name;
                group.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderAnalysisChart(ex.name);
            });
            group.appendChild(btn);
        });
    }
}

function renderAnalysisChart(exerciseName) {
    const chartContainer = document.getElementById('analysis-chart-container');
    const prompt = document.getElementById('analysis-prompt');
    const statsContainer = document.getElementById('analysis-stats');

    const exerciseSets = cachedSets
        .filter(s => s.exercise === exerciseName)
        .sort((a, b) => a.date.localeCompare(b.date));

    if (exerciseSets.length === 0) {
        chartContainer.style.display = 'none';
        prompt.style.display = 'block';
        prompt.innerHTML = '<p>No sets logged for this exercise yet. 📝</p>';
        return;
    }

    prompt.style.display = 'none';
    chartContainer.style.display = 'block';

    // Destroy previous chart
    if (analysisChart) {
        analysisChart.destroy();
        analysisChart = null;
    }

    const ctx = document.getElementById('analysis-chart').getContext('2d');
    const data = exerciseSets.map(s => ({
        x: s.date,
        y: parseFloat(s.weight),
        reps: parseInt(s.reps)
    }));

    analysisChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Weight (kg)',
                data: data,
                borderColor: '#00b4d8',
                backgroundColor: 'rgba(0, 180, 216, 0.1)',
                borderWidth: 2,
                pointBackgroundColor: '#00b4d8',
                pointBorderColor: '#00b4d8',
                pointRadius: 5,
                pointHoverRadius: 8,
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'nearest'
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day',
                        displayFormats: {
                            day: 'MMM dd'
                        },
                        tooltipFormat: 'yyyy-MM-dd'
                    },
                    grid: {
                        color: 'rgba(255,255,255,0.05)'
                    },
                    ticks: {
                        color: '#888',
                        maxRotation: 45
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Weight (kg)',
                        color: '#888'
                    },
                    grid: {
                        color: 'rgba(255,255,255,0.05)'
                    },
                    ticks: {
                        color: '#888'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#1a1a2e',
                    titleColor: '#e0e0e0',
                    bodyColor: '#e0e0e0',
                    borderColor: '#00b4d8',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            const point = context.raw;
                            return [
                                `Weight: ${point.y} kg`,
                                `Reps: ${point.reps}`
                            ];
                        }
                    }
                }
            }
        }
    });

    // Stats
    const totalSets = exerciseSets.length;
    const maxWeight = Math.max(...exerciseSets.map(s => parseFloat(s.weight)));
    const setsAtMax = exerciseSets.filter(s => parseFloat(s.weight) === maxWeight);
    const maxReps = Math.max(...setsAtMax.map(s => parseInt(s.reps)));
    const bestSets = setsAtMax.filter(s => parseInt(s.reps) === maxReps);
    const bestSet = bestSets.sort((a, b) => b.date.localeCompare(a.date))[0];
    const firstDate = exerciseSets[0].date;
    const lastDate = exerciseSets[exerciseSets.length - 1].date;

    statsContainer.innerHTML = `
        <div class="stat-row">
            <span class="stat-label">Total sets logged</span>
            <span class="stat-value">${totalSets}</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">All-time max weight</span>
            <span class="stat-value">${maxWeight} kg</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Best set</span>
            <span class="stat-value">${bestSet.weight} kg × ${bestSet.reps} reps (${bestSet.date})</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Date range</span>
            <span class="stat-value">${firstDate} → ${lastDate}</span>
        </div>
    `;
}

// ============================================================
// UTILITY: Create Pill Button
// ============================================================
function createPillBtn(label, onClick) {
    const btn = document.createElement('button');
    btn.className = 'pill-btn';
    btn.textContent = label;
    btn.type = 'button';
    btn.onclick = onClick;
    return btn;
}

// ============================================================
// Close modals on overlay click
// ============================================================
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay') && e.target.id !== 'setup-modal') {
        e.target.style.display = 'none';
    }
});