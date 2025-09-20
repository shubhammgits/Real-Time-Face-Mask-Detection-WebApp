// === GLOBAL VARIABLES ===
let currentMode = 'upload';
let isStreaming = false;
let uploadedFile = null;

// === DOM ELEMENTS ===
const elements = {
    // Mode tabs
    modeTabs: document.querySelectorAll('.mode-tab'),
    modeContents: document.querySelectorAll('.mode-content'),
    
    // Upload mode
    uploadArea: document.getElementById('upload-area'),
    fileInput: document.getElementById('file-input'),
    uploadPreview: document.getElementById('upload-preview'),
    previewImage: document.getElementById('preview-image'),
    analyzeBtn: document.getElementById('analyze-btn'),
    clearBtn: document.getElementById('clear-btn'),
    
    // Camera mode
    cameraView: document.getElementById('camera-view'),
    cameraPlaceholder: document.getElementById('camera-placeholder'),
    videoStream: document.getElementById('video-stream'),
    startCameraBtn: document.getElementById('start-camera'),
    stopCameraBtn: document.getElementById('stop-camera'),
    cameraStatus: document.getElementById('camera-status'),
    
    // Results
    resultsPanel: document.getElementById('results-panel'),
    resultsContent: document.getElementById('results-content'),
    closeResultsBtn: document.getElementById('close-results'),
    
    // Loading
    loadingOverlay: document.getElementById('loading-overlay')
};

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    initializeNavigation();
    checkSystemStatus();
});

function initializeEventListeners() {
    // Mode tabs
    elements.modeTabs.forEach(tab => {
        tab.addEventListener('click', () => switchMode(tab.dataset.mode));
    });
    
    // Upload mode events
    if (elements.uploadArea) {
        elements.uploadArea.addEventListener('click', () => elements.fileInput.click());
        elements.uploadArea.addEventListener('dragover', handleDragOver);
        elements.uploadArea.addEventListener('dragleave', handleDragLeave);
        elements.uploadArea.addEventListener('drop', handleFileDrop);
    }
    
    if (elements.fileInput) {
        elements.fileInput.addEventListener('change', handleFileSelect);
    }
    
    if (elements.analyzeBtn) {
        elements.analyzeBtn.addEventListener('click', analyzeImage);
    }
    
    if (elements.clearBtn) {
        elements.clearBtn.addEventListener('click', clearUpload);
    }
    
    // Camera mode events
    if (elements.startCameraBtn) {
        elements.startCameraBtn.addEventListener('click', startCamera);
    }
    
    if (elements.stopCameraBtn) {
        elements.stopCameraBtn.addEventListener('click', stopCamera);
    }
    
    // Results panel
    if (elements.closeResultsBtn) {
        elements.closeResultsBtn.addEventListener('click', closeResults);
    }
}

function initializeNavigation() {
    // Smooth scroll for any remaining anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}

async function checkSystemStatus() {
    try {
        const response = await fetch('/model_status');
        const status = await response.json();
        
        if (!status.model_loaded || !status.cascade_loaded) {
            showNotification('⚠️ System initialization in progress...', 'warning');
        }
    } catch (error) {
        console.error('Status check failed:', error);
    }
}

// === MODE SWITCHING ===
function switchMode(mode) {
    currentMode = mode;
    
    // Update tab states
    elements.modeTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === mode);
    });
    
    // Update content visibility
    elements.modeContents.forEach(content => {
        content.classList.toggle('active', content.id === `${mode}-mode`);
    });
    
    // Reset states
    if (mode === 'upload') {
        stopCamera();
        clearUpload();
    } else if (mode === 'camera') {
        clearUpload();
        stopCamera();
    }
    
    closeResults();
}

// === UPLOAD MODE FUNCTIONS ===
function handleDragOver(e) {
    e.preventDefault();
    elements.uploadArea.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    elements.uploadArea.classList.remove('dragover');
}

function handleFileDrop(e) {
    e.preventDefault();
    elements.uploadArea.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileSelect({ target: { files } });
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        showNotification('❌ Please select a valid image file', 'error');
        return;
    }
    
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        showNotification('❌ Image size must be less than 10MB', 'error');
        return;
    }
    
    uploadedFile = file;
    displayImagePreview(file);
}

function displayImagePreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        elements.previewImage.src = e.target.result;
        elements.uploadPreview.style.display = 'block';
        elements.uploadArea.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

function clearUpload() {
    uploadedFile = null;
    elements.fileInput.value = '';
    elements.uploadPreview.style.display = 'none';
    elements.uploadArea.style.display = 'block';
    closeResults();
}

async function analyzeImage() {
    if (!uploadedFile) {
        showNotification('❌ Please select an image first', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const formData = new FormData();
        formData.append('file', uploadedFile);
        
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            displayResults(result.image, result.detections);
            showNotification('✅ Analysis complete!', 'success');
        } else {
            throw new Error(result.error || 'Analysis failed');
        }
    } catch (error) {
        console.error('Analysis error:', error);
        showNotification(`❌ Analysis failed: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

// === CAMERA MODE FUNCTIONS ===
async function startCamera() {
    try {
        updateCameraStatus('Starting camera...', 'loading');
        
        // Check camera availability first
        const cameraResponse = await fetch('/camera_status');
        const cameraStatus = await cameraResponse.json();
        
        if (!cameraStatus.available) {
            throw new Error('Camera not available');
        }
        
        // Start video stream
        const streamUrl = '/video_feed';
        elements.videoStream.src = `${streamUrl}?t=${Date.now()}`;
        
        elements.videoStream.onload = () => {
            elements.videoStream.style.display = 'block';
            elements.cameraPlaceholder.style.display = 'none';
            elements.startCameraBtn.style.display = 'none';
            elements.stopCameraBtn.style.display = 'inline-block';
            
            // Add streaming class for expanded view
            elements.cameraView.classList.add('streaming');
            
            isStreaming = true;
            updateCameraStatus('Live streaming...', 'active');
        };
        
        elements.videoStream.onerror = () => {
            throw new Error('Failed to load video stream');
        };
        
    } catch (error) {
        console.error('Camera start error:', error);
        updateCameraStatus('Camera failed to start', 'error');
        showNotification(`❌ Camera error: ${error.message}`, 'error');
    }
}

function stopCamera() {
    if (elements.videoStream) {
        elements.videoStream.src = '';
        elements.videoStream.style.display = 'none';
    }
    
    // Remove streaming class to return to normal size
    if (elements.cameraView) {
        elements.cameraView.classList.remove('streaming');
    }
    
    elements.cameraPlaceholder.style.display = 'flex';
    elements.startCameraBtn.style.display = 'inline-block';
    elements.stopCameraBtn.style.display = 'none';
    
    isStreaming = false;
    updateCameraStatus('Ready', 'ready');
}

function updateCameraStatus(text, state = 'ready') {
    const statusElement = elements.cameraStatus;
    if (!statusElement) return;
    
    statusElement.className = `camera-status ${state}`;
    statusElement.querySelector('.status-text').textContent = text;
}

// === RESULTS DISPLAY ===
function displayResults(processedImage, detections) {
    let resultsHTML = '';
    
    if (detections && detections.length > 0) {
        resultsHTML = `
            <div class="result-item">
                <img src="${processedImage}" alt="Processed image" class="result-image">
                <div class="result-info">
                    <div class="detection-cards">
                        ${detections.map((detection, index) => `
                            <div class="detection-card ${detection.label.toLowerCase().replace(' ', '-')}">
                                <div>
                                    <div class="detection-label ${detection.label.toLowerCase().replace(' ', '-')}">
                                        ${detection.label === 'Masked' ? '😷' : '😐'} ${detection.label}
                                    </div>
                                    <div class="detection-bbox">Face ${index + 1}</div>
                                </div>
                                <div class="confidence-score">${detection.confidence.toFixed(1)}%</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    } else {
        resultsHTML = `
            <div class="no-detections">
                <div class="no-detections-icon">😕</div>
                <p>No faces detected in the image</p>
                <p class="text-muted">Make sure the image contains visible faces</p>
            </div>
        `;
    }
    
    elements.resultsContent.innerHTML = resultsHTML;
    elements.resultsPanel.style.display = 'block';
    
    // Scroll to results
    setTimeout(() => {
        elements.resultsPanel.scrollIntoView({ behavior: 'smooth' });
    }, 100);
}

function closeResults() {
    if (elements.resultsPanel) {
        elements.resultsPanel.style.display = 'none';
    }
}

// === UTILITY FUNCTIONS ===
function showLoading(show) {
    if (elements.loadingOverlay) {
        elements.loadingOverlay.style.display = show ? 'flex' : 'none';
    }
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            ${message}
        </div>
    `;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: var(--glass-bg);
        border: 1px solid var(--border-primary);
        border-radius: 12px;
        padding: 1rem 1.5rem;
        color: var(--text-primary);
        backdrop-filter: var(--glass-backdrop);
        z-index: 10000;
        animation: slideInRight 0.3s ease;
        max-width: 300px;
    `;
    
    if (type === 'error') {
        notification.style.borderColor = 'var(--danger)';
        notification.style.background = 'rgba(255, 71, 87, 0.1)';
    } else if (type === 'success') {
        notification.style.borderColor = 'var(--success)';
        notification.style.background = 'rgba(0, 255, 136, 0.1)';
    } else if (type === 'warning') {
        notification.style.borderColor = 'var(--warning)';
        notification.style.background = 'rgba(255, 167, 38, 0.1)';
    }
    
    document.body.appendChild(notification);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 4000);
}

// Helper function for smooth scrolling
function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
    }
}

// === KEYBOARD SHORTCUTS ===
document.addEventListener('keydown', (e) => {
    // ESC to close results
    if (e.key === 'Escape') {
        closeResults();
    }
    
    // Space to start/stop camera (when in camera mode)
    if (e.key === ' ' && currentMode === 'camera' && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        if (isStreaming) {
            stopCamera();
        } else {
            startCamera();
        }
    }
});

// === ANIMATION STYLES ===
const animationStyles = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;

// Inject animation styles
const styleSheet = document.createElement('style');
styleSheet.textContent = animationStyles;
document.head.appendChild(styleSheet);