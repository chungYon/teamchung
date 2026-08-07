"""매칭된 두 사람에게 '왜 이어졌는지'를 한 줄로 설명해 주는 모듈.

점수 계산은 matcher.py가 하고, 여기서는 그 점수를 사람이 읽을 문장으로 바꾼다.
matcher.py를 수정하지 않으려고 파일을 분리했다.
"""

from matcher import (
    get_mbti_score,
    get_hobbies_score,
    ITEM_TO_CATEGORY,
    normalize_mbti,
)

MBTI_PHRASE = {
    100: "찰떡궁합",
    75: "잘 맞는 성향",
    50: "무난하게 어울리는 성향",
}

LIVING_PHRASE = {
    "자취": "둘 다 자취 중이에요",
    "통학": "둘 다 통학하고 있어요",
    "기숙사": "둘 다 기숙사에서 지내요",
}


def _split(hobbies):
    return {h.strip() for h in (hobbies or "").split(",") if h.strip()}


def _eul_reul(word):
    """받침이 있으면 '을', 없으면 '를'."""
    if not word:
        return "를"
    ch = word[-1]
    if "가" <= ch <= "힣":
        return "을" if (ord(ch) - 0xAC00) % 28 else "를"
    return "를"


def build_reason(mentor, mentee):
    """'앞말(MBTI) + 맺음말(취미/생활)' 한 문장으로 만든다.

    맺음말은 설득력이 큰 순서로 하나만 고른다.
    MBTI가 없거나 궁합이 낮으면 맺음말만으로 문장이 된다.
    """
    # --- 앞말: MBTI 궁합 ---
    lead = ""
    lead_alone = ""
    mbti_score = get_mbti_score(mentor.mbti, mentee.mbti)
    m1, m2 = normalize_mbti(mentor.mbti), normalize_mbti(mentee.mbti)
    if mbti_score >= 50 and m1 and m2:
        phrase = MBTI_PHRASE[mbti_score]
        lead = f"{m1}·{m2}는 {phrase}이고"
        lead_alone = f"{m1}·{m2}는 {phrase}이에요"

    # --- 맺음말 후보를 설득력 순으로 하나만 ---
    tail = ""
    h1, h2 = _split(mentor.hobbies), _split(mentee.hobbies)
    common = sorted(h1 & h2)

    if common:
        # 1순위: 똑같은 취미. 최대 2개까지 이름을 그대로 보여준다
        shown = "·".join(common[:2])
        if len(common) > 2:
            josa = f" 등 {len(common)}가지를"
        else:
            josa = _eul_reul(shown)
        tail = f"{shown}{josa} 함께 좋아해요"
    else:
        # 2순위: 취미가 겹치진 않아도 분야가 같은 경우
        c1 = {ITEM_TO_CATEGORY[h] for h in h1 if h in ITEM_TO_CATEGORY}
        c2 = {ITEM_TO_CATEGORY[h] for h in h2 if h in ITEM_TO_CATEGORY}
        shared_cat = sorted(c1 & c2)
        if shared_cat:
            tail = f"{'·'.join(shared_cat[:2])} 쪽 관심사가 비슷해요"
        elif mentor.living_type and mentor.living_type == mentee.living_type:
            # 3순위: 생활 조건
            tail = LIVING_PHRASE.get(mentor.living_type, "생활 방식이 비슷해요")
        elif (
            mentor.age is not None
            and mentee.age is not None
            and abs(mentor.age - mentee.age) <= 2
        ):
            tail = "나이가 비슷해 편하게 지낼 수 있어요"

    if lead and tail:
        text = f"{lead} {tail}"
    elif lead:
        text = lead_alone
    elif tail:
        text = tail
    else:
        text = "서로 다른 매력을 가진 두 사람이라 배울 점이 많아요"

    return text + "."


def build_detail(mentor, mentee):
    """근거 문구와 함께 쓸 점수 내역."""
    return {
        "mbti_score": get_mbti_score(mentor.mbti, mentee.mbti),
        "hobby_score": get_hobbies_score(mentor.hobbies, mentee.hobbies),
        "common_hobbies": sorted(_split(mentor.hobbies) & _split(mentee.hobbies)),
    }
