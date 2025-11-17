// Global variables
let userProfile = {
    maxHR: 180,
    restHR: 60,
    fitnessLevel: 'intermediate',
    zoneWidth: 10
};

let workoutConfig = {
    level: 'medium',
    peakCount: 3,
    warmupTime: 5,
    cooldownTime: 5,
    peakDuration: 120,
    restDuration: 90
};

let workoutState = {
    isActive: false,
    isPaused: false,
    currentPhase: 'warmup',
    currentPeak: 0,
    elapsedTime: 0,
    currentHR: 70,
    targetLower: 0,
    targetUpper: 0,
    hrData: [],
    timeData: [],
    phaseData: [],
    fullWorkoutPlan: [],
    planTimeData: [],
    fullLowerPlan: [],
    fullUpperPlan: [],
    totalWorkoutTime: 0
};

let hrChart = null;
let resultsChart = null;
let workoutInterval = null;
let hrSimulationInterval = null;
let hrmDevice = null;
let hrmCharacteristic = null;
let usingRealHRM = false;

// Bluetooth HRM connection
async function connectHRM() {
    try {
        const connectBtn = document.getElementById('connectHRMBtn');
        const statusEl = document.getElementById('hrmStatus');
        if (!connectBtn || !statusEl) return;
        
        statusEl.textContent = 'Etsitään sykemittaria...';
        connectBtn.disabled = true;
        
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ services: ['heart_rate'] }],
            optionalServices: ['battery_service']
        });
        
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService('heart_rate');
        const characteristic = await service.getCharacteristic('heart_rate_measurement');
        
        characteristic.addEventListener('characteristicvaluechanged', handleHRValue);
        await characteristic.startNotifications();
        
        hrmDevice = device;
        hrmCharacteristic = characteristic;
        usingRealHRM = true;
        
        statusEl.textContent = '✅ Yhdistetty: ' + device.name;
        connectBtn.textContent = 'Yhdistetty';
        connectBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        connectBtn.classList.add('bg-green-600');
        
        if (hrSimulationInterval) {
            clearInterval(hrSimulationInterval);
            hrSimulationInterval = null;
        }
        
        device.addEventListener('gattserverdisconnected', onHRMDisconnected);
        
    } catch (error) {
        const connectBtn = document.getElementById('connectHRMBtn');
        const statusEl = document.getElementById('hrmStatus');
        if (statusEl) statusEl.textContent = '❌ Yhdistäminen epäonnistui: ' + error.message;
        if (connectBtn) {
            connectBtn.disabled = false;
            connectBtn.textContent = 'Yhdistä Bluetooth-sykemittari';
            connectBtn.classList.remove('bg-green-600', 'bg-red-600');
            connectBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
        }
        usingRealHRM = false;
    }
}

// Handle HRM disconnection
function onHRMDisconnected() {
    const statusEl = document.getElementById('hrmStatus');
    const connectBtn = document.getElementById('connectHRMBtn');
    
    if (statusEl) statusEl.textContent = 'Ei yhdistetty - käytössä simulaatio';
    if (connectBtn) {
        connectBtn.textContent = 'Yhdistä Bluetooth-sykemittari';
        connectBtn.classList.remove('bg-green-600');
        connectBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
        connectBtn.disabled = false;
    }
    
    hrmDevice = null;
    hrmCharacteristic = null;
    usingRealHRM = false;
    
    if (workoutState.isActive && !workoutState.isPaused && !hrSimulationInterval) {
        startHRSimulation();
    }
}

// Handle incoming HR value from Bluetooth
function handleHRValue(event) {
    const value = event.target.value;
    const flags = value.getUint8(0);
    
    let heartRate;
    if (flags & 0x01) {
        heartRate = value.getUint16(1, true);
    } else {
        heartRate = value.getUint8(1);
    }
    
    workoutState.currentHR = heartRate;
    
    if (workoutState.isActive) {
        const currentHREl = document.getElementById('currentHR');
        if (currentHREl) currentHREl.textContent = heartRate;
        updateArrowIndicator();
    }
}

// Load profile with error handling
function loadProfile() {
    try {
        const saved = localStorage.getItem('hrTrainingProfile');
        if (saved) {
            userProfile = JSON.parse(saved);
            const maxHRInput = document.getElementById('maxHR');
            const restHRInput = document.getElementById('restHR');
            const fitnessLevelSelect = document.getElementById('fitnessLevel');
            const zoneWidthInput = document.getElementById('zoneWidth');
            
            if (maxHRInput) maxHRInput.value = userProfile.maxHR;
            if (restHRInput) restHRInput.value = userProfile.restHR;
            if (fitnessLevelSelect) fitnessLevelSelect.value = userProfile.fitnessLevel;
            if (zoneWidthInput) zoneWidthInput.value = userProfile.zoneWidth || 10;
            
            showWorkoutSetupScreen();
        }
    } catch (e) {
        // Jatketaan vaikka lataus epäonnistuisi
    }
}

// Save profile without console.log and alert
function saveProfile() {
    const maxHRInput = document.getElementById('maxHR');
    const restHRInput = document.getElementById('restHR');
    const fitnessLevelSelect = document.getElementById('fitnessLevel');
    const zoneWidthInput = document.getElementById('zoneWidth');
    const errorMsg = document.getElementById('profileError');
    
    if (!maxHRInput || !restHRInput || !fitnessLevelSelect || !zoneWidthInput) {
        return;
    }
    
    const maxHR = parseInt(maxHRInput.value);
    const restHR = parseInt(restHRInput.value) || 60;
    const fitnessLevel = fitnessLevelSelect.value;
    const zoneWidth = parseInt(zoneWidthInput.value) || 10;
    
    if (!maxHR || maxHR < 100 || maxHR > 250) {
        if (errorMsg) {
            errorMsg.textContent = 'Syötä kelvollinen maksimisyke (100-250 bpm)';
            errorMsg.classList.remove('hidden');
        }
        return;
    }
    
    if (errorMsg) {
        errorMsg.classList.add('hidden');
    }
    
    userProfile = { maxHR, restHR, fitnessLevel, zoneWidth };
    
    try {
        localStorage.setItem('hrTrainingProfile', JSON.stringify(userProfile));
    } catch (e) {
        // Jatketaan vaikka tallennus epäonnistuisi
    }
    
    showWorkoutSetupScreen();
}

// Screen navigation
function showProfileScreen() {
    hideAllScreens();
    document.getElementById('profileScreen').classList.remove('hidden');
}

function showWorkoutSetupScreen() {
    hideAllScreens();
    document.getElementById('workoutSetupScreen').classList.remove('hidden');
    selectLevel('medium');
    updateTotalWorkoutTime();
}

function hideAllScreens() {
    document.getElementById('profileScreen').classList.add('hidden');
    document.getElementById('workoutSetupScreen').classList.add('hidden');
    document.getElementById('workoutScreen').classList.add('hidden');
    document.getElementById('resultsScreen').classList.add('hidden');
}

// Level selection
function selectLevel(level) {
    workoutConfig.level = level;
    document.querySelectorAll('.level-btn').forEach(btn => {
        btn.classList.remove('bg-green-600', 'bg-yellow-600', 'bg-red-600');
        btn.classList.add('bg-gray-700');
    });
    
    const activeBtn = document.getElementById(level + 'Btn');
    if (activeBtn) {
        activeBtn.classList.remove('bg-gray-700');
        if (level === 'easy') activeBtn.classList.add('bg-green-600');
        if (level === 'medium') activeBtn.classList.add('bg-yellow-600');
        if (level === 'hard') activeBtn.classList.add('bg-red-600');
    }
    
    updateTotalWorkoutTime();
}

// Calculate total workout time
function updateTotalWorkoutTime() {
    const warmupDuration = workoutConfig.warmupTime * 60;
    const peakDuration = workoutConfig.peakDuration;
    const restDuration = workoutConfig.restDuration;
    const cooldownDuration = workoutConfig.cooldownTime * 60;
    const totalPeakRestDuration = workoutConfig.peakCount * (peakDuration + restDuration) - restDuration;
    const totalDuration = warmupDuration + totalPeakRestDuration + cooldownDuration;
    
    workoutState.totalWorkoutTime = totalDuration;
    
    const minutes = Math.floor(totalDuration / 60);
    const seconds = totalDuration % 60;
    const totalTimeDisplay = document.getElementById('totalWorkoutTime');
    if (totalTimeDisplay) {
        totalTimeDisplay.value = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}

// Calculate target zones
function calculateTargetZone(phase) {
    const maxHR = userProfile.maxHR;
    let lower, upper;
    
    switch(phase) {
        case 'warmup':
            lower = Math.round(maxHR * 0.50);
            upper = Math.round(maxHR * 0.60);
            break;
        case 'peak':
            if (workoutConfig.level === 'easy') {
                lower = Math.round(maxHR * 0.60);
                upper = Math.round(maxHR * 0.70);
            } else if (workoutConfig.level === 'medium') {
                lower = Math.round(maxHR * 0.70);
                upper = Math.round(maxHR * 0.80);
            } else {
                lower = Math.round(maxHR * 0.80);
                upper = Math.round(maxHR * 0.90);
            }
            break;
        case 'rest':
            lower = Math.round(maxHR * 0.50);
            upper = Math.round(maxHR * 0.60);
            break;
        case 'cooldown':
            lower = Math.round(maxHR * 0.40);
            upper = Math.round(maxHR * 0.50);
            break;
        default:
            lower = Math.round(maxHR * 0.50);
            upper = Math.round(maxHR * 0.60);
    }
    
    return { lower, upper };
}

// Generate full workout plan with smooth boundaries
function generateWorkoutPlan() {
    const plan = [];
    const timeLabels = [];
    const lowerPlan = [];
    const upperPlan = [];
    const warmupDuration = workoutConfig.warmupTime * 60;
    const peakDuration = workoutConfig.peakDuration;
    const restDuration = workoutConfig.restDuration;
    const cooldownDuration = workoutConfig.cooldownTime * 60;

    let totalSeconds = 0;
    const zoneWidth = userProfile.zoneWidth || 10;

    // Helper function to create smooth transitions for ALL values
    function createSmoothTransition(startHR, endHR, duration, phase, startZone, endZone) {
        const steps = Math.floor(duration / 5);

        for (let i = 0; i < steps; i++) {
            const progress = i / steps;
            // Use sine wave for smooth transition
            const easeProgress = 0.5 - 0.5 * Math.cos(progress * Math.PI);
            const currentHR = Math.round(startHR + (endHR - 