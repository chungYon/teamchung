from mission_data import MISSIONS
import models


def get_match_progress(db, match_id):
    rows = db.query(models.Mission).filter(models.Mission.match_id == match_id).all()
    # 예전 '미션 할당' 기능으로 만든 행은 mission_id가 없다. 진행도 계산에서 제외.
    completed_ids = {r.mission_id for r in rows if r.is_completed and r.mission_id is not None}
    stage1_done = 0 in completed_ids

    missions = []
    for m in MISSIONS:
        if m["id"] == 0:
            status = "done" if 0 in completed_ids else "open"
        elif not stage1_done:
            status = "locked"
        else:
            status = "done" if m["id"] in completed_ids else "open"
        missions.append({**m, "status": status})

    return {
        "completed_count": len(completed_ids),
        "total": len(MISSIONS),
        "progress": len(completed_ids) / len(MISSIONS),
        "stage1_done": stage1_done,
        "missions": missions,
    }
