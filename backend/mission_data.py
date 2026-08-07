# 미션 카탈로그 10개. 팀은 이 중 8개를 골라 깨면 완주다.
# 0번(첫 만남)은 반드시 처음에 해야 하고, 나머지 9개는 순서도 조합도 자유다.
MISSIONS = [
    {"id": 0, "stage": 1, "title": "처음 만나서 같이 밥먹고 사진 찍기", "order": 0},
    {"id": 1, "stage": 2, "title": "학식 같이 먹기", "order": 1},
    {"id": 2, "stage": 2, "title": "카페에서 같이 과제하기", "order": 2},
    {"id": 3, "stage": 2, "title": "학교 상징물 앞 인증샷", "order": 3},
    {"id": 4, "stage": 2, "title": "인생네컷 찍기", "order": 4},
    {"id": 5, "stage": 2, "title": "술집에서 소주와 함께 사진", "order": 5},
    {"id": 6, "stage": 2, "title": "학교 근처 맛집 정복하기", "order": 6},
    {"id": 7, "stage": 2, "title": "같이 운동하기", "order": 7},
    {"id": 8, "stage": 2, "title": "시험기간 같이 공부하기", "order": 8},
    {"id": 9, "stage": 2, "title": "서로 엽기적인 사진 찍어주기", "order": 9},
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

# 완주에 필요한 미션 수
REQUIRED_COUNT = sum(s["slots"] for s in ISLAND_SLOTS)
