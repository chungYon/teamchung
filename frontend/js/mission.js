const API_BASE = "http://localhost:8000";

// backend/mission_data.py MISSIONS와 동일한 내용 (수정 시 양쪽 다 맞출 것)
const MISSIONS = [
    { id: 0, island: "D", stage: 1, title: "처음 만나서 같이 밥먹고 사진 찍기" },
    { id: 1, island: "A", stage: 2, title: "학식 같이 먹기" },
    { id: 2, island: "A", stage: 2, title: "카페에서 같이 과제하기" },
    { id: 3, island: "S", stage: 2, title: "학교 상징물 앞 인증샷" },
    { id: 4, island: "O", stage: 2, title: "인생네컷 찍기" },
    { id: 5, island: "O", stage: 2, title: "같이 운동하기" },
    { id: 6, island: "M", stage: 2, title: "학교 근처 맛집 정복하기" },
    { id: 7, island: "M", stage: 2, title: "시험기간 같이 공부하기" },
];

// 섬별 좌표 (dasom-map.png 기준 % 좌표).
//   dim   : 섬 전체를 덮어 어둡게 만들 타원 영역
//   badge : 그림에 이미 그려진 자물쇠/하트 배지 자리. 같은 자리를 흰 원으로 덮고
//           상태에 따라 🔒 / ❤️ 를 다시 그린다 (그림 속 자물쇠를 가리기 위함)
const ISLANDS = {
    D: { dim: { x: 10, y: 49, w: 16, h: 33 }, badge: { x: 9.1, y: 60.7 } },
    A: { dim: { x: 32, y: 40, w: 23, h: 33 }, badge: { x: 33.3, y: 49.8 } },
    S: { dim: { x: 53.5, y: 37, w: 17, h: 29 }, badge: { x: 53.5, y: 49.8 } },
    O: { dim: { x: 70.6, y: 44, w: 16.5, h: 29 }, badge: { x: 70.8, y: 56.1 } },
    M: { dim: { x: 89, y: 52, w: 19, h: 35 }, badge: { x: 88.9, y: 64.6 } },
};

// 캐릭터가 설 위치(% 좌표). index 0 = 시작 전, 1~8 = 완료 개수에 대응.
// offset-path 대신 이 배열로 좌표 이동만 시킨다.
const WAYPOINTS = [
    { x: 48, y: 78 }, // 0: START 섬 (중앙 하단)
    { x: 10, y: 45 }, // 1: D 완료
    { x: 31, y: 38 }, // 2: A 미션1 완료
    { x: 41, y: 38 }, // 3: A 미션2 완료
    { x: 53, y: 36 }, // 4: S 완료
    { x: 66, y: 40 }, // 5: O 미션1 완료
    { x: 75, y: 40 }, // 6: O 미션2 완료
    { x: 86, y: 48 }, // 7: M 미션1 완료
    { x: 93, y: 48 }, // 8: M 미션2 완료 (전체 완성)
];

// 클리어 이펙트 레지스트리.
// 모든 이펙트 함수 시그니처: (mission, onDone) => void
//   - mission: 완료된 미션 정보 { id, island, stage, title, ... }
//   - onDone: 연출이 끝났을 때 정확히 한 번 호출해야 하는 콜백
// 새 이펙트 추가 방법: 함수 하나 작성 → 아래 EFFECTS에 key 등록. 그게 끝.
const EFFECTS = {
    stamp: playStampEffect,
    confetti: playConfettiEffect,
    neon: playNeonEffect,
};

let CURRENT_EFFECT = "stamp"; // 여기 값만 바꾸면 재생되는 이펙트가 교체됨 (기본값: stamp)

let currentUserId = null;
let currentMatchId = null;
let serverConnected = false; // true면 서버 진행상황을 그대로 표시, false면 슬라이더로 로컬 미리보기
let localCompletedIds = new Set();
let serverView = null;
let pendingMissionId = null;

const dasomWrap = document.querySelector(".dasom-wrap");
const islandOverlaysEl = document.getElementById("islandOverlays");
const walkerEl = document.getElementById("walker");
const missionListEl = document.getElementById("missionList");
const progressBarFill = document.getElementById("progressBarFill");
const completedCountEl = document.getElementById("completedCount");

const debugPanel = document.getElementById("debugPanel");
const debugSlider = document.getElementById("debugSlider");
const debugValue = document.getElementById("debugValue");
const debugMode = document.getElementById("debugMode");
const backBtn = document.getElementById("backBtn");

const effectSelect = document.getElementById("effectSelect");
const effectPreviewBtn = document.getElementById("effectPreviewBtn");

const demoUserIdInput = document.getElementById("demoUserId");
const demoMatchIdInput = document.getElementById("demoMatchId");
const demoLoadBtn = document.getElementById("demoLoadBtn");
const demoAuthMsg = document.getElementById("demoAuthMsg");

const modalOverlay = document.getElementById("uploadModal");
const modalTitle = document.getElementById("modalMissionTitle");
const modalMsg = document.getElementById("modalMsg");
const photoInput = document.getElementById("photoInput");
const modalCancelBtn = document.getElementById("modalCancelBtn");
const modalSubmitBtn = document.getElementById("modalSubmitBtn");

const islandDimEls = {};
const islandBadgeEls = {};

function init() {
    buildIslandOverlays();

    // 드래그 중(input)에는 화면만 미리 바꾸고, 손을 뗐을 때(change) 서버에 반영한다.
    // 드래그 한 번에 요청이 수십 번 나가는 걸 막기 위함.
    if (debugSlider) {
        debugSlider.addEventListener("input", (e) => {
            setLocalCompletedCount(parseInt(e.target.value, 10));
        });
        debugSlider.addEventListener("change", (e) => {
            if (serverConnected) pushProgressToServer(parseInt(e.target.value, 10));
        });
    }

    backBtn.addEventListener("click", () => {
        location.href = "index.html";
    });

    demoLoadBtn.addEventListener("click", loadRealMatch);
    modalCancelBtn.addEventListener("click", closeUploadModal);
    modalSubmitBtn.addEventListener("click", submitCompletion);

    // 임시: 이펙트 비교용 드롭다운. 하나 고르고 나면 이 블록 + effectPicker 마크업 지울 것.
    effectSelect.value = CURRENT_EFFECT;
    effectSelect.addEventListener("change", (e) => {
        CURRENT_EFFECT = e.target.value;
    });
    effectPreviewBtn.addEventListener("click", () => {
        playClearEffect({ id: -1, island: "D", stage: 0, title: "미리보기" });
    });

    if (debugSlider) setLocalCompletedCount(parseInt(debugSlider.value, 10));

    // mission.html?user_id=1&match_id=1 로 들어오면 자동으로 내 팀 진행상황을 불러온다.
    // (로그인 화면에서 이 주소로 넘겨주면 수동 입력이 필요 없음)
    const params = new URLSearchParams(location.search);
    const uid = params.get("user_id");
    const mid = params.get("match_id");
    if (uid && mid) {
        demoUserIdInput.value = uid;
        demoMatchIdInput.value = mid;
        loadRealMatch();
    }
}

function buildIslandOverlays() {
    Object.entries(ISLANDS).forEach(([key, meta]) => {
        const dim = document.createElement("div");
        dim.className = "island-dim";
        dim.style.left = meta.dim.x + "%";
        dim.style.top = meta.dim.y + "%";
        dim.style.width = meta.dim.w + "%";
        dim.style.height = meta.dim.h + "%";
        islandOverlaysEl.appendChild(dim);
        islandDimEls[key] = dim;

        // 그림에 박힌 자물쇠 배지를 흰 원으로 덮고, 상태에 따라 아이콘을 다시 그린다
        const badge = document.createElement("div");
        badge.className = "island-badge";
        badge.style.left = meta.badge.x + "%";
        badge.style.top = meta.badge.y + "%";
        islandOverlaysEl.appendChild(badge);
        islandBadgeEls[key] = badge;
    });
}

// ---------- 로컬 미리보기 (match_id 없을 때 디버그용) ----------
function setLocalCompletedCount(n) {
    const count = Math.max(0, Math.min(8, n));
    localCompletedIds = new Set(MISSIONS.slice(0, count).map((m) => m.id));
    render(computeLocalView());
}

function computeLocalView() {
    const nextMissionId = MISSIONS.find((mission) => !localCompletedIds.has(mission.id))?.id;
    const missions = MISSIONS.map((m) => {
        let status;
        if (localCompletedIds.has(m.id)) status = "done";
        else if (m.id === nextMissionId) status = "open";
        else status = "locked";
        return { ...m, status };
    });
    return { completed_count: localCompletedIds.size, missions };
}

// ---------- 서버 연동 ----------
async function loadRealMatch() {
    const uid = parseInt(demoUserIdInput.value, 10);
    const mid = parseInt(demoMatchIdInput.value, 10);
    if (!uid || !mid) {
        demoAuthMsg.textContent = "user_id, match_id를 입력해주세요.";
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/matches/${mid}/progress`);
        if (!res.ok) throw new Error();
        serverView = await res.json();
        currentUserId = uid;
        currentMatchId = mid;
        serverConnected = true;
        debugMode.textContent = "(서버에 실제 반영됨)";
        demoAuthMsg.textContent = "불러왔습니다.";
        if (debugSlider) debugSlider.value = serverView.completed_count;
        render(serverView);
    } catch (e) {
        demoAuthMsg.textContent = "진행상황을 불러오지 못했습니다. match_id를 확인해주세요.";
    }
}

// 슬라이더로 맞춘 진행도를 서버에 실제로 반영한다 (테스트/시연 리셋용)
async function pushProgressToServer(count) {
    try {
        const res = await fetch(
            `${API_BASE}/api/matches/${currentMatchId}/debug/set-progress?count=${count}`,
            { method: "POST" }
        );
        if (!res.ok) throw new Error();
        serverView = await res.json();
        render(serverView);
        demoAuthMsg.textContent = `진행도를 ${count}개로 맞췄습니다.`;
    } catch (e) {
        demoAuthMsg.textContent = "진행도 변경 실패 (서버 확인 필요)";
    }
}

// ---------- 업로드 모달 ----------
function openUploadModal(mission) {
    pendingMissionId = mission.id;
    modalTitle.textContent = mission.title;
    modalMsg.textContent = "";
    photoInput.value = "";
    modalOverlay.classList.add("open");
}

function closeUploadModal() {
    modalOverlay.classList.remove("open");
    pendingMissionId = null;
}

async function submitCompletion() {
    if (!photoInput.files[0]) {
        modalMsg.textContent = "사진을 선택해주세요.";
        return;
    }
    if (!currentUserId || !currentMatchId) {
        modalMsg.textContent = "먼저 상단에서 user_id / match_id를 불러와주세요.";
        return;
    }

    modalSubmitBtn.disabled = true;
    modalMsg.textContent = "업로드 중...";

    const formData = new FormData();
    formData.append("photo", photoInput.files[0]);
    formData.append("user_id", currentUserId);

    try {
        const res = await fetch(
            `${API_BASE}/api/matches/${currentMatchId}/missions/${pendingMissionId}/complete`,
            { method: "POST", body: formData }
        );
        const data = await res.json();

        if (!res.ok) {
            modalMsg.textContent = data.detail || "완료 처리에 실패했습니다.";
            modalSubmitBtn.disabled = false;
            return;
        }

        closeUploadModal();
        const completedMission = MISSIONS.find((m) => m.id === pendingMissionId);
        await playClearEffect(completedMission);
        serverView = data.progress;
        render(serverView);
    } catch (e) {
        modalMsg.textContent = "서버 연결에 실패했습니다.";
    } finally {
        modalSubmitBtn.disabled = false;
    }
}

// ---------- 클리어 이펙트 ----------
function playStampEffect(mission, onDone) {
    const stamp = document.createElement("div");
    stamp.className = "effect-stamp";
    stamp.textContent = "CLEAR!";
    dasomWrap.appendChild(stamp);
    setTimeout(() => {
        stamp.remove();
        onDone();
    }, 800);
}

function playConfettiEffect(mission, onDone) {
    const layer = document.createElement("div");
    layer.className = "effect-confetti-layer";
    const colors = ["#6366f1", "#a855f7", "#22c55e", "#f59e0b", "#ec4899"];

    for (let i = 0; i < 24; i++) {
        const piece = document.createElement("span");
        piece.className = "confetti-piece";
        const angleRad = Math.random() * Math.PI * 2;
        const distance = 60 + Math.random() * 60;
        piece.style.setProperty("--dx", Math.cos(angleRad) * distance + "px");
        piece.style.setProperty("--dy", Math.sin(angleRad) * distance + "px");
        piece.style.background = colors[i % colors.length];
        layer.appendChild(piece);
    }

    dasomWrap.appendChild(layer);
    setTimeout(() => {
        layer.remove();
        onDone();
    }, 800);
}

function playNeonEffect(mission, onDone) {
    const layer = document.createElement("div");
    layer.className = "effect-neon-layer";

    for (let i = 0; i < 3; i++) {
        const ring = document.createElement("span");
        ring.className = "neon-ring";
        ring.style.animationDelay = `${i * 0.15}s`;
        layer.appendChild(ring);
    }

    dasomWrap.appendChild(layer);
    setTimeout(() => {
        layer.remove();
        onDone();
    }, 800);
}

// mission 정보를 이펙트 함수에 넘기고, 콜백(onDone) 기반 이펙트를 Promise로 감싸서
// 호출부에서는 await playClearEffect(mission) 형태로 쓸 수 있게 한다.
function playClearEffect(mission) {
    return new Promise((resolve) => {
        const effectFn = EFFECTS[CURRENT_EFFECT] || EFFECTS.stamp;
        effectFn(mission, resolve);
    });
}

// ---------- 렌더 ----------
function render(view) {
    const completedCount = view.completed_count;
    completedCountEl.textContent = completedCount;
    if (debugValue) debugValue.textContent = completedCount;
    if (debugSlider) debugSlider.value = completedCount;
    progressBarFill.style.width = (completedCount / MISSIONS.length) * 100 + "%";

    const wp = WAYPOINTS[Math.min(completedCount, WAYPOINTS.length - 1)];
    walkerEl.style.left = wp.x + "%";
    walkerEl.style.top = wp.y + "%";

    renderIslands(view.missions);
    renderMissionList(view.missions);
}

// 섬 상태 = 그 섬에 속한 미션들을 종합해서 계산.
// locked: 하나라도 잠김(=1단계 전) / done: 전부 완료 / open: 그 사이
function renderIslands(missions) {
    Object.keys(ISLANDS).forEach((islandKey) => {
        const islandMissions = missions.filter((m) => m.island === islandKey);
        const isLocked = islandMissions.some((m) => m.status === "locked");
        const isDone = islandMissions.every((m) => m.status === "done");

        const dim = islandDimEls[islandKey];
        dim.classList.toggle("is-open", !isLocked && !isDone);
        dim.classList.toggle("is-done", isDone);

        const badge = islandBadgeEls[islandKey];
        badge.classList.toggle("locked", isLocked);
        badge.classList.toggle("done", isDone);
        badge.textContent = isLocked ? "🔒" : isDone ? "🏁" : "❤️";
    });
}

function renderMissionList(missions) {
    missionListEl.innerHTML = "";

    missions.forEach((mission, index) => {
        const item = document.createElement("div");
        item.className = `mission-item ${mission.status}`;

        const badge = document.createElement("div");
        badge.className = "badge";
        badge.textContent =
            mission.status === "done" ? "✓" : mission.status === "locked" ? "🔒" : index + 1;

        const title = document.createElement("div");
        title.className = "title";
        title.textContent = mission.title;

        const stageTag = document.createElement("div");
        stageTag.className = "stage-tag";
        stageTag.textContent = `${mission.island} 섬`;

        item.appendChild(badge);
        item.appendChild(title);
        item.appendChild(stageTag);

        if (mission.status === "open") {
            item.addEventListener("click", () => openUploadModal(mission));
        }

        missionListEl.appendChild(item);
    });
}

init();
