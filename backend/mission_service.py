from mission_data import get_missions, get_required_count, ISLAND_SLOTS
import models


def get_first_mission_id():
    """순서상 맨 앞 미션. 이걸 깨야 나머지가 열린다.
    관리자가 목록을 바꿔도 따라가도록 id를 고정하지 않는다."""
    missions = get_missions()
    return missions[0]["id"] if missions else None

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
    if len(completed_ids) >= get_required_count():
        return False, "이미 모든 미션을 완료했습니다"

    # 첫 미션만 순서가 고정이고, 그 뒤로는 남은 미션 중 아무거나 고를 수 있다.
    first_id = get_first_mission_id()
    if first_id is not None and first_id not in completed_ids and mission_id != first_id:
        return False, "첫 만남 미션을 먼저 완료해야 합니다"
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
    catalog = get_missions()
    required = get_required_count()
    first_id = get_first_mission_id()

    completed_count = len(completed_ids)
    finished = required > 0 and completed_count >= required

    missions = []
    for m in catalog:
        if m["id"] in completed_ids:
            status = "done"
        elif m["id"] in pending_ids:
            status = "pending"
        elif finished:
            # 필요한 개수를 채웠으면 남은 미션은 더 못 한다
            status = "locked"
        elif first_id is not None and first_id not in completed_ids:
            # 첫 미션 전에는 그것만 열린다
            status = "open" if m["id"] == first_id else "locked"
        else:
            # 첫 미션을 깬 뒤로는 남은 미션 전부 열린다 (골라서 진행)
            status = "open"
        missions.append({**m, "status": status})

    return {
        "completed_count": completed_count,
        "total": required,
        "catalog_total": len(catalog),
        "progress": min(1.0, completed_count / required) if required else 0.0,
        "stage1_done": first_id in completed_ids if first_id is not None else False,
        "finished": finished,
        "current_island": get_current_island(completed_count),
        "islands": get_island_states(completed_count),
        "missions": missions,
    }
