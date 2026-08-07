from sqlalchemy.orm import Session
import models
import schemas
from typing import List

# Simple MBTI compatibility chart (mock version)
def get_mbti_score(mbti1: str, mbti2: str) -> int:
    mbti1 = mbti1.upper() if mbti1 else ""
    mbti2 = mbti2.upper() if mbti2 else ""
    score = 0
    for i in range(min(len(mbti1), len(mbti2))):
        if mbti1[i] == mbti2[i]:
            score += 10
    return score

HOBBIES_HIERARCHY = {
    "운동": ["러닝", "헬스", "테니스", "클라이밍", "자전거"],
    "음식": ["요리", "맛집탐방"],
    "게임": ["롤", "오버워치", "배그"],
    "여행": ["국내여행", "해외여행", "캠핑"],
    "미디어/SNS": ["인스타", "유튜브", "넷플릭스"],
    "문화/예술": ["영화관람", "음악감상", "독서"],
    "IT/자기계발": ["알고리즘 코딩", "시스템 구축", "외국어 회화"]
}

ITEM_TO_CATEGORY = {}
for cat, items in HOBBIES_HIERARCHY.items():
    for item in items:
        ITEM_TO_CATEGORY[item] = cat

def get_hobbies_score(hobbies1: str, hobbies2: str) -> int:
    h1 = set([h.strip() for h in (hobbies1 or "").split(",") if h.strip()])
    h2 = set([h.strip() for h in (hobbies2 or "").split(",") if h.strip()])
    
    score = 0
    # 완전 일치하는 취미는 15점 부여
    common = h1.intersection(h2)
    score += len(common) * 15
    
    # 일치하지 않는 취미 중에서, 같은 카테고리에 속하면 5점 부여
    h1_unmatched = h1 - common
    h2_unmatched = h2 - common
    
    h1_cats = set([ITEM_TO_CATEGORY[h] for h in h1_unmatched if h in ITEM_TO_CATEGORY])
    h2_cats = set([ITEM_TO_CATEGORY[h] for h in h2_unmatched if h in ITEM_TO_CATEGORY])
    
    common_cats = h1_cats.intersection(h2_cats)
    score += len(common_cats) * 5
    
    return score

def match_users(db: Session):
    unmatched_mentors = db.query(models.User).filter(
        models.User.is_mentor == True, 
        models.User.match_status == "unmatched"
    ).all()
    unmatched_mentees = db.query(models.User).filter(
        models.User.is_mentor == False, 
        models.User.match_status == "unmatched"
    ).all()
    
    matches_created = []

    for mentee in unmatched_mentees:
        best_mentor = None
        best_score = -1
        
        for mentor in unmatched_mentors:
            if mentor.match_status != "unmatched":
                continue
            
            score = get_mbti_score(mentor.mbti, mentee.mbti)
            score += get_hobbies_score(mentor.hobbies, mentee.hobbies)
            
            if score > best_score:
                best_score = score
                best_mentor = mentor
        
        if best_mentor:
            new_match = models.Match(mentor_id=best_mentor.id, mentee_id=mentee.id, status="active", score=0)
            db.add(new_match)
            
            best_mentor.match_status = "matched"
            mentee.match_status = "matched"
            
            # Remove mentor so they can't be matched again in this loop
            unmatched_mentors.remove(best_mentor)
            matches_created.append(new_match)
    
    db.commit()
    for m in matches_created:
        db.refresh(m)
        
    return matches_created
