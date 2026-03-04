from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from app.services.proctoring import analyze_frame_ai
from datetime import datetime
import random

router = APIRouter()

@router.post("/analyze")
async def analyze_frame(frame: UploadFile = File(...)):
    if not frame:
        raise HTTPException(status_code=400, detail="No image provided")
    
    content = await frame.read()
    result = await analyze_frame_ai(content, frame.filename)
    
    return {
        **result,
        "timestamp": datetime.utcnow()
    }

@router.post("/ocr-id")
async def ocr_id(id_image: UploadFile = File(...)):
    # Simulation of OCR for Egyptian ID
    # In a real scenario, this would call the AI service or use Tesseract
    
    # Analyze header bytes to verify it's an image if needed
    
    # Return mock success data for the "Egyptian ID" requirement
    return {
        "text": "JO:30312150103394\nName: Mustafa Ibrahim Safwat",
        "confidence_score": 0.95,
        "extracted_name": "Mustafa Ibrahim Safwat",
        "national_id_number": "30312150103394",
        "birth_date": "1995-05-15",
        "bottom_left_text": "IJ4687194",
        "is_national_id": True,
        "reason": "Valid ID detected"
    }

@router.post("/verify-id")
async def verify_id(
    id_image: UploadFile = File(...), 
    live_image: UploadFile = File(...)
):
    # Simulation of Face Matching
    # In a production app, we would send both images to the AI service for comparison
    
    # Mocking a high match score
    return {
        "match": True,
        "message": "Verification Successful",
        "score": 0.92 + (random.random() * 0.05)
    }
