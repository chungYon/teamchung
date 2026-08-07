import json
import os

# 미션 카탈로그는 관리자 화면에서 추가/수정/삭제할 수 있어야 해서 JSON 파일에 둔다.
# (DB 스키마는 변경 금지라 테이블을 새로 만들지 않았다)
MISSIONS_FILE = os.path.join(os.path.dirname(__file__), "missions.json")

# 파일이 없을 때 처음 한 번 깔아주는 기본 목록
DEFAULT_MISSIONS = [
    {"id": 0, "stage": 1, "title": "처음 만나서 같이 밥먹고 사진 찍기", "order": 0, "points": 100},
    {"id": 1, "stage": 2, "title": "학식 같이 먹기", "order": 1, "points": 100},
    {"id": 2, "stage": 2, "title": "카페에서 같이 과제하기", "order": 2, "points": 100},
    {"id": 3, "stage": 2, "title": "학교 상징물 앞 인증샷", "order": 3, "points": 100},
    {"id": 4, "stage": 2, "title": "인생네컷 찍기", "order": 4, "points": 100},
    {"id": 5, "stage": 2, "title": "술집에서 소주와 함께 사진", "order": 5, "points": 100},
    {"id": 6, "stage": 2, "title": "학교 근처 맛집 정복하기", "order": 6, "points": 100},
    {"id": 7, "stage": 2, "title": "같이 운동하기", "order": 7, "points": 100},
    {"id": 8, "stage": 2, "title": "시험기간 같이 공부하기", "order": 8, "points": 100},
    {"id": 9, "stage": 2, "title": "서로 엽기적인 사진 찍어주기", "order": 9, "points": 100},
]

# 지도의 섬 5개가 몇 칸씩 담당하는지. 합이 완주에 필요한 개수(8)다.
# 미션이 섬에 고정된 게 아니라, 완료 개수가 이 칸을 순서대로 채운다.
ISLAND_SLOTS = [
    {"island": "D", "slots": 1},
    {"island": "A", "slots": 2},
    {"island": "S", "slots": 1},
    {"island": "O", "slots": 2},
    {"island": "M", "slots": 2},
]

TARGET_COUNT = sum(s["slots"] for s in ISLAND_SLOTS)

# 미션 목록에 담을 수 있는 최대 개수
MAX_MISSIONS = 15


def _normalize(m, index):
    """빠진 필드를 채워 넣는다. 예전 형식 파일도 읽히게."""
    return {
        "id": m["id"],
        "stage": m.get("stage", 1 if m["id"] == 0 else 2),
        "title": m.get("title", ""),
        "order": m.get("order", index),
        "points": int(m.get("points", 100)),
    }


def get_missions():
    if not os.path.exists(MISSIONS_FILE):
        save_missions(DEFAULT_MISSIONS)
        return [dict(m) for m in DEFAULT_MISSIONS]
    try:
        with open(MISSIONS_FILE, encoding="utf-8") as f:
            data = json.load(f)
        missions = [_normalize(m, i) for i, m in enumerate(data)]
        missions.sort(key=lambda m: m["order"])
        return missions
    except Exception:
        # 파일이 깨졌으면 기본값으로 되돌린다 (시연 중 멈추지 않게)
        save_missions(DEFAULT_MISSIONS)
        return [dict(m) for m in DEFAULT_MISSIONS]


def save_missions(missions):
    with open(MISSIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(missions, f, ensure_ascii=False, indent=2)


def get_required_count():
    """완주에 필요한 개수. 카탈로그가 8개보다 적으면 그 개수가 기준이 된다."""
    return min(TARGET_COUNT, len(get_missions()))


def next_mission_id():
    missions = get_missions()
    return (max((m["id"] for m in missions), default=-1)) + 1
