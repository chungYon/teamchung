import os
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
import models
import schemas
from database import engine, get_db
from mission_data import (
    get_missions, save_missions, get_required_count, next_mission_id, MAX_MISSIONS
)
from mission_service import get_match_progress, can_complete
from security import decrypt_value, encrypt_value
import json
from pydantic import BaseModel
from typing import Optional

models.Base.metadata.create_all(bind=engine)

SETTINGS_FILE = "settings.json"

def get_settings():
    if os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, "r") as f:
            return json.load(f)
    return {}

def save_settings(data):
    with open(SETTINGS_FILE, "w") as f:
        json.dump(data, f)

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
        raise HTTPException(status_code=400, detail="동일한 id가 등록되었습니다.")
    
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

@app.get("/api/admin/matches")
def get_admin_matches(db: Session = Depends(get_db)):
    from matcher import get_mbti_score, get_hobbies_score
    matches = db.query(models.Match).all()
    results = []
    for m in matches:
        mentor = db.query(models.User).filter(models.User.id == m.mentor_id).first()
        mentee = db.query(models.User).filter(models.User.id == m.mentee_id).first()
        if not mentor or not mentee:
            continue
        
        mbti_score = get_mbti_score(mentor.mbti, mentee.mbti)
        hobby_score = get_hobbies_score(mentor.hobbies, mentee.hobbies)
        
        results.append({
            "match_id": m.id,
            "mentor_name": mentor.name,
            "mentee_name": mentee.name,
            "mentor_mbti": mentor.mbti,
            "mentee_mbti": mentee.mbti,
            "mbti_score": mbti_score,
            "hobby_score": hobby_score,
            "total_score": m.score
        })
    return results

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

    # 왜 이 둘이 이어졌는지 한 줄 설명 (match_reason.py)
    reason = ""
    detail = {}
    if mentor and mentee:
        from match_reason import build_reason, build_detail
        reason = build_reason(mentor, mentee)
        detail = build_detail(mentor, mentee)

    return {
        "status": "matched",
        "match_id": match.id,
        "mentor_id": match.mentor_id,
        "mentee_id": match.mentee_id,
        "score": match.score,
        "partner_name": partner.name if partner else "Unknown",
        "partner_phone": partner.phone if partner else "",
        "partner_role": "멘티 (신입생)" if user.is_mentor else "멘토 (재학생)",
        "partner_mbti": partner.mbti if partner else "",
        "partner_hobbies": partner.hobbies if partner else "",
        "match_reason": reason,
        "match_detail": detail
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

def sync_match_missions(db, match_id):
    """카탈로그(missions.json)와 이 팀의 미션 행을 맞춘다.
    관리자가 미션을 추가/수정/삭제하면 사용자 화면에도 그대로 반영된다."""
    catalog = get_missions()
    by_id = {m["id"]: m for m in catalog}

    rows = db.query(models.Mission).filter(models.Mission.match_id == match_id).all()
    seen = set()
    for r in rows:
        if r.mission_id is None:
            continue  # 예전 '미션 할당'으로 만든 행은 건드리지 않는다
        m = by_id.get(r.mission_id)
        if not m:
            db.delete(r)          # 카탈로그에서 지워진 미션
            continue
        r.title = m["title"]      # 제목/배점 수정 반영
        r.points = m["points"]
        seen.add(r.mission_id)

    for m in catalog:             # 새로 추가된 미션
        if m["id"] not in seen:
            db.add(models.Mission(
                match_id=match_id,
                mission_id=m["id"],
                title=m["title"],
                description=m["title"],
                points=m["points"],
                is_completed=False,
            ))
    db.commit()


@app.get("/api/matches/{match_id}/missions")
def get_match_missions(match_id: int, db: Session = Depends(get_db)):
    sync_match_missions(db, match_id)
    return db.query(models.Mission).filter(models.Mission.match_id == match_id).all()

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

    catalog = next((m for m in get_missions() if m["id"] == mission_id), None)
    if not catalog:
        raise HTTPException(status_code=404, detail="존재하지 않는 미션입니다")

    # 첫 미션을 먼저 깨야 하고, 필요한 개수를 채우면 더 못 한다
    completed_ids = {
        r.mission_id
        for r in db.query(models.Mission).filter(models.Mission.match_id == match_id).all()
        if r.is_completed and r.mission_id is not None
    }
    allowed, reason = can_complete(mission_id, completed_ids)
    if not allowed:
        raise HTTPException(status_code=400, detail=reason)

    db_mission = (
        db.query(models.Mission)
        .filter(models.Mission.match_id == match_id, models.Mission.mission_id == mission_id)
        .first()
    )

    ext = os.path.splitext(photo.filename or "")[1] or ".jpg"
    filename = f"{match_id}_{mission_id}_{int(datetime.utcnow().timestamp())}{ext}"
    with open(os.path.join(UPLOAD_DIR, filename), "wb") as f:
        f.write(await photo.read())

    if not db_mission:
        db_mission = models.Mission(match_id=match_id, mission_id=mission_id)
        db.add(db_mission)

    db_mission.points = catalog["points"]
    db_mission.title = catalog["title"]
    db_mission.is_completed = False
    db_mission.proof_url = filename
    db_mission.completed_at = datetime.utcnow()

    db.commit()

    return {"message": "미션 승인이 요청되었습니다 (대기중)", "progress": get_match_progress(db, match_id)}


# 데모/테스트 전용: 진행도를 강제로 count개 완료 상태로 맞춘다.
# 시연 리허설을 반복하거나, 무대에서 처음부터 다시 보여줄 때 리셋용.
# 권한 검사를 하지 않으므로 실서비스에서는 반드시 제거할 것.
@app.post("/api/matches/{match_id}/debug/set-progress")
def debug_set_progress(match_id: int, count: int, db: Session = Depends(get_db)):
    match = db.query(models.Match).filter(models.Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="매칭을 찾을 수 없습니다")

    catalog = get_missions()
    count = max(0, min(count, get_required_count()))

    # 미션 행은 항상 카탈로그 전체를 유지하고 완료 여부만 바꾼다.
    # (미완료 행을 지우면 미션 보드 목록이 비어 보인다)
    db.query(models.Mission).filter(models.Mission.match_id == match_id).delete()
    for idx, m in enumerate(catalog):
        completed = idx < count
        db.add(models.Mission(
            match_id=match_id,
            mission_id=m["id"],
            title=m["title"],
            description=m["title"],
            is_completed=completed,
            points=m["points"],
            completed_at=datetime.utcnow() if completed else None,
        ))

    match.score = sum(m["points"] for m in catalog[:count])
    db.commit()

    return get_match_progress(db, match_id)

# ---------- 관리자: 미션 목록 관리 ----------
# 목록을 고치면 모든 팀의 미션 행에 그대로 반영된다 (sync_match_missions)

class MissionCatalogItem(BaseModel):
    title: str
    points: int = 100


def _sync_all_matches(db):
    for m in db.query(models.Match).all():
        sync_match_missions(db, m.id)


@app.get("/api/admin/missions/catalog")
def get_mission_catalog():
    return {
        "missions": get_missions(),
        "required_count": get_required_count(),
        "max_missions": MAX_MISSIONS,
    }


@app.post("/api/admin/missions/catalog")
def add_mission_catalog(item: MissionCatalogItem, db: Session = Depends(get_db)):
    title = item.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="미션 제목을 입력해주세요")

    missions = get_missions()
    if len(missions) >= MAX_MISSIONS:
        raise HTTPException(
            status_code=400, detail=f"미션은 최대 {MAX_MISSIONS}개까지 만들 수 있습니다"
        )

    new_id = next_mission_id()
    missions.append({
        "id": new_id,
        "stage": 2,
        "title": title,
        "order": max((m["order"] for m in missions), default=-1) + 1,
        "points": max(0, item.points),
    })
    save_missions(missions)
    _sync_all_matches(db)
    return {"message": "미션이 추가되었습니다", "id": new_id}


@app.put("/api/admin/missions/catalog/{mission_id}")
def update_mission_catalog(mission_id: int, item: MissionCatalogItem, db: Session = Depends(get_db)):
    title = item.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="미션 제목을 입력해주세요")

    missions = get_missions()
    target = next((m for m in missions if m["id"] == mission_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="존재하지 않는 미션입니다")

    target["title"] = title
    target["points"] = max(0, item.points)
    save_missions(missions)

    # 이미 완료된 미션의 점수도 새 배점으로 맞춰야 리더보드가 일치한다
    _sync_all_matches(db)
    _recalc_match_scores(db)
    return {"message": "미션이 수정되었습니다"}


@app.delete("/api/admin/missions/catalog/{mission_id}")
def delete_mission_catalog(mission_id: int, db: Session = Depends(get_db)):
    missions = get_missions()
    if not any(m["id"] == mission_id for m in missions):
        raise HTTPException(status_code=404, detail="존재하지 않는 미션입니다")
    if len(missions) <= 1:
        raise HTTPException(status_code=400, detail="미션이 하나는 남아 있어야 합니다")

    missions = [m for m in missions if m["id"] != mission_id]
    for i, m in enumerate(missions):
        m["order"] = i
    save_missions(missions)

    _sync_all_matches(db)
    _recalc_match_scores(db)
    return {"message": "미션이 삭제되었습니다"}


def _recalc_match_scores(db):
    """완료된 미션의 배점 합으로 팀 점수를 다시 계산한다."""
    for match in db.query(models.Match).all():
        rows = db.query(models.Mission).filter(
            models.Mission.match_id == match.id,
            models.Mission.is_completed == True,
        ).all()
        match.score = sum(r.points or 0 for r in rows)
    db.commit()


@app.get("/api/admin/missions/pending")
def get_admin_pending_missions(db: Session = Depends(get_db)):
    missions = db.query(models.Mission).filter(
        models.Mission.is_completed == False,
        models.Mission.proof_url != None
    ).all()
    
    result = []
    for m in missions:
        match = db.query(models.Match).filter(models.Match.id == m.match_id).first()
        result.append({
            "mission_db_id": m.id,
            "match_id": m.match_id,
            "team_name": f"{match.mentor.name} & {match.mentee.name}" if match and match.mentor and match.mentee else "알 수 없음",
            "title": m.title,
            "proof_url": m.proof_url,
            "submitted_at": m.completed_at.isoformat() + "Z" if m.completed_at else ""
        })
    return result

@app.post("/api/admin/missions/{mission_id}/approve")
def approve_admin_mission(mission_id: int, db: Session = Depends(get_db)):
    db_mission = db.query(models.Mission).filter(models.Mission.id == mission_id).first()
    if not db_mission:
        raise HTTPException(status_code=404, detail="미션을 찾을 수 없습니다.")
        
    db_mission.is_completed = True
    match = db.query(models.Match).filter(models.Match.id == db_mission.match_id).first()
    if match:
        match.score += db_mission.points
        
    db.commit()
    return {"message": "미션이 승인되었습니다."}

@app.post("/api/admin/missions/{mission_id}/reject")
def reject_admin_mission(mission_id: int, db: Session = Depends(get_db)):
    db_mission = db.query(models.Mission).filter(models.Mission.id == mission_id).first()
    if not db_mission:
        raise HTTPException(status_code=404, detail="미션을 찾을 수 없습니다.")
        
    db_mission.proof_url = None
    db.commit()
    return {"message": "미션이 반려되었습니다."}


@app.get("/api/mission-photos/{filename}")
def get_mission_photo(filename: str, user_id: int, db: Session = Depends(get_db)):
    if user_id != 0:
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
