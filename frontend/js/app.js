const API_BASE_URL = 'http://localhost:8000';
let currentUserId = null;
let currentMatchId = null;
let isAdmin = false;
let currentUserProfile = null;

// badge 좌표는 지도 PNG에 그려진 자물쇠/하트 원의 실제 중심 (이미지에서 측정)
// quest 는 섬 위에 띄우는 물음표 마커 위치
const missionIslandOverlays = {
    D: { dim: { x: 10, y: 49, w: 16, h: 33 }, badge: { x: 9.1, y: 61.0 }, quest: { x: 10, y: 45 } },
    A: { dim: { x: 32, y: 40, w: 23, h: 33 }, badge: { x: 32.9, y: 48.9 }, quest: { x: 33, y: 37 } },
    S: { dim: { x: 53.5, y: 37, w: 17, h: 29 }, badge: { x: 53.4, y: 48.9 }, quest: { x: 53, y: 34 } },
    O: { dim: { x: 70.6, y: 44, w: 16.5, h: 29 }, badge: { x: 70.4, y: 56.2 }, quest: { x: 70.5, y: 41 } },
    M: { dim: { x: 89, y: 52, w: 19, h: 35 }, badge: { x: 88.3, y: 65.2 }, quest: { x: 89, y: 49 } },
};

const ISLAND_ORDER = ['D', 'A', 'S', 'O', 'M'];
const ISLAND_LABEL = { D: '첫 만남', A: '추억 쌓기', S: '함께하는 시간', O: '마음 나누기', M: '사랑과 우정 완성' };

// 캐릭터가 서는 자리. 섬마다 한 곳뿐이며, 그 섬 미션을 전부 깨야 다음 섬으로 넘어간다.
// ? 마커(섬 위쪽)와 상태 배지(섬 아래쪽) 사이에 놓아 둘 다 가리지 않게 한다.
const missionWalkPoints = {
    D: { x: 13.5, y: 55 },
    A: { x: 36, y: 46 },
    S: { x: 57.5, y: 43 },
    O: { x: 74.5, y: 50 },
    M: { x: 93, y: 58 },
};

let missionOverlayElems = {};
let missionBadgeElems = {};
let missionQuestElems = {};
let openIslandKey = null;
let lastLoadedMissions = [];

// 지도의 섬이 몇 칸씩 담당하는지 (backend/mission_data.py의 ISLAND_SLOTS와 같아야 함)
// 미션 카탈로그는 10개지만, 8칸을 채우면 완주다.
const ISLAND_SLOTS = [
    { island: 'D', slots: 1 },
    { island: 'A', slots: 2 },
    { island: 'S', slots: 1 },
    { island: 'O', slots: 2 },
    { island: 'M', slots: 2 },
];
const MISSION_PROGRESS_COUNT = ISLAND_SLOTS.reduce((n, s) => n + s.slots, 0);

const HOBBIES = {
    "운동": ["러닝", "헬스", "테니스", "클라이밍", "자전거"],
    "음식": ["요리", "맛집탐방"],
    "게임": ["롤", "오버워치", "배그"],
    "여행": ["국내여행", "해외여행", "캠핑"],
    "미디어/SNS": ["인스타", "유튜브", "넷플릭스"],
    "문화/예술": ["영화관람", "음악감상", "독서"],
    "IT/자기계발": ["알고리즘 코딩", "시스템 구축", "외국어 회화"]
};

// 취미 체크박스 렌더링
window.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById('hobbies-container');
    if (container) {
        let html = '';
        for (const [cat, items] of Object.entries(HOBBIES)) {
            html += `<div style="flex: 1 1 120px;">
                        <strong style="color:var(--primary); font-size:0.9rem;">${cat}</strong>
                        <div style="display:flex; flex-direction:column; gap:5px; margin-top:5px; font-size:0.85rem;">`;
            items.forEach(item => {
                html += `<label style="display:inline-flex; align-items:center; color:#e2e8f0; font-weight:normal; cursor:pointer;">
                            <input type="checkbox" value="${item}" class="hobby-checkbox" style="width:auto; margin-right:5px; accent-color:var(--primary);">
                            ${item}
                         </label>`;
            });
            html += `</div></div>`;
        }
        container.innerHTML = html;
    }
    setupMissionDebugSlider();
    setupMissionUploadModal();
});

function setupMissionUploadModal() {
    const cancelBtn = document.getElementById('missionModalCancel');
    const submitBtn = document.getElementById('missionModalSubmit');
    if (cancelBtn && submitBtn) {
        cancelBtn.addEventListener('click', closeMissionSubmit);
        submitBtn.addEventListener('click', submitMissionPhoto);
    }

    const islandClose = document.getElementById('islandModalClose');
    if (islandClose) islandClose.addEventListener('click', closeIslandModal);
}

function setupMissionDebugSlider() {
    const slider = document.getElementById('missionDebugSlider');
    const valueEl = document.getElementById('missionDebugValue');
    if (!slider || !valueEl) return;

    slider.addEventListener('input', () => {
        const count = parseInt(slider.value, 10);
        valueEl.textContent = count;
        if (lastLoadedMissions.length === 0) return;

        const preview = getMissionPreview(lastLoadedMissions, count);
        document.getElementById('mission-completed-count').textContent = count;
        document.getElementById('mission-progress-bar-fill').style.width = `${(count / MISSION_PROGRESS_COUNT) * 100}%`;
        renderMissionIslandStates(preview);
        updateMissionWalker(preview);
    });
}

function getMissionPreview(missions, count) {
    const ordered = [...missions].sort((a, b) => (a.mission_id ?? 0) - (b.mission_id ?? 0));
    return ordered.map((mission, index) => ({
        ...mission,
        is_completed: index < count
    }));
}

async function fetchUsers() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/users`);
        const data = await response.json();

        const tbody = document.getElementById('users-body');
        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6">가입된 회원이 없습니다.</td></tr>`;
            return;
        }

        data.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${user.username}</strong><br><span style="color:#a855f7;">${user.name}</span></td>
                <td>${user.is_mentor ? '<span style="color:#10b981;">멘토(재학생)</span>' : '<span style="color:#3b82f6;">멘티(신입생)</span>'}</td>
                <td>${user.mbti}</td>
                <td>${user.living_type}</td>
                <td style="font-size:0.9em; max-width:150px;">${user.hobbies}</td>
                <td>${user.match_status === 'matched' ? '<span style="color:#10b981;">매칭됨</span>' : '대기중'}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error(e);
    }
}

// 로그인 여부/역할에 따라 상단 메뉴를 켜고 끈다.
// 일반 회원: 내 프로필 / 미션 보드 / 리더보드
// 관리자: 매칭 현황 / 회원 목록 / 리더보드
function applyNavForRole() {
    const loggedIn = !!(currentUserId || isAdmin);
    const show = (id, on) => {
        const el = document.getElementById(id);
        if (el) el.style.display = on ? 'inline-block' : 'none';
    };

    show('btn-profile', loggedIn && !isAdmin);
    show('btn-score', loggedIn);
    show('btn-matching', loggedIn && isAdmin);
    show('btn-users', loggedIn && isAdmin);
    show('btn-admin-mission', loggedIn && isAdmin);
    show('btn-admin-match', loggedIn && isAdmin);
    show('btn-logout', loggedIn);

    const assign = document.getElementById('assign-mission-admin');
    if (assign) assign.style.display = isAdmin ? 'block' : 'none';

    const btnRefresh = document.getElementById('btn-refresh-match');
    if (btnRefresh) {
        btnRefresh.innerText = isAdmin ? '매칭 현황 새로고침' : '내 매칭 정보 새로고침';
    }
}

function switchScreen(screenId) {
    if (screenId === 'login' && currentUserId) {
        screenId = 'profile';
    }

    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    // Remove active class from all buttons
    document.querySelectorAll('.nav-links button').forEach(button => {
        button.classList.remove('active');
    });

    // Show the selected screen
    document.getElementById(screenId).classList.add('active');
    // Highlight the selected button
    const btn = document.getElementById(`btn-${screenId}`);
    if (btn) btn.classList.add('active');

    // Auto load data depending on screen
    if (screenId === 'profile') {
        loadProfileScreen();
    } else if (screenId === 'matching' && (currentUserId || isAdmin)) {
        fetchMyMatch();
    } else if (screenId === 'mission') {
        if (!currentMatchId) {
            alert('아직 매칭이 완료되지 않았습니다. 내 프로필에서 매칭 상태를 확인해 주세요.');
            switchScreen(isAdmin ? 'matching' : 'profile');
            return;
        }
        initializeMissionBoard();
    } else if (screenId === 'score') {
        fetchLeaderboard();
    } else if (screenId === 'users') {
        fetchUsers();
    }
}

// matchData는 /api/users/{id}/match 응답. 매칭 이유를 매칭 상태 바로 아래에 붙인다.
function renderProfile(matchData) {
    const profileEl = document.getElementById('profile-info');
    if (!profileEl) return;

    if (!currentUserProfile) {
        profileEl.innerHTML = '<p>프로필 정보를 불러올 수 없습니다.</p>';
        return;
    }

    const matched = currentUserProfile.match_status === 'matched';
    const reason = (matched && matchData && matchData.match_reason)
        ? `<p class="match-reason"><span class="match-reason-label">이렇게 이어졌어요</span>${matchData.match_reason}</p>`
        : '';

    profileEl.innerHTML = `
        <h3>${currentUserProfile.name}님의 프로필</h3>
        <p><strong>아이디:</strong> ${currentUserProfile.username}</p>
        <p><strong>전화번호:</strong> ${currentUserProfile.phone}</p>
        <p><strong>MBTI:</strong> ${currentUserProfile.mbti}</p>
        <p><strong>취미:</strong> ${currentUserProfile.hobbies}</p>
        <p><strong>주거 형태:</strong> ${currentUserProfile.living_type}</p>
        <p><strong>역할:</strong> ${currentUserProfile.is_mentor ? '멘토(재학생)' : '멘티(신입생)'}</p>
        <p><strong>매칭 상태:</strong> ${matched ? '매칭됨' : '대기중'}</p>
        ${reason}
    `;
}

// 내 프로필 화면 = 내 정보 + 매칭 상대 정보
// 매칭 정보를 먼저 받아야 매칭 이유를 내 카드에 그릴 수 있다.
async function loadProfileScreen() {
    if (!currentUserId) return;

    if (!currentUserProfile) {
        try {
            const res = await fetch(`${API_BASE_URL}/users/${currentUserId}`);
            currentUserProfile = await res.json();
        } catch (e) {
            currentUserProfile = null;
        }
    }

    let matchData = null;
    try {
        const res = await fetch(`${API_BASE_URL}/api/users/${currentUserId}/match`);
        matchData = await res.json();
    } catch (e) {
        matchData = null;
    }

    renderProfile(matchData);
    renderPartnerProfile(matchData);
}

function renderPartnerProfile(data) {
    const el = document.getElementById('partner-info');
    if (!el) return;

    try {
        if (!data) throw new Error('no data');

        if (data.status === 'unmatched') {
            currentMatchId = null;
            document.getElementById('btn-mission').style.display = 'none';
            el.innerHTML = `
                <h3>매칭 상대</h3>
                <p>아직 매칭되지 않았습니다.</p>
                <p class="partner-wait">관리자가 매칭을 실행하면 이곳에 상대 정보가 표시됩니다.</p>
            `;
            return;
        }

        currentMatchId = data.match_id;
        document.getElementById('btn-mission').style.display = 'inline-block';
        if (typeof saveSession === 'function') saveSession();

        // 매칭 이유는 내 프로필 카드(매칭 상태 아래)에 한 번만 보여준다
        el.innerHTML = `
            <h3>나와 매칭된 상대</h3>
            <p class="partner-name">${data.partner_name}</p>
            <p><strong>역할:</strong> ${data.partner_role}</p>
            <p><strong>MBTI:</strong> ${data.partner_mbti}</p>
            <p><strong>취미:</strong> ${data.partner_hobbies}</p>
            <p><strong>전화번호:</strong> ${data.partner_phone}</p>
        `;
    } catch (e) {
        el.innerHTML = '<h3>매칭 상대</h3><p>매칭 정보를 가져오는 데 실패했습니다.</p>';
    }
}

function logout() {
    currentUserId = null;
    currentMatchId = null;
    isAdmin = false;
    currentUserProfile = null;
    clearSession();
    applyNavForRole();
    document.getElementById('btn-mission').style.display = 'none';

    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('login-msg').innerText = '';

    switchScreen('login');
}

// 1. 로그인
async function login() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const msgEl = document.getElementById('login-msg');

    if (!username || !password) {
        msgEl.innerText = "아이디와 비밀번호를 모두 입력해주세요.";
        msgEl.style.color = "#ef4444";
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            const data = await response.json();
            currentUserId = data.user_id;
            isAdmin = data.is_admin === true;
            msgEl.innerText = "로그인 성공!";
            msgEl.style.color = "#34d399";

            document.getElementById('btn-mission').style.display = 'none';
            document.getElementById('admin-match-result').style.display = 'none';
            applyNavForRole();

            if (isAdmin) {
                saveSession();
                switchScreen('matching');
                return;
            }

            const userRes = await fetch(`${API_BASE_URL}/users/${currentUserId}`);
            currentUserProfile = await userRes.json();
            if (currentUserProfile.is_mentor) {
                document.getElementById('assign-mission-admin').style.display = 'none';
            }

            saveSession();
            switchScreen('profile');
        } else {
            const error = await response.json();
            msgEl.innerText = error.detail || "로그인 실패";
            msgEl.style.color = "#ef4444";
        }
    } catch (e) {
        msgEl.innerText = `서버 연결에 실패했습니다 (${API_BASE_URL}). FastAPI 서버가 켜져있는지 확인해주세요!`;
        msgEl.style.color = "#ef4444";
    }
}

// 2. 가입 (프로필 저장)
async function register() {
    const id = document.getElementById('reg-id').value;
    const pwd = document.getElementById('reg-pwd').value;
    const name = document.getElementById('reg-name').value;
    const gender = document.getElementById('reg-gender').value;
    const age = parseInt(document.getElementById('reg-age').value);
    const mbti = document.getElementById('reg-mbti').value;
    const living = document.getElementById('reg-living').value;
    const role = document.getElementById('reg-role').value === "true";
    const phone = document.getElementById('reg-phone').value;

    // 선택된 취미들 수집
    const hobbies = Array.from(document.querySelectorAll('.hobby-checkbox:checked'))
        .map(cb => cb.value)
        .join(',');

    const msgEl = document.getElementById('reg-msg');

    try {
        const response = await fetch(`${API_BASE_URL}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: id,
                password: pwd,
                name: name,
                gender: gender,
                age: age,
                mbti: mbti,
                hobbies: hobbies,
                living_type: living,
                is_mentor: role,
                phone: phone
            })
        });

        if (response.ok) {
            msgEl.innerText = "회원가입 완료! 로그인 탭으로 이동합니다.";
            msgEl.style.color = "#34d399";
            setTimeout(() => switchScreen('login'), 1500);
        } else {
            const error = await response.json();
            msgEl.innerText = error.detail || "회원가입 실패";
            msgEl.style.color = "#ef4444";
        }
    } catch (e) {
        msgEl.innerText = "서버 연결에 실패했습니다.";
        msgEl.style.color = "#ef4444";
    }
}

// 3. 매칭 현황 관리자 트리거
async function triggerMatching() {
    if (!isAdmin) {
        alert("관리자 계정(Admin/Admin)으로 로그인해야 합니다.");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/match`, { method: 'POST' });
        const data = await response.json();
        document.getElementById('admin-match-result').style.display = 'block';
        document.getElementById('admin-match-result').innerText = `매칭 실행 완료: ${data.message}`;
        fetchAdminMatches();
    } catch (e) {
        document.getElementById('admin-match-result').style.display = 'block';
        document.getElementById('admin-match-result').innerText = '매칭 실행 중 오류가 발생했습니다.';
    }
}

async function fetchAdminMatches() {
    const infoEl = document.getElementById('match-info');
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/matches`);
        const matches = await response.json();

        const usersResp = await fetch(`${API_BASE_URL}/api/users`);
        const users = await usersResp.json();

        const unmatchedMentors = users.filter(u => u.is_mentor && u.match_status !== 'matched');
        const unmatchedMentees = users.filter(u => !u.is_mentor && u.match_status !== 'matched');

        let html = `
            <div style="background:rgba(255,255,255,0.8); padding:15px; border-radius:10px; margin-bottom:20px; border:1px solid var(--primary);">
                <h3 style="margin-top:0; color:var(--primary);">📊 매칭 현황 요약</h3>
                <p style="margin:5px 0; color:var(--text-color);">✅ 성사된 팀: <strong>${matches.length}팀</strong></p>
                <p style="margin:5px 0; color:var(--text-color);">⏳ 대기 중인 멘토(재학생): <strong>${unmatchedMentors.length}명</strong>
                   <span style="font-size:0.85rem; color:#8f2d5c;">${unmatchedMentors.length > 0 ? '(' + unmatchedMentors.map(u => u.name).join(', ') + ')' : ''}</span></p>
                <p style="margin:5px 0; color:var(--text-color);">⏳ 대기 중인 멘티(신입생): <strong>${unmatchedMentees.length}명</strong>
                   <span style="font-size:0.85rem; color:#8f2d5c;">${unmatchedMentees.length > 0 ? '(' + unmatchedMentees.map(u => u.name).join(', ') + ')' : ''}</span></p>
            </div>
        `;

        if (matches.length === 0) {
            html += `<p>현재 성사된 매칭이 없습니다.</p>`;
            infoEl.innerHTML = html;
            return;
        }

        html += `<h3>전체 매칭 결과 리스트</h3><div style="display:flex; flex-direction:column; gap:15px; margin-top:15px;">`;
        matches.forEach(m => {
            html += `
                <div style="padding:15px; border-radius:10px; background:rgba(255,255,255,0.8); border:1px solid rgba(255, 182, 193, 0.55); box-shadow: 0 4px 10px rgba(255, 111, 191, 0.1);">
                    <div style="font-size:1.1rem; font-weight:bold; margin-bottom:10px; color:var(--text-color);">
                        🧑‍🏫 멘토 <span style="color:#a855f7;">${m.mentor_name}</span> &nbsp;❤️&nbsp; 👶 멘티 <span style="color:#3b82f6;">${m.mentee_name}</span>
                    </div>
                    <div style="font-size:0.95rem; color:var(--text-color); line-height:1.5;">
                        <strong>MBTI:</strong> ${m.mentor_mbti} & ${m.mentee_mbti} 
                        (MBTI 점수: <span style="color:#d97706; font-weight:600;">${m.mbti_score}</span>) <br>
                        <strong>취미 총 점수:</strong> <span style="color:#2563eb; font-weight:600;">${m.hobby_score}</span> <br>
                        <strong>최종 매칭 점수:</strong> <span style="color:#059669; font-weight:bold; font-size:1.1rem;">${m.total_score}</span>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
        infoEl.innerHTML = html;

    } catch (e) {
        infoEl.innerHTML = `<p style="color:var(--primary);">매칭 목록을 가져오는 데 실패했습니다.</p>`;
    }
}

// 3-1. 내 매칭 정보
async function fetchMyMatch() {
    const infoEl = document.getElementById('match-info');
    if (isAdmin) {
        document.getElementById('admin-match-result').style.display = 'block';
        document.getElementById('admin-match-result').innerText = "관리자 계정입니다. 전체 매칭 결과를 확인합니다.";
        fetchAdminMatches();
        return;
    }
    if (!currentUserId) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/users/${currentUserId}/match`);
        const data = await response.json();

        if (data.status === "unmatched") {
            currentMatchId = null;
            document.getElementById('btn-mission').style.display = 'none';
            infoEl.innerHTML = `<p>아직 매칭되지 않았습니다. 관리자(또는 알고리즘)가 매칭할 때까지 기다려주세요.</p>`;
        } else {
            currentMatchId = data.match_id;
            document.getElementById('btn-mission').style.display = 'inline-block';
            infoEl.innerHTML = `
                <h3>내 파트너 정보</h3>
                <p><strong>상태:</strong> 매칭 완료</p>
                <p><strong>역할:</strong> ${data.partner_role}</p>
                <p><strong>이름:</strong> <span style="font-size:1.2rem; font-weight:bold; color:#000;">${data.partner_name}</span></p>
                <p><strong>전화번호:</strong> ${data.partner_phone}</p>
                <p><strong>파트너 MBTI:</strong> ${data.partner_mbti}</p>
                <p><strong>파트너 취미 키워드:</strong> ${data.partner_hobbies}</p>
            `;
            fetchMissions();
        }
    } catch (e) {
        infoEl.innerHTML = `<p style="color:var(--primary);">매칭 정보를 가져오는 데 실패했습니다.</p>`;
    }
}

// 관리자가 강제로 미션 부여 (테스트)
async function adminAssignMission() {
    const mid = document.getElementById('mission-match-id').value;
    const title = document.getElementById('mission-title').value;
    const desc = document.getElementById('mission-desc').value;
    const msgEl = document.getElementById('mission-assign-msg');

    if (!mid || !title || !desc) {
        msgEl.innerText = "모두 입력해주세요";
        return;
    }

    try {
        await fetch(`${API_BASE_URL}/api/missions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                match_id: parseInt(mid),
                title: title,
                description: desc,
                points: 100
            })
        });
        msgEl.innerText = "미션 할당 성공!";
        msgEl.style.color = "#34d399";
        fetchMissions();
    } catch (e) {
        msgEl.innerText = "실패했습니다.";
    }
}

// 4. 팀 미션 가져오기 및 렌더링
function initializeMissionBoard() {
    buildMissionOverlay();
    fetchMissions();
}

function buildMissionOverlay() {
    const overlays = document.getElementById('mission-island-overlays');
    if (!overlays || Object.keys(missionOverlayElems).length > 0) return;

    Object.entries(missionIslandOverlays).forEach(([key, meta]) => {
        const dim = document.createElement('div');
        dim.className = 'island-dim';
        dim.style.left = `${meta.dim.x}%`;
        dim.style.top = `${meta.dim.y}%`;
        dim.style.width = `${meta.dim.w}%`;
        dim.style.height = `${meta.dim.h}%`;
        overlays.appendChild(dim);
        missionOverlayElems[key] = dim;

        const badge = document.createElement('div');
        badge.className = 'island-badge';
        badge.style.left = `${meta.badge.x}%`;
        badge.style.top = `${meta.badge.y}%`;
        overlays.appendChild(badge);
        missionBadgeElems[key] = badge;

        // 섬 위 물음표 -> 그 섬의 미션 목록 팝업
        const quest = document.createElement('div');
        quest.className = 'island-quest';
        quest.textContent = '?';
        quest.style.left = `${meta.quest.x}%`;
        quest.style.top = `${meta.quest.y}%`;
        quest.addEventListener('click', () => openIslandModal(key));
        overlays.appendChild(quest);
        missionQuestElems[key] = quest;
    });
}

function setMapHint(text) {
    const el = document.querySelector('#mission .map-hint');
    if (el) el.textContent = text;
}

async function fetchMissions() {
    if (!currentMatchId) {
        setMapHint('배정된 미션이 없거나 매칭 정보가 없습니다.');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/matches/${currentMatchId}/missions`);
        const missions = await response.json();
        if (!Array.isArray(missions) || missions.length === 0) {
            setMapHint('현재 진행중인 미션이 없습니다.');
            return;
        }

        missions.sort((a, b) => (a.mission_id ?? 0) - (b.mission_id ?? 0));
        lastLoadedMissions = missions;

        const completedCount = missions.filter(m => m.is_completed).length;
        document.getElementById('mission-completed-count').textContent = completedCount;
        document.getElementById('mission-progress-bar-fill').style.width = `${(completedCount / MISSION_PROGRESS_COUNT) * 100}%`;

        const slider = document.getElementById('missionDebugSlider');
        const valueEl = document.getElementById('missionDebugValue');
        if (slider) slider.value = completedCount;
        if (valueEl) valueEl.textContent = completedCount;

        setMapHint('섬 위의 ? 를 눌러 그 섬의 미션을 확인하세요.');
        renderMissionIslandStates(missions);
        updateMissionWalker(missions);
    } catch (e) {
        console.error(e);
        setMapHint('미션을 불러오는 중 오류가 발생했습니다.');
    }
}

// 지금 진행중인 섬 = 아직 안 깬 첫 번째 섬. 전부 깼으면 마지막 섬에 남는다.
function updateMissionWalker(missions) {
    const walker = document.getElementById('mission-walker');
    if (!walker) return;

    const states = getIslandStates(missions);
    const current = ISLAND_ORDER.find((k) => states[k].state !== 'done')
        || ISLAND_ORDER[ISLAND_ORDER.length - 1];

    const point = missionWalkPoints[current];
    walker.style.left = `${point.x}%`;
    walker.style.top = `${point.y}%`;
}

// 미션은 섬에 고정되지 않는다. 완료 개수가 섬의 칸을 순서대로 채운다.
// D(1칸) -> A(2칸) -> S(1칸) -> O(2칸) -> M(2칸), 합쳐서 8칸을 채우면 완주.
function getIslandStates(missions) {
    const completedCount = missions.filter((m) => m.is_completed).length;
    const states = {};
    let before = 0;
    let currentFound = false;

    ISLAND_SLOTS.forEach(({ island, slots }) => {
        const need = before + slots;
        let state;
        let doneCount;

        if (completedCount >= need) {
            state = 'done';
            doneCount = slots;
        } else if (!currentFound) {
            state = 'open';
            doneCount = Math.max(0, completedCount - before);
            currentFound = true;
        } else {
            state = 'locked';
            doneCount = 0;
        }

        states[island] = { state, doneCount, total: slots };
        before = need;
    });

    return states;
}

// 아직 안 깬 미션 목록. 지금 열린 섬에서 이 중 아무거나 고를 수 있다.
function getSelectableMissions(missions) {
    const done = missions.filter((m) => m.is_completed);
    // 첫 만남(0번)을 아직 안 깼으면 그것만 고를 수 있다
    if (!done.some((m) => m.mission_id === 0)) {
        return missions.filter((m) => m.mission_id === 0);
    }
    return missions.filter((m) => !m.is_completed);
}

function renderMissionIslandStates(missions) {
    const states = getIslandStates(missions);

    ISLAND_ORDER.forEach((islandKey) => {
        const info = states[islandKey];
        const dim = missionOverlayElems[islandKey];
        const badge = missionBadgeElems[islandKey];
        const quest = missionQuestElems[islandKey];
        if (!dim || !badge) return;

        const isLocked = info.state === 'locked';
        const isDone = info.state === 'done';

        dim.classList.toggle('is-open', info.state === 'open');
        dim.classList.toggle('is-done', isDone);

        badge.classList.toggle('locked', isLocked);
        badge.classList.toggle('done', isDone);
        badge.textContent = isDone ? '🏁' : isLocked ? '🔒' : '❤️';

        if (quest) {
            quest.classList.toggle('locked', isLocked);
            quest.classList.toggle('done', isDone);
            quest.textContent = isDone ? '✓' : '?';
        }
    });

    // 팝업이 열려 있으면 내용도 같이 갱신
    if (openIslandKey) renderIslandModal(states, openIslandKey);
}

// ---------- 섬 미션 목록 팝업 ----------
// 열린 섬을 누르면 아직 안 깬 미션 전체가 뜨고, 그중 하나를 골라 인증한다.
function openIslandModal(islandKey) {
    const states = getIslandStates(lastLoadedMissions);
    if (states[islandKey]?.state === 'locked') {
        alert('앞 섬의 미션을 먼저 완료해야 열립니다.');
        return;
    }
    openIslandKey = islandKey;
    renderIslandModal(states, islandKey);
    document.getElementById('islandModal').classList.add('open');
}

function closeIslandModal() {
    document.getElementById('islandModal').classList.remove('open');
    openIslandKey = null;
}

function renderIslandModal(states, islandKey) {
    const info = states[islandKey];
    if (!info) return;

    const completedCount = lastLoadedMissions.filter((m) => m.is_completed).length;
    const isDone = info.state === 'done';

    document.getElementById('islandModalTitle').textContent =
        `${islandKey}섬 · ${ISLAND_LABEL[islandKey] || ''}`;

    const subEl = document.getElementById('islandModalSub');
    if (isDone) {
        subEl.textContent = `이 섬은 통과했어요 (${info.doneCount}/${info.total})`;
    } else {
        const left = info.total - info.doneCount;
        subEl.textContent =
            `이 섬은 ${info.total}칸 중 ${info.doneCount}칸 완료 · ${left}개 더 하면 다음 섬으로 (전체 ${completedCount}/${MISSION_PROGRESS_COUNT})`;
    }

    const listEl = document.getElementById('islandMissionList');
    listEl.innerHTML = '';

    // 완료한 미션은 뒤로, 고를 수 있는 미션을 위로
    const selectable = isDone ? [] : getSelectableMissions(lastLoadedMissions);
    const selectableIds = new Set(selectable.map((m) => m.mission_id));
    const ordered = [
        ...selectable,
        ...lastLoadedMissions.filter((m) => !selectableIds.has(m.mission_id)),
    ];

    ordered.forEach((mission) => {
        const status = mission.is_completed
            ? 'done'
            : selectableIds.has(mission.mission_id) ? 'open' : 'locked';

        const item = document.createElement('div');
        item.className = `mission-item ${status}`;

        const badge = document.createElement('div');
        badge.className = 'badge';
        badge.textContent = status === 'done' ? '✓' : status === 'locked' ? '🔒' : '📷';

        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = mission.title;

        const tag = document.createElement('div');
        tag.className = 'stage-tag';
        tag.textContent = status === 'done' ? '완료' : status === 'locked' ? '잠김' : '사진 인증';

        item.appendChild(badge);
        item.appendChild(title);
        item.appendChild(tag);

        if (status === 'open') {
            item.addEventListener('click', () => openMissionSubmit(mission));
        }

        listEl.appendChild(item);
    });
}

// 인증은 사진 업로드 한 종류로 통일한다 (CLAUDE.md 미션 설계)
let pendingMissionCatalogId = null;

function openMissionSubmit(mission) {
    pendingMissionCatalogId = mission.mission_id;
    document.getElementById('missionModalTitle').textContent = mission.title;
    document.getElementById('missionModalMsg').textContent = '';
    document.getElementById('missionPhotoInput').value = '';
    document.getElementById('missionUploadModal').classList.add('open');
}

function closeMissionSubmit() {
    document.getElementById('missionUploadModal').classList.remove('open');
    pendingMissionCatalogId = null;
}

async function submitMissionPhoto() {
    const msgEl = document.getElementById('missionModalMsg');
    const fileEl = document.getElementById('missionPhotoInput');
    const submitBtn = document.getElementById('missionModalSubmit');

    if (!fileEl.files[0]) {
        msgEl.textContent = '사진을 선택해주세요.';
        return;
    }
    if (!currentMatchId || !currentUserId) {
        msgEl.textContent = '매칭 정보가 없습니다. 매칭 현황을 먼저 확인해주세요.';
        return;
    }

    submitBtn.disabled = true;
    msgEl.textContent = '업로드 중...';

    const formData = new FormData();
    formData.append('photo', fileEl.files[0]);
    formData.append('user_id', currentUserId);

    try {
        const response = await fetch(
            `${API_BASE_URL}/api/matches/${currentMatchId}/missions/${pendingMissionCatalogId}/complete`,
            { method: 'POST', body: formData }
        );
        const data = await response.json();

        if (!response.ok) {
            msgEl.textContent = data.detail || '완료 처리에 실패했습니다.';
            return;
        }

        // 승인 대기 상태로 변경되므로 클리어 연출 대신 알림을 띄운다
        closeMissionSubmit();
        closeIslandModal();
        alert('미션 승인 요청이 전송되었습니다. 관리자의 승인을 기다려주세요.');
        fetchMissions();
    } catch (e) {
        msgEl.textContent = '서버 연결에 실패했습니다.';
    } finally {
        submitBtn.disabled = false;
    }
}

// ---------- 클리어 연출 ----------
// 새 이펙트는 함수 하나 만들어서 EFFECTS에 등록하면 끝난다.
// 시그니처는 (wrap) => HTMLElement — 지도 위에 붙일 요소를 돌려주면 된다.
// 지우는 건 playMissionClearEffect가 알아서 한다.
const CLEAR_EFFECT = 'senior';   // 'senior' | 'stamp' | 'confetti' | 'neon'
const CLEAR_EFFECT_MS = 1800;    // 연출 길이. CSS 애니메이션 길이와 맞출 것

const EFFECTS = {
    // 성학 선배가 지도를 덮친다 (사진 원본 그대로)
    senior(wrap) {
        const layer = document.createElement('div');
        layer.className = 'effect-senior';

        const img = document.createElement('img');
        img.src = 'img/멋쟁이성학선배.png';
        img.alt = '';

        const text = document.createElement('div');
        text.className = 'effect-senior-text';
        text.textContent = 'CLEAR!';

        layer.appendChild(img);
        layer.appendChild(text);
        return layer;
    },

    stamp() {
        const el = document.createElement('div');
        el.className = 'effect-stamp';
        el.textContent = 'CLEAR!';
        return el;
    },

    confetti() {
        const layer = document.createElement('div');
        layer.className = 'effect-confetti-layer';
        const colors = ['#ff6fbf', '#ffd166', '#8ec5ff', '#b39ddb', '#ff8fa3'];
        for (let i = 0; i < 24; i++) {
            const piece = document.createElement('span');
            piece.className = 'confetti-piece';
            piece.style.background = colors[i % colors.length];
            piece.style.setProperty('--dx', `${(Math.random() - 0.5) * 320}px`);
            piece.style.setProperty('--dy', `${-120 - Math.random() * 220}px`);
            piece.style.animationDelay = `${Math.random() * 0.15}s`;
            layer.appendChild(piece);
        }
        return layer;
    },

    neon() {
        const layer = document.createElement('div');
        layer.className = 'effect-neon-layer';
        for (let i = 0; i < 3; i++) {
            const ring = document.createElement('span');
            ring.className = 'neon-ring';
            ring.style.animationDelay = `${i * 0.15}s`;
            layer.appendChild(ring);
        }
        return layer;
    },
};

function playMissionClearEffect() {
    return new Promise((resolve) => {
        const wrap = document.querySelector('#mission .dasom-wrap');
        const make = EFFECTS[CLEAR_EFFECT] || EFFECTS.stamp;
        if (!wrap || !make) {
            resolve();
            return;
        }
        const el = make(wrap);
        wrap.appendChild(el);
        setTimeout(() => {
            el.remove();
            resolve();
        }, CLEAR_EFFECT_MS);
    });
}

// 5. 리더보드
async function fetchLeaderboard() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/leaderboard`);
        const data = await response.json();

        const tbody = document.getElementById('leaderboard-body');
        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4">리더보드 데이터가 없습니다. 매칭 및 미션 제출을 완료해 주세요!</td></tr>`;
            return;
        }

        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.rank}</strong></td>
                <td style="color:#a855f7; font-weight:bold;">${item.team_name}</td>
                <td>${item.completed_missions} 회</td>
                <td style="color:#10b981; font-weight:600;">${item.score} 점</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error(e);
    }
}

// ---------- 관리자 전용 기능 (미션 승인 & 기한) ----------
async function fetchAdminPendingMissions() {
    const list = document.getElementById('admin-pending-list');
    list.innerHTML = '<div style="color:var(--muted);">불러오는 중...</div>';
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/missions/pending`);
        const missions = await res.json();

        let html = '';
        if (missions.length === 0) {
            html = '<div style="color:var(--muted);">승인 대기 중인 미션이 없습니다.</div>';
        } else {
            missions.forEach(m => {
                html += `
                <div class="card" style="display:flex; justify-content:space-between; align-items:center; border:1px solid #f59e0b; background:rgba(245, 158, 11, 0.05); padding:15px; border-radius:12px;">
                    <div>
                        <div style="font-weight:bold; color:var(--text-color); margin-bottom:5px;">[${m.team_name}] ${m.title}</div>
                        <a href="/uploads/${m.proof_url}" target="_blank" style="color:var(--primary); font-size:12px; text-decoration:underline;">제출된 사진 보기</a>
                        <div style="font-size:11px; color:var(--muted); margin-top:5px;">제출일: ${new Date(m.submitted_at).toLocaleString()}</div>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button class="btn-primary" onclick="approveAdminMission(${m.mission_db_id})" style="padding:8px 15px; min-width:auto; width:auto; border-radius:8px;">승인</button>
                        <button class="btn-secondary" onclick="rejectAdminMission(${m.mission_db_id})" style="padding:8px 15px; min-width:auto; width:auto; border-radius:8px;">반려</button>
                    </div>
                </div>
                `;
            });
        }
        list.innerHTML = html;

        const setRes = await fetch(`${API_BASE_URL}/api/admin/settings`);
        const settings = await setRes.json();
        if (settings.deadline) {
            document.getElementById('admin-deadline-input').value = settings.deadline.substring(0, 16);
        }
    } catch (e) {
        list.innerHTML = '<div style="color:red;">목록을 불러오지 못했습니다.</div>';
    }
}

async function approveAdminMission(id) {
    if (!confirm('승인하시겠습니까? (미션 점수가 즉시 부여됩니다)')) return;
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/missions/${id}/approve`, { method: 'POST' });
        const data = await res.json();
        alert(data.message || (res.ok ? '승인 완료' : '오류'));
        if (res.ok) fetchAdminPendingMissions();
    } catch (e) {
        alert('승인 중 오류 발생');
    }
}

async function rejectAdminMission(id) {
    if (!confirm('반려하시겠습니까? (유저가 다시 사진을 올려야 합니다)')) return;
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/missions/${id}/reject`, { method: 'POST' });
        const data = await res.json();
        alert(data.message || (res.ok ? '반려 완료' : '오류'));
        if (res.ok) fetchAdminPendingMissions();
    } catch (e) {
        alert('반려 중 오류 발생');
    }
}

async function setDeadline() {
    const val = document.getElementById('admin-deadline-input').value;
    const dateStr = val ? new Date(val).toISOString() : null;
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deadline: dateStr })
        });
        if (res.ok) {
            document.getElementById('admin-deadline-msg').textContent = '기한이 저장되었습니다.';
            setTimeout(() => document.getElementById('admin-deadline-msg').textContent = '', 3000);
        }
    } catch (e) {
        alert('기한 변경 실패');
    }
}
