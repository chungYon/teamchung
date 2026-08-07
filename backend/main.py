import os
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
import models
import schemas
from database import engine, get_db
from mission_data import MISSIONS
from mission_service import get_match_progress

models.Base.metadata.create_all(bind=engine)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

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
    if login_data.username == "Admin" and login_data.password == "Admin":
        return {"message": "Login successful", "user_id": 0, "is_admin": True}

    db_user = db.query(models.User).filter(models.User.username == login_data.username, models.User.password == login_data.password).first()
    if not db_user:
        raise HTTPException(status_code=400, detail="Invalid credentials")
    return {"message": "Login successful", "user_id": db_user.id, "is_admin": False}

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
    if not missions:
        for m in MISSIONS:
            db_mission = models.Mission(
                match_id=match_id,
                mission_id=m["id"],
                title=m["title"],
                description=m.get("description", m["title"]),
                points=100,
                is_completed=False,
            )
            db.add(db_mission)
        db.commit()
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

@app.get("/api/matches/{match_id}/progress")
def get_progress(match_id: int, db: Session = Depends(get_db)):
    match = db.query(models.Match).filter(models.Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    return get_match_progress(db, match_id)


@app.post("/api/matches/{match_id}/missions/{mission_id}/complete")
async def complete_mission(
    match_id: int,
    mission_id: int,
    user_id: int = Form(...),
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")

    match = db.query(models.Match).filter(models.Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="매칭을 찾을 수 없습니다")

    if user_id not in (match.mentor_id, match.mentee_id):
        raise HTTPException(status_code=403, detail="본인 팀의 미션만 완료할 수 있습니다")

    catalog = next((m for m in MISSIONS if m["id"] == mission_id), None)
    if not catalog:
        raise HTTPException(status_code=404, detail="존재하지 않는 미션입니다")

    if mission_id != 0:
        stage1 = (
            db.query(models.Mission)
            .filter(
                models.Mission.match_id == match_id,
                models.Mission.mission_id == 0,
                models.Mission.is_completed == True,
            )
            .first()
        )
        if not stage1:
            raise HTTPException(status_code=400, detail="1단계를 먼저 완료해야 합니다")

    db_mission = (
        db.query(models.Mission)
        .filter(models.Mission.match_id == match_id, models.Mission.mission_id == mission_id)
        .first()
    )
    if db_mission and db_mission.is_completed:
        raise HTTPException(status_code=400, detail="이미 완료된 미션입니다")

    ext = os.path.splitext(photo.filename or "")[1] or ".jpg"
    filename = f"{match_id}_{mission_id}_{int(datetime.utcnow().timestamp())}{ext}"
    with open(os.path.join(UPLOAD_DIR, filename), "wb") as f:
        f.write(await photo.read())

    if not db_mission:
        db_mission = models.Mission(match_id=match_id, mission_id=mission_id, points=100)
        db.add(db_mission)

    db_mission.title = catalog["title"]
    db_mission.is_completed = True
    db_mission.proof_url = filename
    db_mission.completed_at = datetime.utcnow()

    match.score += db_mission.points

    db.commit()

    return {"message": "완료 처리되었습니다", "progress": get_match_progress(db, match_id)}


# 데모/테스트 전용: 진행도를 강제로 count개 완료 상태로 맞춘다.
# 시연 리허설을 반복하거나, 무대에서 처음부터 다시 보여줄 때 리셋용.
# 권한 검사를 하지 않으므로 실서비스에서는 반드시 제거할 것.
@app.post("/api/matches/{match_id}/debug/set-progress")
def debug_set_progress(match_id: int, count: int, db: Session = Depends(get_db)):
    match = db.query(models.Match).filter(models.Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="매칭을 찾을 수 없습니다")

    count = max(0, min(count, len(MISSIONS)))

    db.query(models.Mission).filter(models.Mission.match_id == match_id).delete()
    for m in MISSIONS[:count]:
        db.add(models.Mission(
            match_id=match_id,
            mission_id=m["id"],
            title=m["title"],
            is_completed=True,
            points=100,
            completed_at=datetime.utcnow(),
        ))

    match.score = count * 100
    db.commit()

    return get_match_progress(db, match_id)


@app.get("/api/mission-photos/{filename}")
def get_mission_photo(filename: str, user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")

    safe_name = os.path.basename(filename)
    filepath = os.path.join(UPLOAD_DIR, safe_name)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="사진을 찾을 수 없습니다")

    return FileResponse(filepath)


@app.get("/api/leaderboard")
def get_leaderboard(db: Session = Depends(get_db)):
    matches = db.query(models.Match).all()
    leaderboard = []
    for m in matches:
        mentor = db.query(models.User).filter(models.User.id == m.mentor_id).first()
        mentee = db.query(models.User).filter(models.User.id == m.mentee_id).first()
        if not mentor or not mentee:
            continue
        completed_missions = db.query(models.Mission).filter(models.Mission.match_id == m.id, models.Mission.is_completed == True).all()
        total_points = sum(mission.points for mission in completed_missions)
        leaderboard.append({
            "match_id": m.id,
            "team_name": f"{mentor.name} & {mentee.name}",
            "completed_missions": len(completed_missions),
            "score": total_points
        })
    leaderboard.sort(key=lambda item: item["score"], reverse=True)
    for idx, item in enumerate(leaderboard):
        item["rank"] = idx + 1
    return leaderboard

@app.get("/api/users", response_model=List[schemas.UserResponse])
def get_all_users(db: Session = Depends(get_db)):
    return db.query(models.User).all()
