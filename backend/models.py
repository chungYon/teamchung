from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password = Column(String)  # hashed password
    name = Column(String)
    gender = Column(String)
    age = Column(Integer)
    mbti = Column(String)
    hobbies = Column(String) # Comma separated keywords
    living_type = Column(String) # 자취/통학/기숙사
    is_mentor = Column(Boolean, default=False) # true if 재학생, false if 신입생
    phone = Column(String)
    match_status = Column(String, default="unmatched") # unmatched, matched

    mentor_matches = relationship("Match", foreign_keys="[Match.mentor_id]", back_populates="mentor")
    mentee_matches = relationship("Match", foreign_keys="[Match.mentee_id]", back_populates="mentee")

class Match(Base):
    __tablename__ = "matches"

    id = Column(Integer, primary_key=True, index=True)
    mentor_id = Column(Integer, ForeignKey("users.id"))
    mentee_id = Column(Integer, ForeignKey("users.id"))
    status = Column(String, default="active") # active, completed
    score = Column(Integer, default=0)

    mentor = relationship("User", foreign_keys=[mentor_id], back_populates="mentor_matches")
    mentee = relationship("User", foreign_keys=[mentee_id], back_populates="mentee_matches")
    missions = relationship("Mission", back_populates="match")

class Mission(Base):
    __tablename__ = "missions"

    id = Column(Integer, primary_key=True, index=True)
    match_id = Column(Integer, ForeignKey("matches.id"))
    mission_id = Column(Integer)  # mission_data.py의 MISSIONS 카탈로그 id (0~9)
    title = Column(String)
    description = Column(String)
    is_completed = Column(Boolean, default=False)
    proof_url = Column(String, nullable=True) # Text input or image url
    points = Column(Integer, default=100)
    completed_at = Column(DateTime, nullable=True)

    match = relationship("Match", back_populates="missions")
