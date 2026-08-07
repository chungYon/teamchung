from mission_data import MISSIONS, ISLAND_SLOTS, REQUIRED_COUNT
import models

ISLAND_ORDER = [s["island"] for s in ISLAND_SLOTS]

# 섬마다 "여기까지 깨면 이 섬이 끝" 하는 누적 개수
# D:1, A:3, S:4, O:6, M:8
_CUMULATIVE = []
_acc = 0
for _s in ISLAND_SLOTS:
    _acc += _s["slots"]
    _CUMULATIVE.append({"island": _s["island"], "slots": _s["slots"], "need": _acc})


def get_island_states(completed_count):
    """완료 개수만으로 섬 상태를 정한다. 미션은 섬에 고정되지 않는다."""
    states = []
    before = 0
    current_found = False
    for c in _CUMULATIVE:
        if completed_count >= c["need"]:
            state = "done"
            done_count = c["slots"]
        elif not current_found:
            state = "open"
            done_count = max(0, completed_count - before)
            current_found = True
        else:
            state = "locked"
            done_count = 0
        states.append({
            "island": c["island"],
            "state": state,
            "done_count": done_count,
            "total": c["slots"],
        })
        before = c["need"]
    return states


def get_current_island(completed_count):
    """지금 진행중인 섬. 다 깼으면 마지막 섬."""
    for c in _CUMULATIVE:
        if completed_count < c["need"]:
            return c["island"]
    return _CUMULATIVE[-1]["island"]


def can_complete(mission_id, completed_ids):
    """이 미션을 지금 완료해도 되는지. (가능여부, 안되는 이유)"""
    if mission_id in completed_ids:
        return False, "이미 완료한 미션입니다"
    if len(completed_ids) >= REQUIRED_COUNT:
        return False, "이미 모든 미션을 완료했습니다"
    if 0 not in completed_ids and mission_id != 0:
        return False, "첫 만남 미션을 먼저 완료해야 합니다"
    if 0 in completed_ids and mission_id == 0:
        return False, "이미 완료한 미션입니다"
    return True, ""


def get_match_progress(db, match_id):
    rows = db.query(models.Mission).filter(models.Mission.match_id == match_id).all()
    # 예전 '미션 할당' 기능으로 만든 행은 mission_id가 없다. 진행도 계산에서 제외.
    completed_ids = {r.mission_id for r in rows if r.is_completed and r.mission_id is not None}
    # 사진은 올렸지만 관리자 승인을 아직 못 받은 미션
    pending_ids = {
        r.mission_id for r in rows
        if not r.is_completed and r.mission_id is not None and r.proof_url
    }
    completed_count = len(completed_ids)
    finished = completed_count >= REQUIRED_COUNT

    missions = []
    for m in MISSIONS:
        if m["id"] in completed_ids:
            status = "done"
        elif m["id"] in pending_ids:
            status = "pending"
        elif finished:
            # 8개를 채웠으면 남은 미션은 더 못 한다
            status = "locked"
        elif 0 not in completed_ids:
            # 첫 만남 전에는 0번만 열린다
            status = "open" if m["id"] == 0 else "locked"
        else:
            status = "open"
        missions.append({**m, "status": status})

    return {
        "completed_count": completed_count,
        "total": REQUIRED_COUNT,
        "catalog_total": len(MISSIONS),
        "progress": min(1.0, completed_count / REQUIRED_COUNT),
        "stage1_done": 0 in completed_ids,
        "finished": finished,
        "current_island": get_current_island(completed_count),
        "islands": get_island_states(completed_count),
        "missions": missions,
    }
