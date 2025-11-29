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
let previewChart = null;
let workoutInterval = null;
let hrSimulationInterval = null;
let hrmDevice = null;
let hrmCharacteristic = null;
let usingRealHRM = false;

// Esikatselun kesto millisekunteina
const PREVIEW_DURATION_MS = 5000;

// UUSI: Dynaaminen keston laskenta
function updateDurationsFromTotal() {
    const totalMinutes = parseInt(document.getElementById('workoutDuration')?.value) || 20;
    const peakCount = parseInt(document.getElementById('peakCount')?.value) || 3;
    
    const totalSeconds = totalMinutes * 60;
    
    // Laskenta: 20% lämmittely+jäähdyttely, 80% huiput+lepojaksot
    const warmupCooldownSeconds = Math.floor(totalSeconds * 0.20); // 20% yhteensä
    const peakRestSeconds = totalSeconds - warmupCooldownSeconds;
    
    // Jaa lämmittely ja jäähdyttely tasan
    workoutConfig.warmupTime = Math.max(1, Math.floor(warmupCooldownSeconds / 2 / 60));
    workoutConfig.cooldownTime = Math.max(1, Math.floor(warmupCooldownSeconds / 2 / 60));
    
    // Huippujen ja lepojen suhde: 20% huippu, 15% lepo
    const totalCycles = peakCount + (peakCount - 1) * 0.75; // huiput + lepot (0.75x)
    workoutConfig.peakDuration = Math.max(30, Math.floor(peakRestSeconds / totalCycles));
    workoutConfig.restDuration = Math.max(30, Math.floor(workoutConfig.peakDuration * 0.75));
    
    // Päivitä UI
    if (document.getElementById('warmupTime')) {
        document.getElementById('warmupTime').value = workoutConfig.warmupTime;
    }
    if (document.getElementById('cooldownTime')) {
        document.getElementById('cooldownTime').value = workoutConfig.cooldownTime;
    }
    if (document.getElementById('totalWorkoutTime')) {
        document.getElementById('totalWorkoutTime').value = `${totalMinutes}:00`;
    }
}

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

// DEBUG-versio: tallennus + pakotettu siirtyminen asetuksiin
function saveProfile() {
    const maxHRInput = document.getElementById('maxHR');
    const restHRInput = document.getElementById('restHR');
    const fitnessLevelSelect = document.getElementById('fitnessLevel');
    const zoneWidthInput = document.getElementById('zoneWidth');
    const errorMsg = document.getElementById('profileError');

    // Tarkistetaan että elementit löytyvät
    if (!maxHRInput || !restHRInput || !fitnessLevelSelect || !zoneWidthInput) {
        alert('DEBUG: profiilin syötekenttiä ei löytynyt.');
        return;
    }

    const maxHR = parseInt(maxHRInput.value);
    const restHR = parseInt(restHRInput.value) || 60;
    const fitnessLevel = fitnessLevelSelect.value;
    const zoneWidth = parseInt(zoneWidthInput.value) || 10;

    // Näytä mitä arvoja selaimessa oikeasti on
    alert(
        'DEBUG: saveProfile kutsuttiin\n' +
        'maxHR = ' + maxHR + '\n' +
        'restHR = ' + restHR + '\n' +
        'fitnessLevel = ' + fitnessLevel + '\n' +
        'zoneWidth = ' + zoneWidth
    );

    // OHITETAAN VALIDOINNIT TÄSSÄ VAIHEESSA, jotta nähdään päästäänkö eteenpäin
    userProfile = {
        maxHR: maxHR || 180,
        restHR,
        fitnessLevel,
        zoneWidth
    };

    try {
        localStorage.setItem('hrTrainingProfile', JSON.stringify(userProfile));
    } catch (e) {
        // ei haittaa, jatketaan silti
    }

    // Pakotetaan siirtyminen treenin asetuksiin
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
    updateDurationsFromTotal(); // Päivitä heti
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
    
    updateDurationsFromTotal();
}

// KORJATTU: Calculate total workout time
function updateTotalWorkoutTime() {
    const totalTimeDisplay = document.getElementById('totalWorkoutTime');
    if (totalTimeDisplay) {
        const totalMinutes = Math.floor(workoutState.totalWorkoutTime / 60);
        const seconds = workoutState.totalWorkoutTime % 60;
        totalTimeDisplay.value = `${totalMinutes}:${seconds.toString().padStart(2, '0')}`;
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
            const currentHR = Math.round(startHR + (endHR - startHR) * easeProgress);
            
            const currentLower = Math.round(startZone.lower + (endZone.lower - startZone.lower) * easeProgress);
            const currentUpper = Math.round(startZone.upper + (endZone.upper - startZone.upper) * easeProgress);
            
            const targetHR = Math.round((currentLower + currentUpper) / 2);

            plan.push({
                phase: phase,
                targetHR: targetHR,
                lower: currentLower - zoneWidth/2,
                upper: currentUpper + zoneWidth/2
            });
            lowerPlan.push(currentLower - zoneWidth/2);
            upperPlan.push(currentUpper + zoneWidth/2);
            timeLabels.push(formatTime(totalSeconds));
            totalSeconds += 5;
        }
    }

    // Warmup - smooth start
    const warmupZone = calculateTargetZone('warmup');
    const warmupStartHR = userProfile.restHR;
    const warmupEndHR = (warmupZone.lower + warmupZone.upper) / 2;
    const warmupStartZone = {lower: warmupStartHR, upper: warmupStartHR + zoneWidth};
    createSmoothTransition(warmupStartHR, warmupEndHR, warmupDuration, 'warmup', warmupStartZone, warmupZone);

    // Peaks and rests
    for (let peak = 0; peak < workoutConfig.peakCount; peak++) {
        const peakZone = calculateTargetZone('peak');
        const peakTargetHR = (peakZone.lower + peakZone.upper) / 2;

        // Transition to peak
        const previousZone = peak === 0 ? warmupZone : calculateTargetZone('rest');
        const previousHR = (previousZone.lower + previousZone.upper) / 2;
        createSmoothTransition(previousHR, peakTargetHR, 30, 'peak', previousZone, peakZone);

        // Maintain peak
        for (let i = 30; i < peakDuration; i += 5) {
            const variation = Math.sin(i * 0.1) * 2;
            const baseLower = peakZone.lower + variation;
            const baseUpper = peakZone.upper + variation;
            const targetHR = Math.round((baseLower + baseUpper) / 2);
            
            plan.push({
                phase: 'peak',
                targetHR: targetHR,
                lower: baseLower - zoneWidth/2,
                upper: baseUpper + zoneWidth/2
            });
            lowerPlan.push(baseLower - zoneWidth/2);
            upperPlan.push(baseUpper + zoneWidth/2);
            timeLabels.push(formatTime(totalSeconds));
            totalSeconds += 5;
        }

        if (peak < workoutConfig.peakCount - 1) {
            const restZone = calculateTargetZone('rest');
            const restTargetHR = (restZone.lower + restZone.upper) / 2;

            // Transition to rest
            createSmoothTransition(peakTargetHR, restTargetHR, 30, 'rest', peakZone, restZone);

            // Maintain rest
            for (let i = 30; i < restDuration; i += 5) {
                const variation = Math.sin(i * 0.1) * 2;
                const baseLower = restZone.lower + variation;
                const baseUpper = restZone.upper + variation;
                const targetHR = Math.round((baseLower + baseUpper) / 2);
                
                plan.push({
                    phase: 'rest',
                    targetHR: targetHR,
                    lower: baseLower - zoneWidth/2,
                    upper: baseUpper + zoneWidth/2
                });
                lowerPlan.push(baseLower - zoneWidth/2);
                upperPlan.push(baseUpper + zoneWidth/2);
                timeLabels.push(formatTime(totalSeconds));
                totalSeconds += 5;
            }
        }
    }

    // Cooldown - smooth end
    const cooldownZone = calculateTargetZone('cooldown');
    const peakZoneEnd = calculateTargetZone('peak');
    const cooldownStartHR = (peakZoneEnd.lower + peakZoneEnd.upper) / 2;
    const cooldownEndHR = userProfile.restHR + 10;
    createSmoothTransition(cooldownStartHR, cooldownEndHR, cooldownDuration, 'cooldown', peakZoneEnd, cooldownZone);

    workoutState.fullWorkoutPlan = plan;
    workoutState.planTimeData = timeLabels;
    workoutState.fullLowerPlan = lowerPlan;
    workoutState.fullUpperPlan = upperPlan;
    workoutState.totalWorkoutTime = totalSeconds;
}

// UUSI: Esikatselugraafi (overlay)
function initPreviewChart() {
    const canvas = document.getElementById('previewChart');
    if (!canvas || !canvas.getContext) {
        console.error('Preview canvas elementtiä ei löytynyt');
        return;
    }

    if (previewChart) {
        previewChart.destroy();
        previewChart = null;
    }

    const ctx = canvas.getContext('2d');

    const targetHRs = workoutState.fullWorkoutPlan.map(p => p.targetHR);
    const lowerBounds = workoutState.fullLowerPlan;
    const upperBounds = workoutState.fullUpperPlan;

    previewChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: workoutState.planTimeData,
            datasets: [
                {
                    label: 'Tavoitesyke',
                    data: targetHRs,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0
                },
                {
                    label: 'Alaraja',
                    data: lowerBounds,
                    borderColor: '#10b981',
                    borderWidth: 1.5,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: 'Yläraja',
                    data: upperBounds,
                    borderColor: '#ef4444',
                    borderWidth: 1.5,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    display: true, 
                    position: 'top',
                    labels: { color: '#e5e7eb' }
                },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Aika', color: '#9ca3af' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#9ca3af', maxTicksLimit: 10 }
                },
                y: {
                    beginAtZero: false,
                    min: userProfile.restHR - 10,
                    max: userProfile.maxHR + 10,
                    title: { display: true, text: 'Syke (bpm)', color: '#9ca3af' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#9ca3af' }
                }
            }
        }
    });
}

// Pause or resume workout
function pauseResumeWorkout() {
    if (!workoutState.isActive) return;
    
    workoutState.isPaused = !workoutState.isPaused;
    const pauseBtn = document.getElementById('pauseResumeBtn');
    
    if (workoutState.isPaused) {
        // Pause
        if (pauseBtn) {
            pauseBtn.textContent = 'Jatka';
            pauseBtn.classList.remove('bg-yellow-600', 'hover:bg-yellow-700');
            pauseBtn.classList.add('bg-green-600', 'hover:bg-green-700');
        }
        
        if (workoutInterval) {
            clearInterval(workoutInterval);
            workoutInterval = null;
        }
        if (hrSimulationInterval) {
            clearInterval(hrSimulationInterval);
            hrSimulationInterval = null;
        }
        
        const statusEl = document.getElementById('zoneStatus');
        if (statusEl) {
            statusEl.textContent = 'Treeni keskeytetty';
            statusEl.className = 'text-lg font-medium zone-warning';
        }
        
    } else {
        // Resume
        if (pauseBtn) {
            pauseBtn.textContent = 'Keskeytä';
            pauseBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
            pauseBtn.classList.add('bg-yellow-600', 'hover:bg-yellow-700');
        }
        
        startWorkoutTimer();
        if (!usingRealHRM) {
            startHRSimulation();
        }
        
        updateArrowIndicator();
    }
}

// KORJATTU + ESIKATSELU: Start workout
function startWorkout() {
    // Hae elementit turvallisesti
    const peakCountInput = document.getElementById('peakCount');
    const workoutDurationInput = document.getElementById('workoutDuration');
    const workoutScreenEl = document.getElementById('workoutScreen');
    
    if (!peakCountInput || !workoutDurationInput || !workoutScreenEl) {
        console.error('Puuttuvia elementtejä');
        return;
    }
    
    // Parsi arvot
    workoutConfig.peakCount = parseInt(peakCountInput.value) || 3;
    const totalMinutes = parseInt(workoutDurationInput.value) || 20;
    
    // Laske automaattisesti
    const totalSeconds = totalMinutes * 60;
    const warmupCooldownSeconds = Math.floor(totalSeconds * 0.20); // 20%
    const peakRestSeconds = totalSeconds - warmupCooldownSeconds;
    
    workoutConfig.warmupTime = Math.max(1, Math.floor(warmupCooldownSeconds / 2 / 60));
    workoutConfig.cooldownTime = Math.max(1, Math.floor(warmupCooldownSeconds / 2 / 60));
    
    const totalCycles = workoutConfig.peakCount + (workoutConfig.peakCount - 1) * 0.75;
    workoutConfig.peakDuration = Math.max(30, Math.floor(peakRestSeconds / totalCycles));
    workoutConfig.restDuration = Math.max(30, Math.floor(workoutConfig.peakDuration * 0.75));
    
    // Nollaa treenin tila
    workoutState = {
        isActive: true,
        isPaused: false,
        currentPhase: 'warmup',
        currentPeak: 0,
        elapsedTime: 0,
        currentHR: userProfile.restHR || 70,
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
    
    // Generoi suunnitelma
    generateWorkoutPlan();
    
    // Näytä treeninäkymä
    hideAllScreens();
    workoutScreenEl.classList.remove('hidden');
    
    // Alusta pääkuvaaja, mutta ÄLÄ vielä käynnistä ajastimia
    const canvas = document.getElementById('hrChart');
    if (canvas && canvas.getContext) {
        setTimeout(() => {
            initChart();
            updateTargetZone();
            updateWorkoutDisplay(); // näyttää kokonaisajan jne.
        }, 300);
    }

    // Näytä esikatselu-overlay
    const overlay = document.getElementById('previewOverlay');
    if (overlay) {
        overlay.classList.remove('hidden');

        // Piirrä esikatselu pienen viiveen jälkeen
        setTimeout(() => {
            initPreviewChart();
        }, 300);

        // Sulje esikatselu ja käynnistä varsinaiset ajastimet
        setTimeout(() => {
            overlay.classList.add('hidden');
            startWorkoutTimer();
            if (!usingRealHRM) {
                startHRSimulation();
            }
        }, PREVIEW_DURATION_MS);
    } else {
        // Varatoiminto: jos overlay puuttuu, aloita treeni heti kuten ennenkin
        startWorkoutTimer();
        if (!usingRealHRM) {
            startHRSimulation();
        }
    }
}

// Initialize heart rate chart
function initChart() {
    const canvas = document.getElementById('hrChart');
    if (!canvas || !canvas.getContext) {
        console.error('Canvas elementtiä ei löytynyt');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    const targetHRs = workoutState.fullWorkoutPlan.map(p => p.targetHR);
    const lowerBounds = workoutState.fullLowerPlan;
    const upperBounds = workoutState.fullUpperPlan;
    
    const dynamicBackgroundPlugin = {
        id: 'dynamicBackground',
        beforeDraw: (chart) => {
            if (!workoutState.isActive || workoutState.elapsedTime === 0) return;
            
            const ctx = chart.ctx;
            const chartArea = chart.chartArea;
            const xScale = chart.scales.x;
            
            const visibleCount = 24;
            const currentIndex = Math.floor(workoutState.elapsedTime / 5);
            const halfWindow = Math.floor(visibleCount / 2);
            let startIndex = Math.max(0, currentIndex - halfWindow);
            let endIndex = Math.min(workoutState.fullWorkoutPlan.length, startIndex + visibleCount);
            
            if (endIndex === workoutState.fullWorkoutPlan.length) {
                startIndex = Math.max(0, endIndex - visibleCount);
            }
            
            const phaseColors = {
                'warmup': 'rgba(34, 197, 94, 0.3)',
                'peak': 'rgba(234, 88, 12, 0.3)',
                'rest': 'rgba(30, 64, 175, 0.3)',
                'cooldown': 'rgba(124, 58, 237, 0.3)'
            };
            
            let currentPhase = workoutState.fullWorkoutPlan[startIndex]?.phase;
            let phaseStartX = xScale.getPixelForValue(0);
            
            for (let i = startIndex; i < endIndex; i++) {
                const planItem = workoutState.fullWorkoutPlan[i];
                const visibleIndex = i - startIndex;
                const x = xScale.getPixelForValue(visibleIndex);
                
                if (planItem.phase !== currentPhase) {
                    ctx.fillStyle = phaseColors[currentPhase];
                    ctx.fillRect(phaseStartX, chartArea.top, x - phaseStartX, chartArea.height);
                    currentPhase = planItem.phase;
                    phaseStartX = x;
                }
            }
            
            if (currentPhase !== null) {
                const lastVisibleIndex = endIndex - startIndex - 1;
                const lastX = xScale.getPixelForValue(lastVisibleIndex);
                ctx.fillStyle = phaseColors[currentPhase];
                ctx.fillRect(phaseStartX, chartArea.top, lastX - phaseStartX + 1, chartArea.height);
            }
        }
    };
    
    hrChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: workoutState.planTimeData.slice(0, 24),
            datasets: [
                {
                    label: 'Syke',
                    data: [],
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    borderWidth: 3,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    order: 1
                }, {
                    label: 'Alaraja',
                    data: lowerBounds.slice(0, 24),
                    borderColor: '#10b981',
                    borderWidth: 3,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false,
                    order: 2
                }, {
                    label: 'Yläraja',
                    data: upperBounds.slice(0, 24),
                    borderColor: '#ef4444',
                    borderWidth: 3,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false,
                    order: 2
                }, {
                    label: 'Tuleva suunnitelma',
                    data: targetHRs.slice(0, 24),
                    borderColor: 'rgba(156, 163, 175, 0.4)',
                    backgroundColor: 'rgba(156, 163, 175, 0.1)',
                    borderWidth: 2,
                    borderDash: [10, 5],
                    pointRadius: 0,
                    fill: false,
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y + ' bpm';
                            }
                            return label;
                        }
                    }
                },
                dynamicBackground: {}
            },
            scales: {
                x: {
                    display: false
                },
                y: {
                    beginAtZero: false,
                    min: userProfile.restHR - 10,
                    max: userProfile.maxHR + 10,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#9ca3af' }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        },
        plugins: [dynamicBackgroundPlugin]
    });
}

// Start workout timer
function startWorkoutTimer() {
    workoutInterval = setInterval(() => {
        if (!workoutState.isActive || workoutState.isPaused) return;
        
        workoutState.elapsedTime++;
        updatePhase();
        updateWorkoutDisplay();
        updateChart();
        
    }, 1000);
}

// Simulate heart rate
function startHRSimulation() {
    hrSimulationInterval = setInterval(() => {
        if (!workoutState.isActive || workoutState.isPaused || usingRealHRM) return;
        
        const target = (workoutState.targetLower + workoutState.targetUpper) / 2;
        const current = workoutState.currentHR;
        
        let newHR;
        if (current < target) {
            newHR = current + Math.random() * 3 + 1;
        } else if (current > target) {
            newHR = current - Math.random() * 3 - 1;
        } else {
            newHR = current + (Math.random() - 0.5) * 2;
        }
        
        newHR += (Math.random() - 0.5) * 2;
        newHR = Math.max(userProfile.restHR, Math.min(userProfile.maxHR, newHR));
        
        workoutState.currentHR = Math.round(newHR);
        updateArrowIndicator();
        
    }, 2000);
}

// Update workout phase
function updatePhase() {
    const elapsed = workoutState.elapsedTime;
    const warmupDuration = workoutConfig.warmupTime * 60;
    const peakDuration = workoutConfig.peakDuration;
    const restDuration = workoutConfig.restDuration;
    const cooldownDuration = workoutConfig.cooldownTime * 60;
    
    const totalPeakRestDuration = workoutConfig.peakCount * (peakDuration + restDuration) - restDuration;
    const totalDuration = warmupDuration + totalPeakRestDuration + cooldownDuration;
    
    if (elapsed <= warmupDuration) {
        workoutState.currentPhase = 'warmup';
    } else if (elapsed <= warmupDuration + totalPeakRestDuration) {
        const timeIntoIntervals = elapsed - warmupDuration;
        const intervalCycle = peakDuration + restDuration;
        const currentCycle = timeIntoIntervals % intervalCycle;
        
        if (currentCycle < peakDuration) {
            workoutState.currentPhase = 'peak';
            workoutState.currentPeak = Math.floor(timeIntoIntervals / intervalCycle) + 1;
        } else {
            workoutState.currentPhase = 'rest';
        }
    } else if (elapsed <= totalDuration) {
        workoutState.currentPhase = 'cooldown';
    } else {
        stopWorkout();
        showResults();
    }
    
    updateTargetZone();
}

// Update target zone
function updateTargetZone() {
    const zone = calculateTargetZone(workoutState.currentPhase);
    workoutState.targetLower = zone.lower;
    workoutState.targetUpper = zone.upper;
}


// 
