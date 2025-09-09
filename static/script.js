document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({ behavior: 'smooth' });
    });
});


window.addEventListener('load', () => {
    const navbar = document.querySelector('.navbar');
    const navLinks = document.querySelectorAll('.nav-menu .nav-links');
    if (navbar) {
        requestAnimationFrame(() => navbar.classList.add('nav-enter'));
    }
    navLinks.forEach((link, idx) => {
        setTimeout(() => link.classList.add('nav-link-enter'), 120 + idx * 80);
    });
});


const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('inview');
            observer.unobserve(entry.target);
        }
    });
}, { threshold: 0.15 });


document.querySelectorAll('.section').forEach(sec => {
    if (!sec.id || sec.id === 'home') return;
    observer.observe(sec);
});


const webcamVideo = document.getElementById('webcam-video');
const webcamCanvas = document.getElementById('webcam-canvas');
const streamFeed = document.getElementById('stream-feed');
const cameraPlaceholder = document.getElementById('camera-placeholder');
const startCameraBtn = document.getElementById('start-camera-btn');
const captureBtn = document.getElementById('capture-btn');
const startStreamBtn = document.getElementById('start-stream-btn');
const stopCameraBtn = document.getElementById('stop-camera-btn');
const cameraStatus = document.getElementById('camera-status');
const resultContent = document.getElementById('result-content');
const ctaDetect = document.getElementById('cta-detect');
const realtimeSection = document.getElementById('realtime');
const captureModeBtn = document.getElementById('capture-mode-btn');
const streamModeBtn = document.getElementById('stream-mode-btn');

let stream = null;
let isCameraActive = false;
let isStreaming = false;
let currentMode = 'capture';


if (captureModeBtn && streamModeBtn) {
    captureModeBtn.addEventListener('click', () => {
        currentMode = 'capture';
        captureModeBtn.classList.add('active');
        streamModeBtn.classList.remove('active');
        resetUI();
    });
    
    streamModeBtn.addEventListener('click', () => {
        currentMode = 'stream';
        streamModeBtn.classList.add('active');
        captureModeBtn.classList.remove('active');
        resetUI();
    });
}


if (startCameraBtn) {
    startCameraBtn.addEventListener('click', async () => {
        if (currentMode === 'capture') {
            try {
                cameraStatus.textContent = 'Starting camera...';
                stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { width: 640, height: 480 } 
                });
                
                webcamVideo.srcObject = stream;
                webcamVideo.style.display = 'block';
                cameraPlaceholder.style.display = 'none';
                
                startCameraBtn.style.display = 'none';
                captureBtn.style.display = 'inline-block';
                stopCameraBtn.style.display = 'inline-block';
                
                cameraStatus.textContent = 'Camera ready - Click capture';
                isCameraActive = true;
            } catch (error) {
                console.error('Camera error:', error);
                cameraStatus.textContent = 'Camera access denied';
            }
        }
    });
}


if (startStreamBtn) {
    startStreamBtn.addEventListener('click', () => {
        if (currentMode === 'stream') {
            const url = streamFeed.getAttribute('data-video-url');
            cameraStatus.textContent = 'Starting stream...';
            
            streamFeed.onload = () => { 
                cameraStatus.textContent = 'Streaming...'; 
            };
            streamFeed.onerror = () => { 
                cameraStatus.textContent = 'Stream error'; 
            };
            
            streamFeed.src = `${url}?t=${Date.now()}`;
            streamFeed.style.display = 'block';
            cameraPlaceholder.style.display = 'none';
            
            startStreamBtn.style.display = 'none';
            stopCameraBtn.style.display = 'inline-block';
            isStreaming = true;
        }
    });
}


if (captureBtn) {
    captureBtn.addEventListener('click', async () => {
        if (!isCameraActive) return;
        
        try {
            cameraStatus.textContent = 'Capturing...';
            
            const ctx = webcamCanvas.getContext('2d');
            webcamCanvas.width = webcamVideo.videoWidth;
            webcamCanvas.height = webcamVideo.videoHeight;
            ctx.drawImage(webcamVideo, 0, 0);
            
            
            webcamCanvas.toBlob(async (blob) => {
                const formData = new FormData();
                formData.append('file', blob, 'capture.jpg');
                
                try {
                    const response = await fetch('/detect', {
                        method: 'POST',
                        body: formData
                    });
                    
                    const result = await response.json();
                    displayDetectionResult(webcamCanvas.toDataURL(), result);
                    cameraStatus.textContent = 'Detection complete';
                } catch (error) {
                    console.error('Detection error:', error);
                    cameraStatus.textContent = 'Detection failed';
                }
            }, 'image/jpeg', 0.8);
            
        } catch (error) {
            console.error('Capture error:', error);
            cameraStatus.textContent = 'Capture failed';
        }
    });
}


if (stopCameraBtn) {
    stopCameraBtn.addEventListener('click', () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        
        webcamVideo.style.display = 'none';
        streamFeed.style.display = 'none';
        streamFeed.src = '';
        cameraPlaceholder.style.display = 'flex';
        
        if (currentMode === 'capture') {
            startCameraBtn.style.display = 'inline-block';
            captureBtn.style.display = 'none';
        } else {
            startStreamBtn.style.display = 'inline-block';
        }
        stopCameraBtn.style.display = 'none';
        
        cameraStatus.textContent = 'Stopped';
        isCameraActive = false;
        isStreaming = false;
    });
}


function resetUI() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    
    webcamVideo.style.display = 'none';
    streamFeed.style.display = 'none';
    streamFeed.src = '';
    cameraPlaceholder.style.display = 'flex';
    
    startCameraBtn.style.display = currentMode === 'capture' ? 'inline-block' : 'none';
    startStreamBtn.style.display = currentMode === 'stream' ? 'inline-block' : 'none';
    captureBtn.style.display = 'none';
    stopCameraBtn.style.display = 'none';
    
    cameraStatus.textContent = 'Ready';
    isCameraActive = false;
    isStreaming = false;
}


function displayDetectionResult(imageDataUrl, detectionResult) {
    if (!detectionResult.results || detectionResult.results.length === 0) {
        resultContent.innerHTML = `
            <div class="no-result">
                <div class="no-result-icon">😕</div>
                <p>No faces detected in the image</p>
            </div>
        `;
        return;
    }
    
    const result = detectionResult.results[0]; 
    const labelClass = result.label === 'Mask' ? 'mask' : 'no-mask';
    const confidence = Math.round((result.confidence || 0.5) * 100);
    
    resultContent.innerHTML = `
        <div class="detection-result">
            <img src="${imageDataUrl}" alt="Captured image" />
            <div class="detection-info">
                <div class="detection-label ${labelClass}">${result.label}</div>
                <div class="detection-confidence">Confidence: ${confidence}%</div>
            </div>
        </div>
    `;
}


if (ctaDetect && realtimeSection) {
    ctaDetect.addEventListener('click', (e) => {
    e.preventDefault();
        realtimeSection.classList.remove('hidden');
        realtimeSection.scrollIntoView({ behavior: 'smooth' });
    });
}


const yearSpan = document.getElementById('year');
if (yearSpan) yearSpan.textContent = new Date().getFullYear();