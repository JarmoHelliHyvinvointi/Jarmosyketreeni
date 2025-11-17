// KORJATTU: Initialize app with safe event listeners - VERSIO 1.5.2
window.onload = function() {
    console.log('Sovellus latautuu...');
    
    // Hae elementit erikseen ja TARKISTA jokainen
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
    
    // Lisää tapahtumankäsittelijät VAIN jos elementti löytyy
    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', saveProfile);
        console.log('Tallennettu profiili-painike OK');
    } else {
        console.error('saveProfileBtn puuttuu!');
    }
    
    if (settingsBtn) settingsBtn.addEventListener('click', showProfileScreen);
    if (connectHRMBtn) connectHRMBtn.addEventListener('click', connectHRM);
    if (easyBtn) easyBtn.addEventListener('click', () => selectLevel('easy'));
    if (mediumBtn) mediumBtn.addEventListener('click', () => selectLevel('medium'));
    if (hardBtn) hardBtn.addEventListener('click', () => selectLevel('hard'));
    
    if (startWorkoutBtn) {
        startWorkoutBtn.addEventListener('click', startWorkout);
        console.log('Aloita treeni-painike OK');
    } else {
        console.error('startWorkoutBtn puuttuu!');
    }
    
    if (pauseResumeBtn) pauseResumeBtn.addEventListener('click', pauseResumeWorkout);
    if (stopWorkoutBtn) stopWorkoutBtn.addEventListener('click', stopWorkout);
    if (resetAppBtn) resetAppBtn.addEventListener('click', resetApp);
    if (downloadResultsBtn) downloadResultsBtn.addEventListener('click', downloadResults);
    
    // Lataa profiili jos on
    loadProfile();
    
    console.log('Tapahtumankäsittelijät asetettu');
};