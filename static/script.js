let currentMode = 'upload';
let isStreaming = false;
let uploadedFile = null;
let mediaStream = null;
let videoElement = null;
let canvas = null;
let context = null;
let detectionInterval = null;

const elements = {
    modeTabs: document.querySelectorAll('.mode-tab'),
    modeContents: document.querySelectorAll('.mode-content'),
    uploadArea: document.getElementById('upload-area'),
    fileInput: document.getElementById('file-input'),
    uploadPreview: document.getElementById('upload-preview'),
    previewImage: document.getElementById('preview-image'),
    analyzeBtn: document.getElementById('analyze-btn'),
    clearBtn: document.getElementById('clear-btn'),
    cameraView: document.getElementById('camera-view'),
    cameraPlaceholder: document.getElementById('camera-placeholder'),
    videoStream: document.getElementById('video-stream'),
    startCameraBtn: document.getElementById('start-camera'),
    stopCameraBtn: document.getElementById('stop-camera'),
    cameraStatus: document.getElementById('camera-status'),
    resultsPanel: document.getElementById('results-panel'),
    resultsContent: document.getElementById('results-content'),
    closeResultsBtn: document.getElementById('close-results'),
    loadingOverlay: document.getElementById('loading-overlay')
};

document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    initializeNavigation();
    initializeCamera();
    checkSystemStatus();
});

function initializeEventListeners() {
    elements.modeTabs.forEach(tab => {
        tab.addEventListener('click', () => switchMode(tab.dataset.mode));
    });
    
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
    
    if (elements.startCameraBtn) {
        elements.startCameraBtn.addEventListener('click', startCamera);
    }
    
    if (elements.stopCameraBtn) {
        elements.stopCameraBtn.addEventListener('click', stopCamera);
    }
    
    if (elements.closeResultsBtn) {
        elements.closeResultsBtn.addEventListener('click', closeResults);
    }
}

function initializeNavigation() {
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

function initializeCamera() {
    // Set up video element for WebRTC
    videoElement = elements.videoStream;
    
    // Create canvas for frame capture
    canvas = document.createElement('canvas');
    context = canvas.getContext('2d');
    
    // Set video attributes for mobile compatibility
    if (videoElement) {
        videoElement.setAttribute('playsinline', 'true');
        videoElement.setAttribute('webkit-playsinline', 'true');
        videoElement.muted = true;
    }
}

async function checkSystemStatus() {
    try {
        const response = await fetch('/model_status');
        const status = await response.json();
        
        if (!status.model_loaded || !status.cascade_loaded) {
            showNotification('System initialization in progress...', 'warning');
        }
    } catch (error) {
        console.error('Status check failed:', error);
    }
}

function switchMode(mode) {
    currentMode = mode;
    
    elements.modeTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === mode);
    });
    
    elements.modeContents.forEach(content => {
        content.classList.toggle('active', content.id === `${mode}-mode`);
    });
    
    if (mode === 'upload') {
        stopCamera();
        clearUpload();
    } else if (mode === 'camera') {
        clearUpload();
        stopCamera();
    }
    
    closeResults();
}

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
    
    if (!file.type.startsWith('image/')) {
        showNotification('Please select a valid image file', 'error');
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
        showNotification('Image size must be less than 10MB', 'error');
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
        showNotification('Please select an image first', 'error');
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
            showNotification('Analysis complete!', 'success');
        } else {
            throw new Error(result.error || 'Analysis failed');
        }
    } catch (error) {
        console.error('Analysis error:', error);
        showNotification(`Analysis failed: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

async function startCamera() {
    try {
        updateCameraStatus('Starting camera...', 'loading');
        
        // Check for camera support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Camera not supported by this browser');
        }
        
        // Get camera constraints for different devices
        const constraints = {
            video: {
                width: { ideal: 640, max: 1280 },
                height: { ideal: 480, max: 720 },
                facingMode: 'user' // Front camera for mobile
            },
            audio: false
        };
        
        // Request camera access
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Set up video element
        videoElement.srcObject = mediaStream;
        
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            
            // Set canvas dimensions to match video
            canvas.width = videoElement.videoWidth || 640;
            canvas.height = videoElement.videoHeight || 480;
            
            // Show video and hide placeholder
            elements.videoStream.style.display = 'block';
            elements.cameraPlaceholder.style.display = 'none';
            elements.startCameraBtn.style.display = 'none';
            elements.stopCameraBtn.style.display = 'inline-block';
            
            elements.cameraView.classList.add('streaming');
            
            isStreaming = true;
            updateCameraStatus('Live streaming...', 'active');
            
            // Start real-time detection
            startRealTimeDetection();
        };
        
        videoElement.onerror = (error) => {
            console.error('Video error:', error);
            throw new Error('Failed to start video stream');
        };
        
    } catch (error) {
        console.error('Camera start error:', error);
        
        let errorMessage = 'Camera access failed';
        if (error.name === 'NotAllowedError') {
            errorMessage = 'Camera permission denied. Please allow camera access and try again.';
        } else if (error.name === 'NotFoundError') {
            errorMessage = 'No camera found on this device.';
        } else if (error.name === 'NotSupportedError') {
            errorMessage = 'Camera not supported by this browser.';
        }
        
        updateCameraStatus('Camera failed to start', 'error');
        showNotification(errorMessage, 'error');
        
        stopCamera();
    }
}

function stopCamera() {
    // Stop media stream
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    
    // Stop real-time detection
    if (detectionInterval) {
        clearInterval(detectionInterval);
        detectionInterval = null;
    }
    
    // Reset video element
    if (videoElement) {
        videoElement.srcObject = null;
        videoElement.style.display = 'none';
    }
    
    // Reset UI
    if (elements.cameraView) {
        elements.cameraView.classList.remove('streaming');
    }
    
    elements.cameraPlaceholder.style.display = 'flex';
    elements.startCameraBtn.style.display = 'inline-block';
    elements.stopCameraBtn.style.display = 'none';
    
    isStreaming = false;
    updateCameraStatus('Ready', 'ready');
    
    // Clear any camera results
    closeResults();
}

function startRealTimeDetection() {
    if (detectionInterval) {
        clearInterval(detectionInterval);
    }
    
    // Process frames every 2 seconds for real-time detection
    detectionInterval = setInterval(async () => {
        if (isStreaming && videoElement && videoElement.readyState === 4) {
            await processVideoFrame();
        }
    }, 2000);
}

async function processVideoFrame() {
    try {
        // Draw current video frame to canvas
        context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        
        // Convert canvas to blob
        canvas.toBlob(async (blob) => {
            if (blob) {
                const formData = new FormData();
                formData.append('frame', blob, 'frame.jpg');
                
                try {
                    const response = await fetch('/process_frame', {
                        method: 'POST',
                        body: formData
                    });
                    
                    const result = await response.json();
                    
                    if (result.success && result.detections && result.detections.length > 0) {
                        // Update camera view with detection overlay
                        updateCameraOverlay(result.detections);
                    }
                } catch (error) {
                    console.error('Frame processing error:', error);
                }
            }
        }, 'image/jpeg', 0.8);
        
    } catch (error) {
        console.error('Video frame processing error:', error);
    }
}

function updateCameraOverlay(detections) {
    // Remove existing overlays
    const existingOverlays = elements.cameraView.querySelectorAll('.detection-overlay');
    existingOverlays.forEach(overlay => overlay.remove());
    
    // Add new detection overlays
    detections.forEach((detection, index) => {
        const overlay = document.createElement('div');
        overlay.className = 'detection-overlay';
        overlay.innerHTML = `
            <div class="detection-label ${detection.label.toLowerCase().replace(' ', '-')}">
                ${detection.label}: ${detection.confidence.toFixed(1)}%
            </div>
        `;
        
        // Position overlay (this would need adjustment based on video dimensions)
        overlay.style.cssText = `
            position: absolute;
            top: 10px;
            left: 10px;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 0.5rem;
            border-radius: 6px;
            font-size: 0.8rem;
            z-index: 10;
        `;
        
        elements.cameraView.appendChild(overlay);
    });
}

function updateCameraStatus(text, state = 'ready') {
    const statusElement = elements.cameraStatus;
    if (!statusElement) return;
    
    statusElement.className = `camera-status ${state}`;
    statusElement.querySelector('.status-text').textContent = text;
}

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
                                        ${detection.label}
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
                <p>No faces detected in the image</p>
                <p class="text-muted">Make sure the image contains visible faces</p>
            </div>
        `;
    }
    
    elements.resultsContent.innerHTML = resultsHTML;
    elements.resultsPanel.style.display = 'block';
    
    setTimeout(() => {
        elements.resultsPanel.scrollIntoView({ behavior: 'smooth' });
    }, 100);
}

function closeResults() {
    if (elements.resultsPanel) {
        elements.resultsPanel.style.display = 'none';
    }
}

function showLoading(show) {
    if (elements.loadingOverlay) {
        elements.loadingOverlay.style.display = show ? 'flex' : 'none';
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            ${message}
        </div>
    `;
    
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
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 4000);
}

function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeResults();
    }
    
    if (e.key === ' ' && currentMode === 'camera' && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        if (isStreaming) {
            stopCamera();
        } else {
            startCamera();
        }
    }
});

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

const styleSheet = document.createElement('style');
styleSheet.textContent = animationStyles;
document.head.appendChild(styleSheet);