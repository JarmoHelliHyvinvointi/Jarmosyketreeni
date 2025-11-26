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
    totalWorkoutTime: 0,
    showPreview: true,
    previewTimer: null
};

let hrChart = null;
let resultsChart = null;
let workoutInterval = null;
let hrSimulationInterval = null;
let hrmDevice = null;
let hrmCharacteristic = null;
let usingRealHRM = false;

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
    // Tämä päivittyy automaattisesti updateDurationsFromTotal-funktiossa
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
    const restDuration = workoutConfig.rest_duration;
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
            for (let i = 30; i < rest_duration; i += 5) {
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

// KORJATTU: Start workout - dynaaminen kesto
function startWorkout() {
    // Hae elementit turvallisesti
    const peakCountInput = document.getElementById('peakCount');
    const workoutDurationInput = document.getElementById('workoutDuration');
    const workoutScreenEl = document.getElementById('workoutScreen');
    
    if (!peakCountInput || !workoutDurationInput || !workoutScreenEl) {
        console.error('Puuttuvia elementtejä startWorkout-funktiossa');
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
        totalWorkoutTime: 0,
        showPreview: true,
        previewTimer: null
    };
    
    // Generoi suunnitelma
    generateWorkoutPlan();
    
    // Näytä treeninäkymä
    hideAllScreens();
    workoutScreenEl.classList.remove('hidden');
    
    // Tarkista canvas
    const canvas = document.getElementById('hrChart');
    if (canvas && canvas.getContext) {
        setTimeout(() => {
            initChart();
            startWorkoutTimer();
            if (!usingRealHRM) {
                startHRSimulation();
            }
            updateTargetZone();
        }, 300);
    }
    
    // Ajastin esikatselun poistamiseen
    workoutState.previewTimer = setTimeout(() => {
        workoutState.showPreview = false;
        console.log('Esikatselu päättyi');
    }, 3000);
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
    
    // KORJATTU: Custom plugin esikatselua varten
    const dynamicBackgroundPlugin = {
        id: 'dynamicBackground',
        beforeDraw: (chart) => {
            // Jos esikatselutila, piirrä kaikki
            if (workoutState.showPreview) {
                const ctx = chart.ctx;
                const chartArea = chart.chartArea;
                const xScale = chart.scales.x;
                
                const phaseColors = {
                    'warmup': 'rgba(34, 197, 94, 0.3)',
                    'peak': 'rgba(234, 88, 12, 0.3)',
                    'rest': 'rgba(30, 64, 175, 0.3)',
                    'cooldown': 'rgba(124, 58, 237, 0.3)'
                };
                
                let currentPhase = workoutState.fullWorkoutPlan[0]?.phase;
                let phaseStartX = xScale.getPixelForValue(0);
                
                for (let i = 0; i < workoutState.fullWorkoutPlan.length; i++) {
                    const planItem = workoutState.fullWorkoutPlan[i];
                    const x = xScale.getPixelForValue(i);
                    
                    if (planItem.phase !== currentPhase) {
                        ctx.fillStyle = phaseColors[currentPhase];
                        ctx.fillRect(phaseStartX, chartArea.top, x - phaseStartX, chartArea.height);
                        currentPhase = planItem.phase;
                        phaseStartX = x;
                    }
                }
                
                const lastX = xScale.getPixelForValue(workoutState.fullWorkoutPlan.length - 1);
                ctx.fillStyle = phaseColors[currentPhase];
                ctx.fillRect(phaseStartX, chartArea.top, lastX - phaseStartX + 1, chartArea.height);
                return; // Lopeta tässä, älä piirrä normaalitilaa
            }
            
            // Normaali piirtäminen (vanha koodi)
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
    const restDuration = workoutConfig.rest_duration;
    const cooldownDuration = workoutConfig.cooldownTime * 60;
    
    const totalPeakRestDuration = workoutConfig.peakCount * (peakDuration + rest_duration) - rest_duration;
    const totalDuration = warmupDuration + totalPeakRestDuration + cooldown_duration;
    
    if (elapsed <= warmupDuration) {
        workoutState.currentPhase = 'warmup';
    } else if (elapsed <= warmupDuration + totalPeakRestDuration) {
        const timeIntoIntervals = elapsed - warmupDuration;
        const intervalCycle = peakDuration + rest_duration;
        const currentCycle = timeIntoIntervals % interval_cycle;
        
        if (currentCycle < peakDuration) {
            workoutState.currentPhase = 'peak';
            workoutState.currentPeak = Math.floor(timeIntoIntervals / interval_cycle) + 1;
        } else {
            workoutState.currentPhase = 'rest';
        }
    } else if (elapsed <= total_duration) {
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

// KORJATTU: Update arrow indicator
function updateArrowIndicator() {
    const current = workoutState.currentHR;
    const lower = workoutState.targetLower;
    const upper = workoutState.targetUpper;
    
    const arrowEl = document.getElementById('arrowIndicator');
    const statusEl = document.getElementById('zoneStatus');
    
    if (!arrowEl || !statusEl) return;
    
    // TARKISTA ilman marginaalia
    if (current < lower) {
        arrowEl.textContent = '↑';
        arrowEl.className = 'text-4xl arrow-up';
        statusEl.textContent = 'Nosta sykettä';
        statusEl.className = 'text-lg font-medium zone-good';
    } else if (current > upper) {
        arrowEl.textContent = '↓';
        arrowEl.className = 'text-4xl arrow-down';
        statusEl.textContent = 'Laske sykettä';
        statusEl.className = 'text-lg font-medium zone-bad';
    } else {
        arrowEl.textContent = '→';
        arrowEl.className = 'text-4xl arrow-neutral';
        statusEl.textContent = 'Hyvä alueella!';
        statusEl.className = 'text-lg font-medium zone-good';
    }
}

// Update workout display
function updateWorkoutDisplay() {
    const currentHREl = document.getElementById('currentHR');
    const currentPhaseEl = document.getElementById('currentPhase');
    const currentPeakEl = document.getElementById('currentPeak');
    const elapsedEl = document.getElementById('elapsedTime');
    const totalDisplayEl = document.getElementById('totalTimeDisplay');
    const lowerTargetEl = document.getElementById('lowerTarget');
    const upperTargetEl = document.getElementById('upperTarget');
    
    if (currentHREl) currentHREl.textContent = workoutState.currentHR;
    if (currentPhaseEl) currentPhaseEl.textContent = getPhaseText(workoutState.currentPhase);
    if (currentPeakEl) currentPeakEl.textContent = `${workoutState.currentPeak} / ${workoutConfig.peakCount}`;
    
    const elapsedMinutes = Math.floor(workoutState.elapsedTime / 60);
    const elapsedSeconds = workoutState.elapsedTime % 60;
    const totalMinutes = Math.floor(workoutState.totalWorkoutTime / 60);
    const totalSeconds = workoutState.totalWorkoutTime % 60;
    
    if (elapsedEl) {
        elapsedEl.textContent = `${elapsedMinutes.toString().padStart(2, '0')}:${elapsedSeconds.toString().padStart(2, '0')}`;
    }
    if (totalDisplayEl) {
        totalDisplayEl.textContent = `${totalMinutes.toString().padStart(2, '0')}:${totalSeconds.toString().padStart(2, '0')}`;
    }
    if (lowerTargetEl) lowerTargetEl.textContent = workoutState.targetLower;
    if (upperTargetEl) upperTargetEl.textContent = workoutState.targetUpper;
}

// Get phase text in Finnish
function getPhaseText(phase) {
    switch(phase) {
        case 'warmup': return 'Lämmittely';
        case 'peak': return 'Huippu';
        case 'rest': return 'Lepo';
        case 'cooldown': return 'Jäähdyttely';
        default: return phase;
    }
}

// Format time
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Update chart
function updateChart() {
    if (!hrChart) return;
    
    // Add data point every 5 seconds
    if (workoutState.elapsedTime % 5 === 0) {
        const currentIndex = Math.floor(workoutState.elapsedTime / 5);
        const visibleCount = 24;
        const halfWindow = Math.floor(visibleCount / 2);
        let startIndex = Math.max(0, currentIndex - halfWindow);
        let endIndex = Math.min(workoutState.fullWorkoutPlan.length, startIndex + visibleCount);
        
        if (endIndex === workoutState.fullWorkoutPlan.length) {
            startIndex = Math.max(0, endIndex - visibleCount);
        }
        
        // Lisää uusi datapiste
        workoutState.hrData.push(workoutState.currentHR);
        
        // Päivitä sykedata
        const hrDataset = hrChart.data.datasets.find(ds => ds.label === 'Syke');
        if (hrDataset) {
            hrDataset.data = workoutState.hrData.slice(startIndex, endIndex);
        }
        
        // Päivitä rajat & tavoite
        const lowerDataset = hrChart.data.datasets.find(ds => ds.label === 'Alaraja');
        const upperDataset = hrChart.data.datasets.find(ds => ds.label === 'Yläraja');
        const targetDataset = hrChart.data.datasets.find(ds => ds.label === 'Tuleva suunnitelma');
        
        if (lowerDataset && upperDataset && targetDataset) {
            lowerDataset.data = workoutState.fullLowerPlan.slice(startIndex, endIndex);
            upperDataset.data = workoutState.fullUpperPlan.slice(startIndex, endIndex);
            targetDataset.data = workoutState.fullWorkoutPlan.map(p => p.targetHR).slice(startIndex, endIndex);
        }
        
        // Päivitä x-akselin labelit
        hrChart.data.labels = workoutState.planTimeData.slice(startIndex, endIndex);
        
        // Päivitä chart (plugin piirtää taustavärit automaattisesti)
        hrChart.update('none');
    }
}

// Stop workout
function stopWorkout() {
    workoutState.isActive = false;
    workoutState.isPaused = false;
    
    // Pysäytä esikatseluajastin jos on päällä
    if (workoutState.previewTimer) {
        clearTimeout(workoutState.previewTimer);
        workoutState.previewTimer = null;
    }
    
    if (workoutInterval) {
        clearInterval(workoutInterval);
        workoutInterval = null;
    }
    if (hrSimulationInterval) {
        clearInterval(hrSimulationInterval);
        hrSimulationInterval = null;
    }
    setTimeout(showResults, 100);
}

// Show results
function showResults() {
    hideAllScreens();
    document.getElementById('resultsScreen').classList.remove('hidden');
    
    // Laske tilastot
    const avgHR = Math.round(workoutState.hrData.reduce((a, b) => a + b, 0) / workoutState.hrData.length);
    const maxHR = Math.max(...workoutState.hrData);
    const minHR = Math.min(...workoutState.hrData);
    const compliance = calculateZoneCompliance();
    
    // Päivitä UI
    document.getElementById('avgHR').textContent = avgHR + ' bpm';
    document.getElementById('maxWorkoutHR').textContent = maxHR + ' bpm';
    document.getElementById('minWorkoutHR').textContent = minHR + ' bpm';
    document.getElementById('totalTime').textContent = formatTime(workoutState.elapsedTime);
    document.getElementById('zoneCompliance').textContent = compliance.percentage + '%';
    document.getElementById('score').textContent = compliance.score;
    
    // KORJAUS: Pidempi viive ja tarkistus
    setTimeout(() => {
        const canvas = document.getElementById('resultsChart');
        if (canvas && canvas.offsetParent !== null) {
            initResultsChart();
        }
    }, 300);
}

// Reset app
function resetApp() {
    // Clear all workout state
    workoutState = {
        isActive: false,
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
        totalWorkoutTime: 0,
        showPreview: true,
        previewTimer: null
    };
    
    // Clear intervals
    if (workoutInterval) {
        clearInterval(workoutInterval);
        workoutInterval = null;
    }
    if (hrSimulationInterval) {
        clearInterval(hrSimulationInterval);
        hrSimulationInterval = null;
    }
    
    // Destroy chart if it exists
    if (hrChart) {
        hrChart.destroy();
        hrChart = null;
    }
    if (resultsChart) {
        resultsChart.destroy();
        resultsChart = null;
    }
    
    // Reset HRM connection
    if (hrmCharacteristic) {
        hrmCharacteristic.stopNotifications().catch(e => console.error(e));
    }
    if (hrmDevice && hrmDevice.gatt.connected) {
        hrmDevice.gatt.disconnect();
    }
    
    // Reset UI
    const hrmStatus = document.getElementById('hrmStatus');
    const connectBtn = document.getElementById('connectHRMBtn');
    const pauseBtn = document.getElementById('pauseResumeBtn');
    
    if (hrmStatus) hrmStatus.textContent = 'Ei yhdistetty - käytössä simulaatio';
    if (connectBtn) {
        connectBtn.textContent = 'Yhdistä Bluetooth-sykemittari';
        connectBtn.classList.remove('bg-green-600');
        connectBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
        connectBtn.disabled = false;
    }
    if (pauseBtn) {
        pauseBtn.textContent = 'Keskeytä';
        pauseBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
        pauseBtn.classList.add('bg-yellow-600', 'hover:bg-yellow-700');
    }
    
    usingRealHRM = false;
    hrmDevice = null;
    hrmCharacteristic = null;
    
    // Show workout setup screen
    showWorkoutSetupScreen();
}

// Initialize results chart
function initResultsChart() {
    const canvas = document.getElementById('resultsChart');
    if (!canvas || !canvas.getContext) {
        console.error('Results canvas elementtiä ei löytynyt');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    const phaseColors = {
        'warmup': 'rgba(34, 197, 94, 0.3)',
        'peak': 'rgba(234, 88, 12, 0.3)',
        'rest': 'rgba(30, 64, 175, 0.3)',
        'cooldown': 'rgba(124, 58, 237, 0.3)'
    };
    
    resultsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: workoutState.planTimeData,
            datasets: [
                {
                    label: 'Toteutunut syke',
                    data: workoutState.hrData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    borderWidth: 3,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 5
                }, {
                    label: 'Alaraja',
                    data: workoutState.fullLowerPlan,
                    borderColor: '#10b981',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0
                }, {
                    label: 'Yläraja',
                    data: workoutState.fullUpperPlan,
                    borderColor: '#ef4444',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0
                }, {
                    label: 'Tavoitesyke',
                    data: workoutState.fullWorkoutPlan.map(p => p.targetHR),
                    borderColor: 'rgba(156, 163, 175, 0.5)',
                    borderWidth: 1,
                    borderDash: [10, 5],
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Aika', color: '#9ca3af' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#9ca3af' }
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
    
    const backgroundPlugin = {
        id: 'phaseBackgrounds',
        beforeDraw: (chart) => {
            const ctx = chart.ctx;
            const chartArea = chart.chartArea;
            const xScale = chart.scales.x;
            
            let currentPhase = workoutState.fullWorkoutPlan[0]?.phase;
            let phaseStartX = xScale.getPixelForValue(0);
            
            for (let i = 0; i < workoutState.fullWorkoutPlan.length; i++) {
                const planItem = workoutState.fullWorkoutPlan[i];
                const x = xScale.getPixelForValue(i);
                
                if (planItem.phase !== currentPhase) {
                    ctx.fillStyle = phaseColors[currentPhase];
                    ctx.fillRect(phaseStartX, chartArea.top, x - phaseStartX, chartArea.height);
                    currentPhase = planItem.phase;
                    phaseStartX = x;
                }
            }
            
            const lastX = xScale.getPixelForValue(workoutState.fullWorkoutPlan.length - 1);
            ctx.fillStyle = phaseColors[current_phase];
            ctx.fillRect(phaseStartX, chartArea.top, lastX - phaseStartX + 1, chartArea.height);
        }
    };
    
    resultsChart.plugins.register(backgroundPlugin);
    resultsChart.update();
}

// Calculate zone compliance
function calculateZoneCompliance() {
    let inZoneCount = 0;
    for (let i = 0; i < workoutState.hrData.length; i++) {
        const hr = workoutState.hrData[i];
        const lower = workoutState.fullLowerPlan[i];
        const upper = workoutState.fullUpperPlan[i];
        if (hr >= lower && hr <= upper) inZoneCount++;
    }
    const percentage = Math.round((inZoneCount / workoutState.hrData.length) * 100);
    return { percentage, score: percentage * 10 };
}

// Download results
function downloadResults() {
    const results = {
        timestamp: new Date().toISOString(),
        profile: userProfile,
        config: workoutConfig,
        stats: {
            avgHR: document.getElementById('avgHR').textContent,
            maxHR: document.getElementById('maxWorkoutHR').textContent,
            minHR: document.getElementById('minWorkoutHR').textContent,
            totalTime: document.getElementById('totalTime').textContent,
            zoneCompliance: document.getElementById('zoneCompliance').textContent,
            score: document.getElementById('score').textContent
        },
        data: {
            time: workoutState.planTimeData,
            hr: workoutState.hrData,
            lower: workoutState.fullLowerPlan,
            upper: workoutState.fullUpperPlan,
            phases: workoutState.fullWorkoutPlan.map(p => p.phase)
        }
    };
    
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `treeni_${new Date().toISOString().slice(0, 10)}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// KORJATTU: Initialize app with DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM valmis, asetetaan tapahtumankäsittelijät...');
    
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const connectHRMBtn = document.getElementById('connectHRMBtn');
    const easyBtn = document.getElementById('easyBtn');
    const mediumBtn = document.getElementById('mediumBtn');
    const hardBtn = document.getElementById('hardBtn');
    const startWorkoutBtn = document.getElementById('startWorkoutBtn');
    const pauseResumeBtn = document.getElementById('pauseResumeBtn');
    const stopWorkoutBtn = document.getElementById('stopWorkoutBtn');
    const resetAppBtn = document.getElementById('resetAppBtn');
    const downloadResultsBtn = document.getElementById('downloadResultsBtn');
    
    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', saveProfile);
        console.log('✅ Tallenna Profiili -painike OK');
    } else {
        console.error('❌ Tallenna Profiili -painike puuttuu!');
    }
    
    if (settingsBtn) settingsBtn.addEventListener('click', showProfileScreen);
    if (connectHRMBtn) connectHRMBtn.addEventListener('click', connectHRM);
    if (easyBtn) easyBtn.addEventListener('click', () => selectLevel('easy'));
    if (mediumBtn) mediumBtn.addEventListener('click', () => selectLevel('medium'));
    if (hardBtn) hardBtn.addEventListener('click', () => selectLevel('hard'));
    if (startWorkoutBtn) {
        startWorkoutBtn.addEventListener('click', startWorkout);
        console.log('✅ Aloita Treeni -painike OK');
    } else {
        console.error('❌ Aloita Treeni -painike puuttuu!');
    }
    
    if (pauseResumeBtn) pauseResumeBtn.addEventListener('click', pauseResumeWorkout);
    if (stopWorkoutBtn) stopWorkoutBtn.addEventListener('click', stopWorkout);
    if (resetAppBtn) resetAppBtn.addEventListener('click', resetApp);
    if (downloadResultsBtn) downloadResultsBtn.addEventListener('click', downloadResults);
    
    // Lisää event listenerit dynaamiselle päivitykselle
    const workoutDurationInput = document.getElementById('workoutDuration');
    const peakCountInput = document.getElementById('peakCount');
    if (workoutDurationInput) {
        workoutDurationInput.addEventListener('input', updateDurationsFromTotal);
    }
    if (peakCountInput) {
        peakCountInput.addEventListener('input', updateDurationsFromTotal);
    }
    
    // Alusta
    updateDurationsFromTotal();
    loadProfile();
    
    console.log('Alustus valmis');
});