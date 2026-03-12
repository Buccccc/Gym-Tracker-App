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
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();
let avgFocusFilter = '';
let avgLocationFilter = '';

// ===== Date Formatting =====
function formatDate(dateStr) {
    if (!dateStr) return '';
    // Handle various date formats - extract just the date part
    const cleanDate = String(dateStr).split('T')[0].split(' ')[0];
    const parts = cleanDate.split('-');
    if (parts.length !== 3) return cleanDate;
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    if (isNaN(d.getTime())) return cleanDate;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function dateKey(dateStr) {
    if (!dateStr) return '';
    return String(dateStr).split('T')[0].split(' ')[0];
}

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

// Fire-and-forget API call (no waiting)
function apiFireAndForget(action, params = {}) {
    api(action, params).catch(err => {
        console.error('Background API error:', err.message);
        showToast('Sync error — check connection', 'error');
    });
}

// Quiet refresh of a cache in background
function refreshCacheQuietly(cacheName) {
    const actionMap = {
        sets: 'getSets',
        sessions: 'getSessions',
        exercises: 'getExercises',
        locations: 'getLocations'
    };
    const action = actionMap[cacheName];
    if (!action) return;
    api(action).then(res => {
        if (cacheName === 'sets') cachedSets = res.data || [];
        if (cacheName === 'sessions') cachedSessions = res.data || [];
        if (cacheName === 'exercises') cachedExercises = res.data || [];
        if (cacheName === 'locations') cachedLocations = res.data || [];
    }).catch(() => {});
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
    }, 2500);
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
        try { new URL(url); } catch {
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
                <button class="link-btn" onclick="switchView('settings')">Add some in Settings</button>
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

    const recordContent = document.getElementById('set-record-content');
    const exerciseSets = cachedSets.filter(s => s.exercise === logSetState.exercise);

    if (exerciseSets.length === 0) {
        recordContent.innerHTML = '<p class="no-record">No previous records</p>';
    } else {
        const maxWeight = Math.max(...exerciseSets.map(s => parseFloat(s.weight)));
        const setsAtMax = exerciseSets.filter(s => parseFloat(s.weight) === maxWeight);
        const maxReps = Math.max(...setsAtMax.map(s => parseInt(s.reps)));
        const bestSets = setsAtMax.filter(s => parseInt(s.reps) === maxReps);
        const recordSet = bestSets.sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)))[0];

        recordContent.innerHTML = `
            <p class="record-detail">Weight: <span>${maxWeight} kg</span></p>
            <p class="record-detail">Reps at ${maxWeight} kg: <span>${maxReps}</span></p>
            <p class="record-date">Set on: ${formatDate(recordSet.date)}</p>
        `;
    }

    document.getElementById('set-weight').value = '';
    document.getElementById('set-reps').value = '';
    document.getElementById('set-weight-error').textContent = '';
    document.getElementById('set-reps-error').textContent = '';
    document.getElementById('set-weight').classList.remove('invalid');
    document.getElementById('set-reps').classList.remove('invalid');

    document.getElementById('set-date').value = todayStr();
    document.getElementById('set-date-body').style.display = 'none';
    const toggle = document.getElementById('set-date-toggle');
    toggle.querySelector('span').textContent = '› Override date';
    toggle.onclick = () => {
        const body = document.getElementById('set-date-body');
        if (body.style.display === 'none') {
            body.style.display = 'block';
            toggle.querySelector('span').textContent = '‹ Override date';
        } else {
            body.style.display = 'none';
            toggle.querySelector('span').textContent = '› Override date';
        }
    };

    const saveBtn = document.getElementById('save-set-btn');
    saveBtn.onclick = () => saveSet();
}

function saveSet() {
    const weightInput = document.getElementById('set-weight');
    const repsInput = document.getElementById('set-reps');
    const weightError = document.getElementById('set-weight-error');
    const repsError = document.getElementById('set-reps-error');

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

    // Optimistic update: add to local cache immediately
    cachedSets.push({
        date,
        focus: logSetState.focus,
        muscleGroup: logSetState.muscleGroup,
        exercise: logSetState.exercise,
        weight,
        reps,
        row: 'pending_' + Date.now()
    });

    showToast('Set logged!');
    showLogHome();

    // Fire API in background, then quietly refresh cache
    apiFireAndForget('addSet', {
        date,
        focus: logSetState.focus,
        muscleGroup: logSetState.muscleGroup,
        exercise: logSetState.exercise,
        weight,
        reps
    });

    // Refresh after a delay to get real row IDs
    setTimeout(() => refreshCacheQuietly('sets'), 3000);
}

// ----- Log Session Flow -----
function startLogSession() {
    document.getElementById('log-home').style.display = 'none';
    document.getElementById('log-session-flow').style.display = 'block';

    document.getElementById('session-date').value = todayStr();
    document.getElementById('session-date-body').style.display = 'none';
    const toggle = document.getElementById('session-date-toggle');
    toggle.querySelector('span').textContent = '› Override date';
    toggle.onclick = () => {
        const body = document.getElementById('session-date-body');
        if (body.style.display === 'none') {
            body.style.display = 'block';
            toggle.querySelector('span').textContent = '‹ Override date';
        } else {
            body.style.display = 'none';
            toggle.querySelector('span').textContent = '› Override date';
        }
    };

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

    document.getElementById('session-mg-container').style.display = 'none';
    document.getElementById('session-duration').value = '';

    const locationContainer = document.getElementById('session-location-group');
    locationContainer.innerHTML = '';
    let sessionLocation = '';
    if (cachedLocations.length === 0) {
        locationContainer.innerHTML = `
            <div class="empty-state" style="padding:12px 0;">
                <p style="font-size:0.85rem;">No locations configured.</p>
                <button class="link-btn" onclick="switchView('settings')">Add in Settings</button>
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

    clearSessionErrors();

    document.getElementById('log-session-back').onclick = () => showLogHome();

    document.getElementById('save-session-btn').onclick = () => {
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
        const muscleGroupsStr = checkedMgs.join(',');

        // Optimistic update
        cachedSessions.push({
            date,
            focus: sessionFocus,
            muscleGroups: muscleGroupsStr,
            duration,
            location: sessionLocation,
            people: sessionPeople,
            effort: sessionEffort,
            row: 'pending_' + Date.now()
        });

        showToast('Session logged!');
        showLogHome();

        apiFireAndForget('addSession', {
            date,
            focus: sessionFocus,
            muscleGroups: muscleGroupsStr,
            duration,
            location: sessionLocation,
            people: sessionPeople,
            effort: sessionEffort
        });

        setTimeout(() => refreshCacheQuietly('sessions'), 3000);
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
        if (!newUrl) { showToast('Please enter a URL', 'error'); return; }
        try { new URL(newUrl); } catch { showToast('Invalid URL format', 'error'); return; }
        localStorage.setItem('gymtracker_api_url', newUrl);
        urlDisplay.textContent = newUrl.substring(0, 50) + '...';
        document.getElementById('change-api-form').style.display = 'none';
        showToast('API URL updated');
    };
}

function setupManageExercises() {
    const mgSelect = document.getElementById('add-exercise-mg');
    mgSelect.innerHTML = '<option value="">Select muscle group...</option>';
    ALL_MUSCLE_GROUPS.forEach(mg => {
        const opt = document.createElement('option');
        opt.value = mg;
        opt.textContent = mg;
        mgSelect.appendChild(opt);
    });

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

    const addBtn = document.getElementById('add-exercise-btn');
    addBtn.onclick = async () => {
        const mg = mgSelect.value;
        const name = nameInput.value.trim();
        if (!mg) { showToast('Select a muscle group', 'error'); return; }
        if (!name) { showToast('Enter an exercise name', 'error'); return; }

        // Optimistic
        cachedExercises.push({ muscleGroup: mg, name });
        nameInput.value = '';
        searchResults.innerHTML = '';
        renderExistingExercises();
        showToast('Exercise added!');

        apiFireAndForget('addExercise', { muscleGroup: mg, name });
        setTimeout(() => refreshCacheQuietly('exercises'), 3000);
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
            item.querySelector('.delete-btn').onclick = () => {
                if (!confirm(`Remove "${ex.name}"?`)) return;
                // Optimistic remove
                cachedExercises = cachedExercises.filter(e => !(e.muscleGroup === ex.muscleGroup && e.name === ex.name));
                renderExistingExercises();
                showToast('Exercise removed');
                apiFireAndForget('removeExercise', { muscleGroup: ex.muscleGroup, name: ex.name });
                setTimeout(() => refreshCacheQuietly('exercises'), 3000);
            };
            container.appendChild(item);
        });
    });
}

function setupManageLocations() {
    renderLocations();

    const addBtn = document.getElementById('add-location-btn');
    const input = document.getElementById('add-location-name');

    addBtn.onclick = () => {
        const name = input.value.trim();
        if (!name) { showToast('Enter a location name', 'error'); return; }

        cachedLocations.push({ name });
        input.value = '';
        renderLocations();
        showToast('Location added!');

        apiFireAndForget('addLocation', { name });
        setTimeout(() => refreshCacheQuietly('locations'), 3000);
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
        item.querySelector('.delete-btn').onclick = () => {
            if (!confirm(`Remove "${loc.name}"?`)) return;
            cachedLocations = cachedLocations.filter(l => l.name !== loc.name);
            renderLocations();
            showToast('Location removed');
            apiFireAndForget('removeLocation', { name: loc.name });
            setTimeout(() => refreshCacheQuietly('locations'), 3000);
        };
        container.appendChild(item);
    });
}

function setupEditSets() {
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

    let sets = [...cachedSets].sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)));
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
            <div class="edit-item-secondary">${formatDate(s.date)} · ${s.muscleGroup}</div>
        `;
        item.onclick = () => openEditSetModal(s);
        container.appendChild(item);
    });
}

function openEditSetModal(set) {
    const modal = document.getElementById('edit-set-modal');
    modal.style.display = 'flex';

    document.getElementById('edit-set-date').value = dateKey(set.date);
    document.getElementById('edit-set-focus').value = set.focus;
    document.getElementById('edit-set-exercise').value = set.exercise;
    document.getElementById('edit-set-weight').value = set.weight;
    document.getElementById('edit-set-reps').value = set.reps;
    document.getElementById('edit-set-row').value = set.row;

    populateEditSetMG(set.focus, set.muscleGroup);

    document.getElementById('edit-set-focus').onchange = (e) => {
        populateEditSetMG(e.target.value, '');
    };

    document.getElementById('edit-set-cancel').onclick = () => { modal.style.display = 'none'; };

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
            showToast('Set updated!');
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setButtonLoading(saveBtn, false);
        }
    };

    document.getElementById('edit-set-delete').onclick = () => {
        if (!confirm('Delete this set permanently?')) return;
        const row = document.getElementById('edit-set-row').value;

        // Optimistic delete
        cachedSets = cachedSets.filter(s => String(s.row) !== String(row));
        modal.style.display = 'none';
        renderEditSets(document.getElementById('filter-sets-exercise').value);
        showToast('Set deleted');

        apiFireAndForget('deleteSet', { row });
        setTimeout(() => refreshCacheQuietly('sets'), 3000);
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

    const sessions = [...cachedSessions].sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)));

    if (sessions.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No sessions logged yet.</p></div>';
        return;
    }

    sessions.forEach(s => {
        const item = document.createElement('div');
        item.className = 'edit-item';
        item.innerHTML = `
            <div class="edit-item-primary">${formatDate(s.date)} — ${s.focus}</div>
            <div class="edit-item-secondary">${s.muscleGroups} · ${s.duration} min</div>
        `;
        item.onclick = () => openEditSessionModal(s);
        container.appendChild(item);
    });
}

function openEditSessionModal(session) {
    const modal = document.getElementById('edit-session-modal');
    modal.style.display = 'flex';

    document.getElementById('edit-session-date').value = dateKey(session.date);
    document.getElementById('edit-session-focus').value = session.focus;
    document.getElementById('edit-session-mg').value = session.muscleGroups;
    document.getElementById('edit-session-duration').value = session.duration;
    document.getElementById('edit-session-location').value = session.location;
    document.getElementById('edit-session-people').value = session.people;
    document.getElementById('edit-session-effort').value = session.effort;
    document.getElementById('edit-session-row').value = session.row;

    document.getElementById('edit-session-cancel').onclick = () => { modal.style.display = 'none'; };

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
            showToast('Session updated!');
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setButtonLoading(saveBtn, false);
        }
    };

    document.getElementById('edit-session-delete').onclick = () => {
        if (!confirm('Delete this session permanently?')) return;
        const row = document.getElementById('edit-session-row').value;

        cachedSessions = cachedSessions.filter(s => String(s.row) !== String(row));
        modal.style.display = 'none';
        renderEditSessions();
        showToast('Session deleted');

        apiFireAndForget('deleteSession', { row });
        setTimeout(() => refreshCacheQuietly('sessions'), 3000);
    };
}

// ============================================================
// PAGE: ANALYSIS VIEW
// ============================================================
function initAnalysisView() {
    renderSummaryStats();
    renderAvgDurationSection();
    renderCalendar();
    renderLocationBreakdown();
    initExerciseProgress();
}

// ----- Summary Stats -----
function renderSummaryStats() {
    document.getElementById('stat-total-sessions').textContent = cachedSessions.length;
    document.getElementById('stat-total-sets').textContent = cachedSets.length;

    if (cachedSessions.length > 0) {
        const totalDuration = cachedSessions.reduce((sum, s) => sum + (parseInt(s.duration) || 0), 0);
        const avg = Math.round(totalDuration / cachedSessions.length);
        document.getElementById('stat-avg-duration').textContent = avg + 'm';
    } else {
        document.getElementById('stat-avg-duration').textContent = '--';
    }
}

// ----- Average Duration with Filters -----
function renderAvgDurationSection() {
    avgFocusFilter = '';
    avgLocationFilter = '';

    const focusContainer = document.getElementById('avg-focus-filters');
    focusContainer.innerHTML = '';

    const allFocusChip = createFilterChip('All', true, () => {
        avgFocusFilter = '';
        focusContainer.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        allFocusChip.classList.add('active');
        updateAvgDuration();
    });
    focusContainer.appendChild(allFocusChip);

    Object.keys(FOCUS_GROUPS).forEach(focus => {
        const chip = createFilterChip(focus, false, () => {
            avgFocusFilter = focus;
            focusContainer.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            updateAvgDuration();
        });
        focusContainer.appendChild(chip);
    });

    const locationContainer = document.getElementById('avg-location-filters');
    locationContainer.innerHTML = '';

    const uniqueLocations = [...new Set(cachedSessions.map(s => s.location).filter(Boolean))];

    if (uniqueLocations.length > 0) {
        const allLocChip = createFilterChip('All locations', true, () => {
            avgLocationFilter = '';
            locationContainer.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            allLocChip.classList.add('active');
            updateAvgDuration();
        });
        locationContainer.appendChild(allLocChip);

        uniqueLocations.forEach(loc => {
            const chip = createFilterChip(loc, false, () => {
                avgLocationFilter = loc;
                locationContainer.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                updateAvgDuration();
            });
            locationContainer.appendChild(chip);
        });
    }

    updateAvgDuration();
}

function updateAvgDuration() {
    let filtered = [...cachedSessions];

    if (avgFocusFilter) {
        filtered = filtered.filter(s => s.focus === avgFocusFilter);
    }
    if (avgLocationFilter) {
        filtered = filtered.filter(s => s.location === avgLocationFilter);
    }

    const valueEl = document.getElementById('avg-duration-value');
    const countEl = document.getElementById('avg-duration-count');

    if (filtered.length === 0) {
        valueEl.textContent = '--';
        countEl.textContent = 'No sessions match filters';
        return;
    }

    const total = filtered.reduce((sum, s) => sum + (parseInt(s.duration) || 0), 0);
    const avg = Math.round(total / filtered.length);

    valueEl.textContent = avg;
    countEl.textContent = `Based on ${filtered.length} session${filtered.length !== 1 ? 's' : ''}`;
}

function createFilterChip(label, active, onClick) {
    const chip = document.createElement('button');
    chip.className = 'filter-chip' + (active ? ' active' : '');
    chip.textContent = label;
    chip.type = 'button';
    chip.onclick = onClick;
    return chip;
}

// ----- Calendar -----
function renderCalendar() {
    const grid = document.getElementById('cal-grid');
    const label = document.getElementById('cal-month-label');
    const detail = document.getElementById('cal-detail');

    grid.innerHTML = '';
    detail.style.display = 'none';

    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
    label.textContent = `${months[calendarMonth]} ${calendarYear}`;

    // Build session lookup by date key
    const sessionsByDate = {};
    cachedSessions.forEach(s => {
        const dk = dateKey(s.date);
        if (!sessionsByDate[dk]) sessionsByDate[dk] = [];
        sessionsByDate[dk].push(s);
    });

    const firstDay = new Date(calendarYear, calendarMonth, 1);
    let startDayOfWeek = firstDay.getDay();
    // Convert Sunday=0 to Monday-based (Mon=0, Sun=6)
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Empty cells for offset
    for (let i = 0; i < startDayOfWeek; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day empty';
        grid.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dk = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const sessions = sessionsByDate[dk] || [];
        const isToday = dk === todayKey;

        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
        if (isToday) dayEl.classList.add('today');
        if (sessions.length > 0) dayEl.classList.add('has-session');
        dayEl.textContent = day;

        if (sessions.length > 0) {
            dayEl.onclick = () => {
                // Deselect previous
                grid.querySelectorAll('.calendar-day.selected').forEach(d => d.classList.remove('selected'));
                dayEl.classList.add('selected');

                detail.style.display = 'block';
                detail.innerHTML = `
                    <div class="calendar-day-detail">
                        <div class="calendar-day-detail-date">${formatDate(dk)}</div>
                        ${sessions.map(s => `
                            <div class="calendar-session-item">
                                <strong>${s.focus}</strong> — ${s.muscleGroups}
                                <div class="session-meta">
                                    <span>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                                        ${s.location}
                                    </span>
                                    <span>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                        ${s.duration} min
                                    </span>
                                    <span>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                        ${s.people}
                                    </span>
                                    <span>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                                        ${s.effort}
                                    </span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            };
        }

        grid.appendChild(dayEl);
    }

    // Calendar navigation
    document.getElementById('cal-prev').onclick = () => {
        calendarMonth--;
        if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
        renderCalendar();
    };

    document.getElementById('cal-next').onclick = () => {
        calendarMonth++;
        if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
        renderCalendar();
    };
}

// ----- Location Breakdown -----
function renderLocationBreakdown() {
    const container = document.getElementById('location-bars');
    container.innerHTML = '';

    if (cachedSessions.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:12px 0;"><p>No sessions yet</p></div>';
        return;
    }

    const locationCounts = {};
    cachedSessions.forEach(s => {
        const loc = s.location || 'Unknown';
        locationCounts[loc] = (locationCounts[loc] || 0) + 1;
    });

    const total = cachedSessions.length;
    const sorted = Object.entries(locationCounts).sort((a, b) => b[1] - a[1]);

    sorted.forEach(([loc, count]) => {
        const pct = Math.round((count / total) * 100);
        const row = document.createElement('div');
        row.className = 'location-bar-row';
        row.innerHTML = `
            <span class="location-bar-label">${loc}</span>
            <div class="location-bar-track">
                <div class="location-bar-fill" style="width:${pct}%">${count}</div>
            </div>
        `;
        container.appendChild(row);
    });
}

// ----- Exercise Progress -----
function initExerciseProgress() {
    let analysisFocus = '';
    let analysisMG = '';

    const focusContainer = document.getElementById('analysis-focus-group');
    focusContainer.innerHTML = '';
    Object.keys(FOCUS_GROUPS).forEach(focus => {
        const btn = createPillBtn(focus, () => {
            analysisFocus = focus;
            analysisMG = '';
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
        .sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)));

    if (exerciseSets.length === 0) {
        chartContainer.style.display = 'none';
        prompt.style.display = 'block';
        prompt.innerHTML = '<p>No sets logged for this exercise yet.</p>';
        return;
    }

    prompt.style.display = 'none';
    chartContainer.style.display = 'block';

    if (analysisChart) {
        analysisChart.destroy();
        analysisChart = null;
    }

    const ctx = document.getElementById('analysis-chart').getContext('2d');
    const data = exerciseSets.map(s => ({
        x: dateKey(s.date),
        y: parseFloat(s.weight),
        reps: parseInt(s.reps)
    }));

    analysisChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Weight (kg)',
                data: data,
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.08)',
                borderWidth: 2,
                pointBackgroundColor: '#8b5cf6',
                pointBorderColor: '#8b5cf6',
                pointRadius: 4,
                pointHoverRadius: 7,
                fill: true,
                tension: 0.2
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
                        displayFormats: { day: 'MMM dd' },
                        tooltipFormat: 'MMM dd, yyyy'
                    },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#52525b', maxRotation: 45, font: { size: 11 } }
                },
                y: {
                    title: { display: true, text: 'Weight (kg)', color: '#52525b', font: { size: 11 } },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#52525b', font: { size: 11 } }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1c1c24',
                    titleColor: '#f4f4f5',
                    bodyColor: '#a1a1aa',
                    borderColor: '#3f3f46',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            const point = context.raw;
                            return [`Weight: ${point.y} kg`, `Reps: ${point.reps}`];
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
    const bestSet = bestSets.sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)))[0];
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
            <span class="stat-value">${bestSet.weight} kg × ${bestSet.reps} reps (${formatDate(bestSet.date)})</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Date range</span>
            <span class="stat-value">${formatDate(firstDate)} → ${formatDate(lastDate)}</span>
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