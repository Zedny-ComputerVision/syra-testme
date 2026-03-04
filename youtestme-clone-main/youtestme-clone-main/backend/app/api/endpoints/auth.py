from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import UserCreate, UserResponse, Token, LoginRequest, WhatsAppSendCode, WhatsAppVerifyCode
from app.core.security import get_password_hash, verify_password, create_access_token
from app.api.deps import get_current_user

router = APIRouter()

@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if user exists
    result = await db.execute(select(User).where(User.email == user_in.email))
    user = result.scalars().first()
    if user:
        raise HTTPException(
            status_code=400,
            detail="User already exists",
        )
    
    # Hash password
    hashed_password = get_password_hash(user_in.password)
    
    # Create user
    db_user = User(
        name=user_in.name,
        email=user_in.email,
        password_hash=hashed_password,
        role=user_in.role
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    
    # Generate Token
    token = create_access_token(data={"id": db_user.id, "role": db_user.role})
    
    return {"token": token, "user": db_user}

@router.post("/login", response_model=Token)
async def login(login_data: LoginRequest, db: AsyncSession = Depends(get_db)):
    # Check user
    result = await db.execute(select(User).where(User.email == login_data.email))
    user = result.scalars().first()
    if not user:
        raise HTTPException(
            status_code=400,
            detail="Invalid credentials",
        )
    
    # Check password
    if not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=400,
            detail="Invalid credentials",
        )
    
    # Generate Token
    token = create_access_token(data={"id": user.id, "role": user.role})
    
    return {"token": token, "user": user}

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.post("/whatsapp/send-code")
async def send_whatsapp_code(data: WhatsAppSendCode):
    # In a real app, you would integrate with a WhatsApp API provider (e.g. Twilio, Meta)
    # For this simulation, we'll return a mock success response with a code.
    mock_code = "123456"
    return {
        "success": True,
        "message": f"Verification code sent to {data.phone}. Mock: {mock_code}"
    }

@router.post("/whatsapp/verify-code")
async def verify_whatsapp_code(data: WhatsAppVerifyCode):
    # In a real app, you would check the code against a database or cache (e.g. Redis)
    if data.code == "123456":
        return {
            "success": True,
            "message": "Phone number verified successfully"
        }
    else:
        raise HTTPException(
            status_code=400,
            detail="Invalid verification code"
        )
