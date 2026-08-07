from sqlalchemy.orm import Session
import models
import schemas
from typing import List

# matcher.py contains the matching logic for pairing mentors and mentees.
# The primary matching criteria are MBTI compatibility and shared hobbies.
# This file only computes matching scores and produces Match records.

# MBTI compatibility is approximated using a simplified compatibility chart.
# Each MBTI pair is classified into a compatibility category and then
# converted to a numeric score so the matching algorithm can compare pairs.
# Categories are intentionally coarse: best, good, neutral, and bad.
MBTI_TYPES = {
    "INFP", "ENFP", "INFJ", "ENFJ", "INTJ", "ENTJ", "INTP", "ENTP",
    "ISFP", "ESFP", "ISTP", "ESTP", "ISFJ", "ESFJ", "ISTJ", "ESTJ"
}

COMPATIBILITY_SCORES = {
    "best": 100,
    "good": 75,
    "neutral": 50,
    "bad": 20,
}


def normalize_mbti(mbti: str) -> str:
    # Normalize an MBTI input by trimming whitespace, converting to upper case,
    # and verifying it has exactly four valid MBTI letters.
    # Returns an empty string if the input is invalid, which signals a poor
    # compatibility category when calculating scores.
    mbti = (mbti or "").strip().upper()
    if len(mbti) != 4:
        return ""
    if mbti[0] not in {"I", "E"} or mbti[1] not in {"N", "S"}:
        return ""
    if mbti[2] not in {"T", "F"} or mbti[3] not in {"J", "P"}:
        return ""
    return mbti


def get_mbti_category(mbti1: str, mbti2: str) -> str:
    mbti1 = normalize_mbti(mbti1)
    mbti2 = normalize_mbti(mbti2)
    if not mbti1 or not mbti2:
        return "bad"
    if mbti1 == mbti2:
        return "best"

    same_group = mbti1[1] == mbti2[1]
    shared_letters = sum(1 for a, b in zip(mbti1, mbti2) if a == b)

    # Chart-inspired compatibility classification logic.
    # Use the MBTI second letter group (N/S) to reflect broader similarity.
    # Then use shared letter count to refine the category.
    if same_group:
        if shared_letters >= 3:
            # Most letters match and same intuition/sensing group.
            return "best"
        if shared_letters == 2:
            # Some significant overlap, usually a good match.
            return "good"
        return "neutral"

    if shared_letters >= 3:
        # Different S/N groups, but still enough letter overlap to be good.
        return "good"
    if shared_letters == 2:
        # Moderate overlap across different groups.
        return "neutral"
    return "bad"


def get_mbti_score(mbti1: str, mbti2: str) -> int:
    # Convert the compatibility category into a numeric score for ranking.
    category = get_mbti_category(mbti1, mbti2)
    return COMPATIBILITY_SCORES.get(category, 20)

# Calculate hobby compatibility by parsing comma-separated hobby lists.
# Hobby strings are normalized to lowercase and split by comma.
# Shared hobbies are counted once, and each common hobby earns 15 points.
HOBBY_CATEGORIES = {
    "운동": {"러닝", "헬스", "테니스", "클라이밍", "자전거"},
    "음식": {"요리", "맛집탐방"},
    "게임": {"롤", "오버워치", "배그"},
    "여행": {"국내여행", "해외여행", "캠핑"},
    "미디어/SNS": {"인스타", "유튜브", "넷플릭스"},
    "문화/예술": {"영화관람", "음악감상", "독서"},
    "IT/자기계발": {"알고리즘 코딩", "시스템 구축", "외국어 회화"},
}
HOBBY_TO_CATEGORY = {
    hobby.lower(): category
    for category, hobbies in HOBBY_CATEGORIES.items()
    for hobby in hobbies
}


def get_hobbies_score(hobbies1: str, hobbies2: str) -> int:
    h1 = {h.strip().lower() for h in (hobbies1 or "").split(",") if h.strip()}
    h2 = {h.strip().lower() for h in (hobbies2 or "").split(",") if h.strip()}
    common = h1.intersection(h2)
    score = len(common) * 15

    categories1 = {HOBBY_TO_CATEGORY[h] for h in h1 - common if h in HOBBY_TO_CATEGORY}
    categories2 = {HOBBY_TO_CATEGORY[h] for h in h2 - common if h in HOBBY_TO_CATEGORY}
    return score + len(categories1.intersection(categories2)) * 5

def get_profile_score(user1: models.User, user2: models.User) -> int:
    """Add small bonuses for profile factors that help everyday compatibility."""
    score = 0

    if user1.age is not None and user2.age is not None:
        if user1.age == user2.age:
            score += 5
        elif abs(user1.age - user2.age) <= 2:
            score += 2

    if user1.gender and user1.gender == user2.gender:
        score += 5

    if user1.living_type and user1.living_type == user2.living_type:
        score += 5

    return score


# Main matching routine.
# 1. Finds all currently unmatched mentor and mentee users.
# 2. For each mentee, calculates compatibility scores against available mentors.
# 3. Chooses the mentor with the highest combined MBTI and hobby score.
# 4. Creates a Match record and updates both users to matched status.
# 5. Commits all changes and refreshes the created matches.

# Note: This is a greedy matching algorithm. It is simple and works well for
# smaller groups, but it may not produce globally optimal pairings when there
# are many users or uneven mentor/mentee counts.
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
            
            # Calculate separate compatibility components and add them.
            score = get_mbti_score(mentor.mbti, mentee.mbti)
            score += get_hobbies_score(mentor.hobbies, mentee.hobbies)
            score += get_profile_score(mentor, mentee)
            
            if score > best_score:
                best_score = score
                best_mentor = mentor
        
        if best_mentor:
            new_match = models.Match(mentor_id=best_mentor.id, mentee_id=mentee.id, status="active", score=best_score)
            db.add(new_match)
            
            best_mentor.match_status = "matched"
            mentee.match_status = "matched"
            
            # Remove mentor from the pool so they are not matched more than once.
            unmatched_mentors.remove(best_mentor)
            matches_created.append(new_match)
    
    db.commit()
    for m in matches_created:
        db.refresh(m)
        
    return matches_created
