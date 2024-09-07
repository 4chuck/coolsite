import cv2
from deepface import DeepFace
import pyttsx3

# Initialize the text-to-speech engine
engine = pyttsx3.init()

# Function to convert text to speech
def speak(text):
    engine.say(text)
    engine.runAndWait()

# Function to detect facial expressions
def detect_expression(frame):
    try:
        # Analyze the frame to detect the dominant emotion
        result = DeepFace.analyze(frame, actions=['emotion'], enforce_detection=False)
        return result['dominant_emotion']
    except Exception as e:
        # If there's an error (like no face detected), return None
        return None

# Start video capture using the webcam
cap = cv2.VideoCapture(0)

# Keep track of the last expression to avoid repetition
last_expression = None

while True:
    ret, frame = cap.read()
    if not ret:
        break

    # Detect the expression in the current frame
    expression = detect_expression(frame)

    # If an expression is detected and it's different from the last one
    if expression and expression != last_expression:
        # Speak the detected expression
        speak(f"You are {expression}")
        last_expression = expression

    # Display the video feed with the detected expression
    cv2.putText(frame, f"Expression: {expression}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2, cv2.LINE_AA)
    cv2.imshow("Facial Expression Recognition", frame)

    # Exit the loop when 'q' is pressed
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# Release the video capture and close windows
cap.release()
cv2.destroyAllWindows()
