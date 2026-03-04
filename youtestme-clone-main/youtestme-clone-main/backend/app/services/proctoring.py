import httpx
import os
from dotenv import load_dotenv

load_dotenv()

AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://localhost:8000")

async def analyze_frame_ai(file_content: bytes, filename: str):
    async with httpx.AsyncClient() as client:
        files = {'file': (filename, file_content, 'image/jpeg')}
        try:
            # Face detection
            face_resp = await client.post(f"{AI_SERVICE_URL}/proctor/detect-face", files=files)
            face_result = face_resp.json()
            
            # Gaze check
            # Note: The original combined them in the controller. 
            # Re-sending the file or using the AI service's capability.
            # In the original TS:
            # const faceResult = await detectFace(req.file.buffer);
            # const gazeResult = await checkGaze(req.file.buffer);
            
            gaze_resp = await client.post(f"{AI_SERVICE_URL}/proctor/gaze", files=files)
            gaze_result = gaze_resp.json()
            
            return {
                "face": face_result,
                "gaze": gaze_result
            }
        except Exception as e:
            print(f"AI Service Error: {e}")
            return {
                "face": {"status": "error", "message": "AI Service Unavailable"},
                "gaze": {"status": "error", "message": "AI Service Unavailable"}
            }
