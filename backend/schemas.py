from pydantic import BaseModel
from typing import List, Optional

class UserCreate(BaseModel):
    username: str
    password: str
    name: str
    gender: str
    age: int
    mbti: str
    hobbies: str
    living_type: str
    is_mentor: bool
    phone: str

class UserResponse(BaseModel):
    id: int
    username: str
    name: str
    gender: str
    age: int
    mbti: str
    hobbies: str
    living_type: str
    is_mentor: bool
    phone: str
    match_status: str

    class Config:
        orm_mode = True

class MatchBase(BaseModel):
    mentor_id: int
    mentee_id: int
    status: str
    score: int

class MissionBase(BaseModel):
    match_id: int
    title: str
    description: str
    points: int
