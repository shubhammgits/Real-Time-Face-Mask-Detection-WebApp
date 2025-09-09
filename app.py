from flask import Flask, render_template, request, jsonify, Response
import cv2
import numpy as np
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing.image import img_to_array
import os

app = Flask(__name__)


try:
    model_path = 'best_mask_model.h5'
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model file {model_path} not found")
    model = load_model(model_path)
    print(f"Model loaded successfully from {model_path}")
    print(f"Model input shape: {model.input_shape}")
    print(f"Model output shape: {model.output_shape}")
except Exception as e:
    print(f"Error loading model: {e}")
    model = None


local_cascade_path = os.path.join(os.path.dirname(__file__), 'haarcascade_frontalface_default.xml')
cascade_path = local_cascade_path if os.path.exists(local_cascade_path) else (cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
face_cascade = cv2.CascadeClassifier(cascade_path)

@app.route('/')
def index():
    return render_template('index.html')

def annotate_and_predict(frame_bgr):
    if model is None:
        cv2.putText(frame_bgr, "Model not loaded", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        return frame_bgr
        
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
    
    for (x, y, w, h) in faces:
        face = frame_bgr[y:y+h, x:x+w]
        try:
            if w < 30 or h < 30:
                continue
                
            face_resized = cv2.resize(face, (224, 224))
            face_arr = img_to_array(face_resized)
            face_arr = np.expand_dims(face_arr, axis=0)
            face_arr = face_arr / 255.0
            
            pred = model.predict(face_arr, verbose=0)
            prob = float(pred[0][0])
            
            print(f"Raw prediction: {prob}")
            
            if prob < 0.5:
                label = 'Mask'
                conf = 1.0 - prob
                color = (80, 220, 100)  
            else:
                label = 'No Mask'
                conf = prob
                color = (60, 60, 255)  
                
        except Exception as e:
            print(f"Prediction error: {e}")
            label = 'Error'
            conf = 0.0
            color = (200, 200, 200)

        cv2.rectangle(frame_bgr, (x, y), (x + w, y + h), color, 2)
        text = f"{label} {int(round(conf * 100))}%"
        cv2.putText(frame_bgr, text, (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2, cv2.LINE_AA)
    return frame_bgr

def generate_stream(camera_index=0):
    cap = cv2.VideoCapture(camera_index)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_FPS, 24)
    if not cap.isOpened():
        cap.open(0)

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame = annotate_and_predict(frame)
            ret, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
            if not ret:
                continue
            jpg_bytes = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + jpg_bytes + b'\r\n')
    finally:
        cap.release()

@app.route('/video_feed')
def video_feed():
    return Response(generate_stream(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/detect', methods=['POST'])
def detect():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    img = cv2.imdecode(np.frombuffer(file.read(), np.uint8), cv2.IMREAD_COLOR)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.3, 5)

    results = []
    for (x, y, w, h) in faces:
        face = img[y:y+h, x:x+w]
        face = cv2.resize(face, (224, 224))
        face = img_to_array(face)
        face = np.expand_dims(face, axis=0)
        face = face / 255.0

        prediction = model.predict(face, verbose=0)
        prob = float(prediction[0][0])
        
        print(f"Image detection - Raw prediction: {prob}")
        
        if prob < 0.5:
            label = 'Mask'
            confidence = 1.0 - prob
        else:
            label = 'No Mask'
            confidence = prob
            
        results.append({
            'label': label, 
            'confidence': confidence,
            'bbox': [int(x), int(y), int(w), int(h)]
        })

    return jsonify({'results': results})

if __name__ == '__main__':
    app.run(debug=True)