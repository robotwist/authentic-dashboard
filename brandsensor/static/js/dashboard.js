// Welcome Modal Functionality
document.addEventListener('DOMContentLoaded', function() {
    const welcomeModal = document.querySelector('.welcome-modal');
    const closeBtn = document.querySelector('.welcome-modal-close');
    const skipBtn = document.querySelector('.btn-skip');
    const nextBtn = document.querySelector('.btn-next');
    const steps = document.querySelectorAll('.welcome-step');
    const stepDots = document.querySelectorAll('.step-dot');
    
    let currentStep = 0;
    
    // Check if this is the user's first visit
    function isFirstVisit() {
        if (localStorage.getItem('dashboardVisited')) {
            return false;
        }
        return true;
    }
    
    // Mark as visited
    function markAsVisited() {
        localStorage.setItem('dashboardVisited', 'true');
    }
    
    // Show welcome modal for first-time visitors
    if (isFirstVisit() && welcomeModal) {
        welcomeModal.classList.add('active');
        showStep(0);
    }
    
    // Close modal function
    function closeModal() {
        welcomeModal.classList.remove('active');
        markAsVisited();
    }
    
    // Show specific step
    function showStep(stepIndex) {
        steps.forEach((step, index) => {
            if (index === stepIndex) {
                step.style.display = 'block';
            } else {
                step.style.display = 'none';
            }
        });
        
        // Update step indicators
        stepDots.forEach((dot, index) => {
            if (index === stepIndex) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        });
        
        // Update button text for last step
        if (stepIndex === steps.length - 1) {
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
            if (currentStep < steps.length - 1) {
                showStep(currentStep + 1);
            } else {
                closeModal();
            }
        });
    }
    
    // Step indicator clicks
    stepDots.forEach((dot, index) => {
        dot.addEventListener('click', function() {
            showStep(index);
        });
    });
    
    // Close when clicking backdrop
    welcomeModal.addEventListener('click', function(e) {
        if (e.target === welcomeModal || e.target.classList.contains('welcome-modal-backdrop')) {
            closeModal();
        }
    });
}); 