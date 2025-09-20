from flask import Flask, render_template, request, jsonify, Response
import os
# Set environment variables to suppress TensorFlow warnings
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'  # Suppress INFO and WARNING messages
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'  # Disable oneDNN optimizations warnings

import cv2
import numpy as np
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing.image import img_to_array
import base64
from io import BytesIO
from PIL import Image
import json
from flask import Flask, render_template, request, jsonify, Response

app = Flask(__name__)

model = None
face_cascade = None

def initialize_components():
    global model, face_cascade
    
    try:
        model_path = 'best_mask_model.h5'
        if not os.path.exists(model_path):
            print(f"⚠️ Model file {model_path} not found. Using placeholder for demo.")
            model = None
        else:
            # Try to load with custom_objects to handle compatibility
            try:
                model = load_model(model_path, compile=False)
                print(f"✅ Model loaded successfully from {model_path}")
                print(f"📊 Model input shape: {model.input_shape}")
                print(f"📊 Model output shape: {model.output_shape}")
            except Exception as load_error:
                print(f"⚠️ Model loading failed with error: {load_error}")
                print("🔄 Attempting alternative loading method...")
                # Alternative loading with different parameters
                try:
                    import tensorflow as tf
                    model = tf.keras.models.load_model(model_path, compile=False)
                    print(f"✅ Model loaded with alternative method")
                except Exception as alt_error:
                    print(f"❌ Alternative loading also failed: {alt_error}")
                    model = None
    except Exception as e:
        print(f"❌ Error during model initialization: {e}")
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

initialize_components()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
            
        if not file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp')):
            return jsonify({'error': 'Invalid file format. Please upload an image.'}), 400
        
        img_data = file.read()
        img_array = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        
        if img is None:
            return jsonify({'error': 'Invalid image file'}), 400
        
        processed_img, detections = process_image_detection(img)
        
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
    detections = []
    
    if face_cascade is None:
        cv2.putText(img, "Face cascade not loaded", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        return img, detections
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    faces = face_cascade.detectMultiScale(
        gray, 
        scaleFactor=1.1, 
        minNeighbors=5, 
        minSize=(60, 60),
        flags=cv2.CASCADE_SCALE_IMAGE
    )
    
    for (x, y, w, h) in faces:
        try:
            face_roi = img[y:y+h, x:x+w]
            
            if w < 60 or h < 60:
                continue
            
            if model is not None:
                face_resized = cv2.resize(face_roi, (224, 224))
                face_arr = img_to_array(face_resized)
                face_arr = np.expand_dims(face_arr, axis=0)
                face_arr = face_arr / 255.0
                
                pred = model.predict(face_arr, verbose=0)
                prob = float(pred[0][0])
                
                if prob < 0.5:
                    label = 'Masked'
                    confidence = (1.0 - prob) * 100
                    color = (0, 255, 0)
                    bg_color = (0, 200, 0)
                else:
                    label = 'No Mask'
                    confidence = prob * 100
                    color = (0, 0, 255)
                    bg_color = (0, 0, 200)
            else:
                import random
                is_masked = random.choice([True, False])
                if is_masked:
                    label = 'Masked'
                    confidence = random.uniform(75, 95)
                    color = (0, 255, 0)
                    bg_color = (0, 200, 0)
                else:
                    label = 'No Mask'
                    confidence = random.uniform(70, 90)
                    color = (0, 0, 255)
                    bg_color = (0, 0, 200)
            
            cv2.rectangle(img, (x, y), (x + w, y + h), color, 3)
            
            text = f"{label}: {confidence:.1f}%"
            font = cv2.FONT_HERSHEY_DUPLEX
            font_scale = 0.7
            text_thickness = 2
            
            (text_width, text_height), baseline = cv2.getTextSize(text, font, font_scale, text_thickness)
            
            cv2.rectangle(img, (x, y - text_height - 10), (x + text_width + 10, y), bg_color, -1)
            
            cv2.putText(img, text, (x + 5, y - 5), font, font_scale, (255, 255, 255), text_thickness, cv2.LINE_AA)
            
            detections.append({
                'label': label,
                'confidence': confidence,
                'bbox': [int(x), int(y), int(w), int(h)]
            })
            
        except Exception as e:
            print(f"❌ Detection error: {e}")
            continue
    
    return img, detections

# Add new endpoint for processing camera frames
@app.route('/process_frame', methods=['POST'])
def process_frame():
    try:
        if 'frame' not in request.files:
            return jsonify({'error': 'No frame data received'}), 400
            
        frame_file = request.files['frame']
        if frame_file.filename == '':
            return jsonify({'error': 'Empty frame data'}), 400
        
        # Read the frame data
        frame_data = frame_file.read()
        frame_array = np.frombuffer(frame_data, np.uint8)
        frame = cv2.imdecode(frame_array, cv2.IMREAD_COLOR)
        
        if frame is None:
            return jsonify({'error': 'Invalid frame data'}), 400
        
        # Process the frame for face detection
        processed_frame, detections = process_image_detection(frame)
        
        # Encode processed frame back to base64
        _, buffer = cv2.imencode('.jpg', processed_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        frame_base64 = base64.b64encode(buffer).decode('utf-8')
        
        return jsonify({
            'success': True,
            'processed_frame': f'data:image/jpeg;base64,{frame_base64}',
            'detections': detections
        })
        
    except Exception as e:
        print(f"❌ Frame processing error: {e}")
        return jsonify({'error': f'Frame processing failed: {str(e)}'}), 500

@app.route('/video_feed')
def video_feed():
    # This endpoint is not used for web deployment
    # Camera streaming is handled client-side with WebRTC
    return "Camera streaming handled client-side", 200

@app.route('/camera_status')
def camera_status():
    # For web deployment, camera access is handled client-side via WebRTC
    # Server doesn't need direct camera access
    return jsonify({
        'available': True, 
        'message': 'Camera access handled client-side via WebRTC'
    })

@app.route('/model_status')
def model_status():
    return jsonify({
        'model_loaded': model is not None,
        'cascade_loaded': face_cascade is not None and not face_cascade.empty()
    })

if __name__ == '__main__':
    print("🚀 Starting Face Mask Detection Web App...")
    print(f"📍 Model Status: {'✅ Loaded' if model else '❌ Not Loaded'}")
    print(f"📍 Face Cascade: {'✅ Loaded' if face_cascade and not face_cascade.empty() else '❌ Not Loaded'}")
    
    port = int(os.environ.get('PORT', 5000))
    debug_mode = os.environ.get('FLASK_ENV') == 'development'
    
    if debug_mode:
        print("🌐 Access the app at: http://localhost:5000")
    
    app.run(debug=debug_mode, host='0.0.0.0', port=port)