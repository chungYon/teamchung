const API_BASE_URL = 'http://localhost:8000';
let currentUserId = null;
let currentMatchId = null;
let isAdmin = false;
let currentUserProfile = null;

const missionIslandOverlays = {
    D: { dim: { x: 10, y: 49, w: 16, h: 33 }, badge: { x: 9.1, y: 60.7 } },
    A: { dim: { x: 32, y: 40, w: 23, h: 33 }, badge: { x: 33.3, y: 49.8 } },
    S: { dim: { x: 53.5, y: 37, w: 17, h: 29 }, badge: { x: 53.5, y: 49.8 } },
    O: { dim: { x: 70.6, y: 44, w: 16.5, h: 29 }, badge: { x: 70.8, y: 56.1 } },
    M: { dim: { x: 89, y: 52, w: 19, h: 35 }, badge: { x: 88.9, y: 64.6 } },
};

const missionWaypoints = [
    { x: 48, y: 78 },
    { x: 10, y: 45 },
    { x: 31, y: 38 },
    { x: 41, y: 38 },
    { x: 53, y: 36 },
    { x: 66, y: 40 },
    { x: 75, y: 40 },
    { x: 86, y: 48 },
    { x: 93, y: 48 },
];

let missionOverlayElems = {};
let missionBadgeElems = {};
let lastLoadedMissions = [];

const MISSION_PROGRESS_COUNT = 8;
const MISSION_INFO = {
    0: { island: 'D' },
    1: { island: 'A' },
    2: { island: 'A' },
    3: { island: 'S' },
    4: { island: 'O' },
    5: { island: 'O' },
    6: { island: 'M' },
    7: { island: 'M' },
};

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
    if(container) {
        let html = '';
        for(const [cat, items] of Object.entries(HOBBIES)) {
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
});

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
        renderMissionList(preview);
        updateMissionWalker(count);
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
    } catch(e) {
        console.error(e);
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
    if(screenId === 'matching' && (currentUserId || isAdmin)) {
        fetchMyMatch();
    } else if(screenId === 'mission') {
        if (!currentMatchId) {
            alert('아직 매칭이 완료되지 않았습니다. 먼저 매칭 현황을 확인해 주세요.');
            switchScreen('matching');
            return;
        }
        initializeMissionBoard();
    } else if(screenId === 'score') {
        fetchLeaderboard();
    } else if(screenId === 'users') {
        fetchUsers();
    }
}

function renderProfile() {
    const profileEl = document.getElementById('profile-info');
    if (!profileEl) return;

    if (!currentUserProfile) {
        profileEl.innerHTML = '<p>프로필 정보를 불러올 수 없습니다.</p>';
        return;
    }

    profileEl.innerHTML = `
        <h3>${currentUserProfile.name}님의 프로필</h3>
        <p><strong>아이디:</strong> ${currentUserProfile.username}</p>
        <p><strong>전화번호:</strong> ${currentUserProfile.phone}</p>
        <p><strong>MBTI:</strong> ${currentUserProfile.mbti}</p>
        <p><strong>취미:</strong> ${currentUserProfile.hobbies}</p>
        <p><strong>주거 형태:</strong> ${currentUserProfile.living_type}</p>
        <p><strong>역할:</strong> ${currentUserProfile.is_mentor ? '멘토(재학생)' : '멘티(신입생)'}</p>
        <p><strong>매칭 상태:</strong> ${currentUserProfile.match_status === 'matched' ? '매칭됨' : '대기중'}</p>
    `;
}

function logout() {
    currentUserId = null;
    currentMatchId = null;
    isAdmin = false;
    currentUserProfile = null;
    clearSession();
    document.getElementById('btn-matching').style.display = 'none';
    document.getElementById('btn-mission').style.display = 'none';
    document.getElementById('btn-users').style.display = 'none';
    document.getElementById('btn-admin-match').style.display = 'none';
    document.getElementById('assign-mission-admin').style.display = 'none';
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
            
            // show common 퀵탭
            document.getElementById('btn-matching').style.display = 'inline-block';
            document.getElementById('btn-mission').style.display = 'none';
            document.getElementById('btn-users').style.display = isAdmin ? 'inline-block' : 'none';
            document.getElementById('btn-admin-match').style.display = isAdmin ? 'inline-block' : 'none';
            document.getElementById('assign-mission-admin').style.display = isAdmin ? 'block' : 'none';
            document.getElementById('admin-match-result').style.display = 'none';

            if (!isAdmin) {
                const userRes = await fetch(`${API_BASE_URL}/users/${currentUserId}`);
                const userData = await userRes.json();
                currentUserProfile = userData;

                if (userData.is_mentor) {
                    document.getElementById('assign-mission-admin').style.display = 'none';
                }
            }
            
            saveSession();
            renderProfile();
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
        fetchMyMatch();
    } catch (e) {
        document.getElementById('admin-match-result').style.display = 'block';
        document.getElementById('admin-match-result').innerText = '매칭 실행 중 오류가 발생했습니다.';
    }
}

// 3-1. 내 매칭 정보
async function fetchMyMatch() {
    const infoEl = document.getElementById('match-info');
    if (isAdmin) {
        document.getElementById('admin-match-result').style.display = 'block';
        document.getElementById('admin-match-result').innerText = "관리자 계정입니다. 매칭 알고리즘 실행 후 결과를 확인할 수 있습니다.";
        infoEl.innerHTML = `<p>관리자님은 팀 매칭 결과가 없습니다. 좌측에서 매칭 알고리즘을 실행해주세요.</p>`;
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
    
    if(!mid || !title || !desc) {
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
    });
}

async function fetchMissions() {
    if (!currentMatchId) {
        document.getElementById('missionList').innerHTML = `<p>배정된 미션이 없거나 매칭 정보가 없습니다.</p>`;
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/matches/${currentMatchId}/missions`);
        const missions = await response.json();
        if (!Array.isArray(missions) || missions.length === 0) {
            document.getElementById('missionList').innerHTML = `<p>현재 진행중인 미션이 없습니다.</p>`;
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

        renderMissionIslandStates(missions);
        renderMissionList(missions);
        updateMissionWalker(completedCount);
    } catch (e) {
        console.error(e);
        document.getElementById('missionList').innerHTML = `<p>미션을 불러오는 중 오류가 발생했습니다.</p>`;
    }
}

function updateMissionWalker(completedCount) {
    const walker = document.getElementById('mission-walker');
    if (!walker) return;
    const index = Math.max(0, Math.min(completedCount, missionWaypoints.length - 1));
    const point = missionWaypoints[index];
    walker.style.left = `${point.x}%`;
    walker.style.top = `${point.y}%`;
}

function renderMissionIslandStates(missions) {
    Object.keys(missionIslandOverlays).forEach((islandKey) => {
        const islandMissions = missions.filter((m) => (m.island || MISSION_INFO[m.mission_id]?.island) === islandKey);
        const firstStageDone = islandMissions.some((m) => m.mission_id === 0 && m.is_completed);
        const isLocked = islandMissions.some((m) => !m.is_completed && m.mission_id !== 0 && !firstStageDone);
        const isDone = islandMissions.length > 0 && islandMissions.every((m) => m.is_completed);

        const dim = missionOverlayElems[islandKey];
        const badge = missionBadgeElems[islandKey];
        if (!dim || !badge) return;

        dim.classList.toggle('is-open', !isLocked && !isDone);
        dim.classList.toggle('is-done', isDone);

        badge.classList.toggle('locked', isLocked);
        badge.classList.toggle('done', isDone);
        badge.textContent = isDone ? '🏁' : isLocked ? '🔒' : '❤️';
    });
}

function renderMissionList(missions) {
    const listEl = document.getElementById('missionList');
    listEl.innerHTML = '';

    missions.forEach((mission, index) => {
        const item = document.createElement('div');
        item.className = `mission-item ${mission.is_completed ? 'done' : mission.mission_id !== 0 && !missions.some((m) => m.mission_id === 0 && m.is_completed) ? 'locked' : 'open'}`;

        const badge = document.createElement('div');
        badge.className = 'badge';
        badge.textContent = mission.is_completed ? '✓' : mission.mission_id === 0 ? 'D' : `${index + 1}`;

        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = mission.title;

        const islandCode = mission.island || MISSION_INFO[mission.mission_id]?.island || '??';
        const stageTag = document.createElement("div");
        stageTag.className = "stage-tag";
        stageTag.textContent = `${islandCode} 섬`;

        item.appendChild(badge);
        item.appendChild(title);
        item.appendChild(stageTag);

        if (!mission.is_completed && (mission.mission_id === 0 || missions.some((m) => m.mission_id === 0 && m.is_completed))) {
            item.addEventListener('click', () => openMissionSubmit(mission));
        }

        listEl.appendChild(item);
    });
}

function openMissionSubmit(mission) {
    const proof = prompt(`'${mission.title}' 미션 인증 URL 또는 텍스트를 입력하세요`);
    if (!proof) return;
    submitMission(mission.id, proof);
}

async function submitMission(missionId, proof) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/missions/${missionId}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ proof_url: proof })
        });

        if (response.ok) {
            await response.json();
            alert('미션 제출 완료되었습니다.');
            fetchMissions();
        } else {
            alert('미션 제출에 실패했습니다.');
        }
    } catch (e) {
        alert('통신 오류가 발생했습니다.');
    }
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
    } catch(e) {
        console.error(e);
    }
}
