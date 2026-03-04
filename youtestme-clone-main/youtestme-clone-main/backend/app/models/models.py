from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean, ARRAY
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), default="candidate")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    tests = relationship("Test", back_populates="creator")
    attempts = relationship("Attempt", back_populates="user")

class Test(Base):
    __tablename__ = "tests"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    status = Column(String(20), default="available")
    image = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    creator = relationship("User", back_populates="tests")
    sessions = relationship("Session", back_populates="test")
    attempts = relationship("Attempt", back_populates="test")
    questions = relationship("Question", back_populates="test")

class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("tests.id"))
    available_from = Column(DateTime)
    available_to = Column(DateTime)
    seats = Column(Integer)
    group_id = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    test = relationship("Test", back_populates="sessions")
    attempts = relationship("Attempt", back_populates="session")

class Attempt(Base):
    __tablename__ = "attempts"

    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("tests.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    session_id = Column(Integer, ForeignKey("sessions.id"))
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True))
    score = Column(Integer)
    status = Column(String(20), default="in_progress")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    test = relationship("Test", back_populates="attempts")
    user = relationship("User", back_populates="attempts")
    session = relationship("Session", back_populates="attempts")

class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("tests.id"))
    text = Column(Text, nullable=False)
    options = Column(ARRAY(String), nullable=False)
    correct_option = Column(Integer, nullable=False)
    points = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    test = relationship("Test", back_populates="questions")

class EquipmentCheck(Base):
    __tablename__ = "equipment_checks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False) # In the mongo model it was userId: Number
    browser = Column(String(100), nullable=False)
    camera = Column(Boolean, nullable=False)
    mic = Column(Boolean, nullable=False)
    network = Column(String(100), nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

class ProctoringAlert(Base):
    __tablename__ = "proctoring_alerts"

    id = Column(Integer, primary_key=True, index=True)
    attempt_id = Column(Integer, ForeignKey("attempts.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    message = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
    attempt = relationship("Attempt")

