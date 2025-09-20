from flask import Flask, render_template, request, jsonify, Response
import cv2
import numpy as np
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing.image import img_to_array
import os
import base64
from io import BytesIO
from PIL import Image
import json

app = Flask(__name__)

# Global variables
model = None
face_cascade = None

# Initialize model and face cascade
def initialize_components():
    global model, face_cascade
    
    try:
        model_path = 'best_mask_model.h5'
        if not os.path.exists(model_path):
            print(f"⚠️ Model file {model_path} not found. Using placeholder for demo.")
            model = None
        else:
            model = load_model(model_path)
            print(f"✅ Model loaded successfully from {model_path}")
            print(f"📊 Model input shape: {model.input_shape}")
            print(f"📊 Model output shape: {model.output_shape}")
    except Exception as e:
        print(f"❌ Error loading model: {e}")
        model = None
    
    try:
        local_cascade_path = os.path.join(os.path.dirname(__file__), 'haarcascade_frontalface_default.xml')
        cascade_path = local_cascade_path if os.path.exists(local_cascade_path) else (cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        face_cascade = cv2.CascadeClassifier(cascade_path)
        if face_cascade.empty():
            raise Exception("Failed to load face cascade")
        print(f"✅ Face cascade loaded successfully")
    except Exception as e:
        print(f"❌ Error loading face cascade: {e}")
        face_cascade = None

# Initialize components on startup
initialize_components()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    """Handle image upload and detection"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
            
        if not file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp')):
            return jsonify({'error': 'Invalid file format. Please upload an image.'}), 400
        
        # Read and process image
        img_data = file.read()
        img_array = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        
        if img is None:
            return jsonify({'error': 'Invalid image file'}), 400
        
        # Process image and get detection results
        processed_img, detections = process_image_detection(img)
        
        # Convert processed image to base64
        _, buffer = cv2.imencode('.jpg', processed_img)
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        
        return jsonify({
            'success': True,
            'image': f'data:image/jpeg;base64,{img_base64}',
            'detections': detections
        })
        
    except Exception as e:
        print(f"❌ Upload error: {e}")
        return jsonify({'error': f'Processing failed: {str(e)}'}), 500

def process_image_detection(img):
    """Process image and return annotated image with detections"""
    detections = []
    
    if face_cascade is None:
        cv2.putText(img, "Face cascade not loaded", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        return img, detections
    
    # Convert to grayscale for face detection
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Detect faces
    faces = face_cascade.detectMultiScale(
        gray, 
        scaleFactor=1.1, 
        minNeighbors=5, 
        minSize=(60, 60),
        flags=cv2.CASCADE_SCALE_IMAGE
    )
    
    for (x, y, w, h) in faces:
        try:
            # Extract face region
            face_roi = img[y:y+h, x:x+w]
            
            if w < 60 or h < 60:
                continue
            
            # If model is available, use it for prediction
            if model is not None:
                # Preprocess face for model
                face_resized = cv2.resize(face_roi, (224, 224))
                face_arr = img_to_array(face_resized)
                face_arr = np.expand_dims(face_arr, axis=0)
                face_arr = face_arr / 255.0
                
                # Get prediction
                pred = model.predict(face_arr, verbose=0)
                prob = float(pred[0][0])
                
                # Determine label and confidence
                if prob < 0.5:
                    label = 'Masked'
                    confidence = (1.0 - prob) * 100
                    color = (0, 255, 0)  # Green for masked
                    bg_color = (0, 200, 0)
                else:
                    label = 'No Mask'
                    confidence = prob * 100
                    color = (0, 0, 255)  # Red for no mask
                    bg_color = (0, 0, 200)
            else:
                # Demo mode - simulate detection
                import random
                is_masked = random.choice([True, False])
                if is_masked:
                    label = 'Masked'
                    confidence = random.uniform(75, 95)
                    color = (0, 255, 0)  # Green for masked
                    bg_color = (0, 200, 0)
                else:
                    label = 'No Mask'
                    confidence = random.uniform(70, 90)
                    color = (0, 0, 255)  # Red for no mask
                    bg_color = (0, 0, 200)
            
            # Draw bounding box with thicker lines
            cv2.rectangle(img, (x, y), (x + w, y + h), color, 3)
            
            # Prepare text
            text = f"{label}: {confidence:.1f}%"
            font = cv2.FONT_HERSHEY_DUPLEX
            font_scale = 0.7
            text_thickness = 2
            
            # Get text size for background
            (text_width, text_height), baseline = cv2.getTextSize(text, font, font_scale, text_thickness)
            
            # Draw text background
            cv2.rectangle(img, (x, y - text_height - 10), (x + text_width + 10, y), bg_color, -1)
            
            # Draw text
            cv2.putText(img, text, (x + 5, y - 5), font, font_scale, (255, 255, 255), text_thickness, cv2.LINE_AA)
            
            # Store detection info
            detections.append({
                'label': label,
                'confidence': confidence,
                'bbox': [int(x), int(y), int(w), int(h)]
            })
            
        except Exception as e:
            print(f"❌ Detection error: {e}")
            continue
    
    return img, detections

def generate_stream(camera_index=0):
    """Generate real-time video stream with face mask detection"""
    cap = cv2.VideoCapture(camera_index)
    
    # Set camera properties
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_FPS, 20)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    
    if not cap.isOpened():
        cap.open(camera_index)
    
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                print("⚠️ Failed to read frame from camera")
                break
            
            # Process frame with detection
            processed_frame, _ = process_image_detection(frame.copy())
            
            # Encode frame as JPEG
            ret, buffer = cv2.imencode('.jpg', processed_frame, 
                                     [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if not ret:
                continue
                
            jpg_bytes = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + jpg_bytes + b'\r\n')
                   
    except Exception as e:
        print(f"❌ Streaming error: {e}")
    finally:
        cap.release()
        print("📹 Camera released")

@app.route('/video_feed')
def video_feed():
    """Video streaming route"""
    try:
        return Response(generate_stream(), 
                       mimetype='multipart/x-mixed-replace; boundary=frame')
    except Exception as e:
        print(f"❌ Video feed error: {e}")
        return "Camera not available", 500

@app.route('/camera_status')
def camera_status():
    """Check camera availability"""
    try:
        cap = cv2.VideoCapture(0)
        available = cap.isOpened()
        cap.release()
        return jsonify({'available': available})
    except:
        return jsonify({'available': False})

@app.route('/model_status')
def model_status():
    """Check model and cascade status"""
    return jsonify({
        'model_loaded': model is not None,
        'cascade_loaded': face_cascade is not None and not face_cascade.empty()
    })

if __name__ == '__main__':
    print("🚀 Starting Face Mask Detection Web App...")
    print(f"📍 Model Status: {'✅ Loaded' if model else '❌ Not Loaded'}")
    print(f"📍 Face Cascade: {'✅ Loaded' if face_cascade and not face_cascade.empty() else '❌ Not Loaded'}")
    print("🌐 Access the app at: http://localhost:5000")
    
    app.run(debug=True, host='0.0.0.0', port=5000)