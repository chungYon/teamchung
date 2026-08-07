from mission_data import MISSIONS
import models

# 섬은 D -> A -> S -> O -> M 순서로 하나씩 열린다.
# 앞 섬의 미션을 전부 끝내야 다음 섬이 열리고, 한 섬 안의 미션끼리는 순서가 없다.
ISLAND_ORDER = ["D", "A", "S", "O", "M"]


def get_unlocked_islands(completed_ids):
    """앞 섬을 다 깬 만큼만 열어준다. 열린 섬 코드 집합을 돌려준다."""
    unlocked = set()
    for island in ISLAND_ORDER:
        unlocked.add(island)
        island_ids = [m["id"] for m in MISSIONS if m["island"] == island]
        if not all(i in completed_ids for i in island_ids):
            break  # 이 섬이 안 끝났으면 다음 섬은 잠김
    return unlocked


def get_match_progress(db, match_id):
    rows = db.query(models.Mission).filter(models.Mission.match_id == match_id).all()
    # 예전 '미션 할당' 기능으로 만든 행은 mission_id가 없다. 진행도 계산에서 제외.
    completed_ids = {r.mission_id for r in rows if r.is_completed and r.mission_id is not None}
    unlocked = get_unlocked_islands(completed_ids)

    missions = []
    for m in MISSIONS:
        if m["id"] in completed_ids:
            status = "done"
        elif m["island"] in unlocked:
            status = "open"
        else:
            status = "locked"
        missions.append({**m, "status": status})

    islands = []
    for island in ISLAND_ORDER:
        island_missions = [m for m in MISSIONS if m["island"] == island]
        done_count = sum(1 for m in island_missions if m["id"] in completed_ids)
        if done_count == len(island_missions):
            state = "done"
        elif island in unlocked:
            state = "open"
        else:
            state = "locked"
        islands.append({
            "island": island,
            "state": state,
            "done_count": done_count,
            "total": len(island_missions),
        })

    return {
        "completed_count": len(completed_ids),
        "total": len(MISSIONS),
        "progress": len(completed_ids) / len(MISSIONS),
        "stage1_done": 0 in completed_ids,
        "islands": islands,
        "missions": missions,
    }
