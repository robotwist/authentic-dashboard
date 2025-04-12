// Welcome Modal Functionality
document.addEventListener('DOMContentLoaded', function() {
    const welcomeModal = document.querySelector('.welcome-modal');
    const closeBtn = document.querySelector('.welcome-modal-close');
    const skipBtn = document.querySelector('#skipWelcomeTour');
    const nextBtn = document.querySelector('#nextWelcomeStep');
    const steps = document.querySelectorAll('.welcome-step');
    const stepDots = document.querySelectorAll('.step-dot');
    const getExtensionBtn = document.querySelector('#getExtensionBtn');
    const learnMoreBtn = document.querySelector('#learnMoreBtn');
    
    let currentStep = 1;
    
    // Check if this is the user's first visit
    function isFirstVisit() {
        return !localStorage.getItem('hasSeenWelcome');
    }
    
    // Mark as visited
    function markAsVisited() {
        localStorage.setItem('hasSeenWelcome', 'true');
    }
    
    // Show welcome modal for first-time visitors
    if (isFirstVisit() && welcomeModal) {
        welcomeModal.classList.add('active');
        showStep(1);
    }
    
    // Close modal function
    function closeModal() {
        welcomeModal.classList.remove('active');
        markAsVisited();
    }
    
    // Show specific step
    function showStep(stepIndex) {
        steps.forEach((step, index) => {
            const stepNum = parseInt(step.getAttribute('data-step'));
            if (stepNum === stepIndex) {
                step.style.display = 'block';
            } else {
                step.style.display = 'none';
            }
        });
        
        // Update step indicators
        stepDots.forEach((dot, index) => {
            const dotNum = parseInt(dot.getAttribute('data-step'));
            if (dotNum === stepIndex) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        });
        
        // Update button text for last step
        if (stepIndex === steps.length) {
            nextBtn.textContent = 'Get Started';
        } else {
            nextBtn.textContent = 'Next';
        }
        
        currentStep = stepIndex;
    }
    
    // Event Listeners
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
    
    if (skipBtn) {
        skipBtn.addEventListener('click', closeModal);
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', function() {
            if (currentStep < steps.length) {
                showStep(currentStep + 1);
            } else {
                closeModal();
            }
        });
    }
    
    // Step indicator clicks
    stepDots.forEach((dot) => {
        dot.addEventListener('click', function() {
            const step = parseInt(this.getAttribute('data-step'));
            showStep(step);
        });
    });
    
    // Close when clicking backdrop
    if (welcomeModal) {
        welcomeModal.addEventListener('click', function(e) {
            if (e.target === welcomeModal || e.target.classList.contains('welcome-modal-backdrop')) {
                closeModal();
            }
        });
    }
    
    // Handle extension link
    if (getExtensionBtn) {
        getExtensionBtn.addEventListener('click', function(e) {
            e.preventDefault();
            // Open Chrome Web Store in new tab
            window.open('https://chrome.google.com/webstore/detail/authentic-dashboard/', '_blank');
        });
    }
    
    // Handle learn more link
    if (learnMoreBtn) {
        learnMoreBtn.addEventListener('click', function(e) {
            e.preventDefault();
            // Close modal and scroll to specific section
            closeModal();
            const infoSection = document.querySelector('.onboarding-info') || document.querySelector('.info-panel');
            if (infoSection) {
                infoSection.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }
    
    // Reset welcome modal (development helper)
    window.resetWelcomeModal = function() {
        localStorage.removeItem('hasSeenWelcome');
        console.log('Welcome modal has been reset. Refresh to see it again.');
    };
}); 