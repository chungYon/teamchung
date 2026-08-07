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

def get_hobbies_score(hobbies1: str, hobbies2: str) -> int:
    h1 = set([h.strip() for h in (hobbies1 or "").split(",") if h.strip()])
    h2 = set([h.strip() for h in (hobbies2 or "").split(",") if h.strip()])
    return len(h1.intersection(h2)) * 15

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
