from pydantic import BaseModel, EmailStr
from typing import List, Optional, Any
from datetime import datetime

# Auth
class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: str = "candidate"

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    token: str
    user: UserResponse

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class WhatsAppSendCode(BaseModel):
    phone: str

class WhatsAppVerifyCode(BaseModel):
    phone: str
    code: str

# Test
class TestBase(BaseModel):
    name: str
    description: Optional[str] = None
    status: str = "available"
    image: Optional[str] = None
    creation_type: Optional[str] = "Test with sections"

class TestCreate(TestBase):
    created_by: int = 1

class TestResponse(TestBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

# Question
class QuestionBase(BaseModel):
    test_id: int
    text: str
    options: List[str]
    correct_option: int
    points: int = 1

class QuestionCreate(QuestionBase):
    pass

class QuestionResponse(QuestionBase):
    id: int
    
    class Config:
        from_attributes = True

# Session
class SessionBase(BaseModel):
    test_id: int
    available_from: datetime
    available_to: datetime
    seats: int
    group_id: Optional[str] = None

class SessionCreate(SessionBase):
    pass

class SessionResponse(SessionBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

# Attempt
class AttemptBase(BaseModel):
    test_id: int
    user_id: int
    session_id: Optional[int] = None

class AttemptCreate(AttemptBase):
    pass

class AttemptSubmit(BaseModel):
    answers: dict

class AttemptResponse(AttemptBase):
    id: int
    status: str
    score: Optional[int] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Equipment Check
class EquipmentCheckBase(BaseModel):
    user_id: int
    browser: str
    camera: bool
    mic: bool
    network: str

class EquipmentCheckCreate(EquipmentCheckBase):
    pass

class EquipmentCheckResponse(EquipmentCheckBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True

# Proctoring Alert
class ProctoringAlertBase(BaseModel):
    attempt_id: int
    user_id: int
    message: str

class ProctoringAlertCreate(ProctoringAlertBase):
    pass

class ProctoringAlertResponse(ProctoringAlertBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True
