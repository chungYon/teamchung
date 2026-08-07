from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
import models
import schemas
from database import engine, get_db

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Mentor-Mentee Matching API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/users", response_model=schemas.UserResponse)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    # In a real app we'd hash the password here
    db_user = models.User(
        username=user.username,
        password=user.password, 
        name=user.name,
        gender=user.gender,
        age=user.age,
        mbti=user.mbti,
        hobbies=user.hobbies,
        living_type=user.living_type,
        is_mentor=user.is_mentor,
        phone=user.phone
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

# Simple login mechanism
class LoginData(schemas.BaseModel):
    username: str
    password: str

@app.post("/login")
def login(login_data: LoginData, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == login_data.username, models.User.password == login_data.password).first()
    if not db_user:
        raise HTTPException(status_code=400, detail="Invalid credentials")
    return {"message": "Login successful", "user_id": db_user.id}

@app.get("/users/{user_id}", response_model=schemas.UserResponse)
def get_user(user_id: int, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

from typing import List

@app.post("/api/match")
def trigger_matching(db: Session = Depends(get_db)):
    from matcher import match_users
    matches = match_users(db)
    return {"message": f"Created {len(matches)} matches", "match_ids": [m.id for m in matches]}

@app.get("/api/matches", response_model=List[schemas.MatchBase])
def get_matches(db: Session = Depends(get_db)):
    return db.query(models.Match).all()

# Get matches for a specific user
@app.get("/api/users/{user_id}/match")
def get_user_match(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.is_mentor:
        match = db.query(models.Match).filter(models.Match.mentor_id == user_id).first()
    else:
        match = db.query(models.Match).filter(models.Match.mentee_id == user_id).first()
        
    if not match:
        return {"status": "unmatched"}
    
    mentor = db.query(models.User).filter(models.User.id == match.mentor_id).first()
    mentee = db.query(models.User).filter(models.User.id == match.mentee_id).first()
    
    partner = mentee if user.is_mentor else mentor
        
    return {
        "status": "matched",
        "match_id": match.id,
        "mentor_id": match.mentor_id,
        "mentee_id": match.mentee_id,
        "score": match.score,
        "partner_name": partner.name if partner else "Unknown",
        "partner_role": "멘티 (신입생)" if user.is_mentor else "멘토 (재학생)",
        "partner_mbti": partner.mbti if partner else "",
        "partner_hobbies": partner.hobbies if partner else ""
    }

@app.post("/api/missions")
def assign_mission(mission: schemas.MissionBase, db: Session = Depends(get_db)):
    # .model_dump() is available in Pydantic v2. In v1, it's .dict()
    # To be safe across versions, let's just assemble it
    db_mission = models.Mission(
        match_id=mission.match_id, 
        title=mission.title, 
        description=mission.description, 
        points=mission.points
    )
    db.add(db_mission)
    db.commit()
    db.refresh(db_mission)
    return db_mission

@app.get("/api/matches/{match_id}/missions")
def get_match_missions(match_id: int, db: Session = Depends(get_db)):
    missions = db.query(models.Mission).filter(models.Mission.match_id == match_id).all()
    return missions

class MissionSubmit(schemas.BaseModel):
    proof_url: str

@app.post("/api/missions/{mission_id}/submit")
def submit_mission(mission_id: int, payload: MissionSubmit, db: Session = Depends(get_db)):
    db_mission = db.query(models.Mission).filter(models.Mission.id == mission_id).first()
    if not db_mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    
    if db_mission.is_completed:
        raise HTTPException(status_code=400, detail="Mission already completed")
    
    db_mission.is_completed = True
    db_mission.proof_url = payload.proof_url
    
    # Update match score
    match = db.query(models.Match).filter(models.Match.id == db_mission.match_id).first()
    if match:
        match.score += db_mission.points
        
    db.commit()
    return {"message": "Mission submitted successfully", "points_earned": db_mission.points}

@app.get("/api/leaderboard")
def get_leaderboard(db: Session = Depends(get_db)):
    matches = db.query(models.Match).order_by(models.Match.score.desc()).all()
    result = []
    for idx, m in enumerate(matches):
        mentor = db.query(models.User).filter(models.User.id == m.mentor_id).first()
        mentee = db.query(models.User).filter(models.User.id == m.mentee_id).first()
        completed_missions = db.query(models.Mission).filter(models.Mission.match_id == m.id, models.Mission.is_completed == True).count()
        if mentor and mentee:
            result.append({
                "rank": idx + 1,
                "match_id": m.id,
                "team_name": f"{mentor.name} & {mentee.name}",
                "completed_missions": completed_missions,
                "score": m.score
            })
    return result
