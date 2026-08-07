"""시연용 더미 회원 6명(멘토 3 / 멘티 3)을 넣고 매칭을 돌린다.

    python seed_dummy.py

- 이미 같은 아이디가 있으면 건너뛴다 (여러 번 실행해도 안전)
- 기존 회원/매칭은 건드리지 않는다 (matcher는 unmatched만 짝지음)
- 실명·실제 번호는 쓰지 않는다
"""

import models
from database import SessionLocal, engine
from matcher import match_users

models.Base.metadata.create_all(bind=engine)

DUMMIES = [
    # --- 멘토 (재학생) ---
    dict(username="mentor_a", name="한별", gender="F", age=23, mbti="ENFP",
         hobbies="영화관람,독서,맛집탐방", living_type="자취", is_mentor=True,
         phone="010-0000-1001"),
    dict(username="mentor_b", name="도윤", gender="M", age=24, mbti="ISTJ",
         hobbies="헬스,러닝,알고리즘 코딩", living_type="통학", is_mentor=True,
         phone="010-0000-1002"),
    dict(username="mentor_c", name="서온", gender="F", age=22, mbti="INFJ",
         hobbies="넷플릭스,음악감상,캠핑", living_type="기숙사", is_mentor=True,
         phone="010-0000-1003"),

    # --- 멘티 (신입생) ---
    # 한별과 취미 2개(영화관람·독서)가 겹치고 MBTI 궁합도 좋게
    dict(username="mentee_a", name="유하", gender="F", age=20, mbti="INFP",
         hobbies="영화관람,독서,인스타", living_type="자취", is_mentor=False,
         phone="010-0000-2001"),
    # 도윤과 취미 2개(헬스·알고리즘 코딩) + 통학까지 같게
    dict(username="mentee_b", name="재이", gender="M", age=20, mbti="ESFJ",
         hobbies="헬스,알고리즘 코딩,롤", living_type="통학", is_mentor=False,
         phone="010-0000-2002"),
    # 서온과 취미 1개(넷플릭스) + 같은 '문화/예술' 분야
    dict(username="mentee_c", name="가온", gender="F", age=21, mbti="ENFJ",
         hobbies="넷플릭스,유튜브,국내여행", living_type="기숙사", is_mentor=False,
         phone="010-0000-2003"),
]


def main():
    db = SessionLocal()
    try:
        added = []
        for d in DUMMIES:
            exists = db.query(models.User).filter(
                models.User.username == d["username"]
            ).first()
            if exists:
                print(f"  건너뜀 (이미 있음): {d['username']}")
                continue
            user = models.User(password="pw", match_status="unmatched", **d)
            db.add(user)
            added.append(d["username"])
        db.commit()

        if added:
            print(f"\n추가된 회원 {len(added)}명: {', '.join(added)}")
        else:
            print("\n새로 추가된 회원 없음")

        print("\n매칭 실행...")
        created = match_users(db)
        print(f"  새로 만들어진 매칭 {len(created)}팀")

        print("\n=== 전체 매칭 현황 ===")
        from match_reason import build_reason
        for m in db.query(models.Match).all():
            mentor = db.query(models.User).get(m.mentor_id)
            mentee = db.query(models.User).get(m.mentee_id)
            if not mentor or not mentee:
                continue
            print(f"  [{m.id}] {mentor.name}({mentor.mbti}) - "
                  f"{mentee.name}({mentee.mbti})  점수 {m.score}")
            print(f"       -> {build_reason(mentor, mentee)}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
