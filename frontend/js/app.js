const API_BASE_URL = 'http://localhost:8000';
let currentUserId = null;
let currentMatchId = null;

function switchScreen(screenId) {
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
    if(screenId === 'matching' && currentUserId) {
        fetchMyMatch();
    } else if(screenId === 'mission' && currentMatchId) {
        fetchMissions();
    } else if(screenId === 'score') {
        fetchLeaderboard();
    }
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
            msgEl.innerText = "로그인 성공!";
            msgEl.style.color = "#34d399";
            
            // Show new nav buttons
            document.getElementById('btn-matching').style.display = 'inline-block';
            document.getElementById('btn-mission').style.display = 'inline-block';
            
            // fetch user info to know role
            const userRes = await fetch(`${API_BASE_URL}/users/${currentUserId}`);
            const userData = await userRes.json();
            if(userData.is_mentor) {
                document.getElementById('assign-mission-admin').style.display = 'block'; // Mock ADMIN rights
            }
            
            setTimeout(() => switchScreen('matching'), 500);
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
    const hobbies = document.getElementById('reg-hobbies').value;
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
    try {
        const response = await fetch(`${API_BASE_URL}/api/match`, { method: 'POST' });
        const data = await response.json();
        alert(data.message);
        fetchMyMatch();
    } catch (e) {
        alert("매칭 실패");
    }
}

// 3-1. 내 매칭 정보
async function fetchMyMatch() {
    if (!currentUserId) return;
    const infoEl = document.getElementById('match-info');
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/users/${currentUserId}/match`);
        const data = await response.json();
        
        if (data.status === "unmatched") {
            infoEl.innerHTML = `<p>아직 매칭되지 않았습니다. 관리자(또는 알고리즘)가 매칭할 때까지 기다려주세요.</p>`;
        } else {
            currentMatchId = data.match_id;
            infoEl.innerHTML = `
                <h3>내 파트너 정보 (Match ID: ${data.match_id})</h3>
                <p><strong>상태:</strong> 매칭 완료</p>
                <p><strong>역할:</strong> ${data.partner_role}</p>
                <p><strong>이름:</strong> <span style="font-size:1.2rem; font-weight:bold; color:white;">${data.partner_name}</span></p>
                <p><strong>파트너 MBTI:</strong> ${data.partner_mbti}</p>
                <p><strong>파트너 취미 키워드:</strong> ${data.partner_hobbies}</p>
                <button class="btn-submit" style="background-color: var(--primary); margin-top:15px; width:auto;" onclick="alert('준비중인 기능입니다 (채팅 등)')">연락하기</button>
            `;
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
async function fetchMissions() {
    if (!currentMatchId) {
        document.getElementById('mission-list').innerHTML = `<p>배정된 미션이 없거나 매칭 정보가 없습니다.</p>`;
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/matches/${currentMatchId}/missions`);
        const missions = await response.json();
        
        let html = '';
        if (missions.length === 0) {
            html = `<p>현재 진행중인 미션이 없습니다.</p>`;
        } else {
            missions.forEach(m => {
                const status = m.is_completed ? `<span style="color:#10b981; font-weight:bold;">완료됨</span>` : `<span style="color:#f59e0b; font-weight:bold;">진행 중</span>`;
                
                let actionHtml = '';
                if (!m.is_completed) {
                    actionHtml = `
                        <div class="form-group" style="margin-top:15px;">
                            <label>미션 인증 (인증 사진 이미지 URL 또는 텍스트 리뷰)</label>
                            <input type="text" id="proof-${m.id}" placeholder="인증 정보(링크)를 입력하세요">
                        </div>
                        <button class="btn-submit" onclick="submitMission(${m.id})">미션 제출 및 포인트 획득하기</button>
                    `;
                } else {
                    actionHtml = `
                        <div style="margin-top:10px; padding:12px; border-left:4px solid #10b981; background:rgba(0,0,0,0.2); border-radius: 4px;">
                            <strong style="color:white;">제출된 결과: </strong> <a href="${m.proof_url}" target="_blank" style="color:#a855f7; word-break: break-all;">${m.proof_url}</a>
                        </div>
                    `;
                }
                
                html += `
                    <div class="card glass-card">
                        <h3 style="margin-bottom: 5px;">${m.title} <span style="font-size:0.9rem; color:#ebb305; background:rgba(235, 179, 5, 0.2); padding:3px 8px; border-radius:12px;">+${m.points} 점</span></h3>
                        <p style="color: #cbd5e1; margin-bottom: 12px; font-size: 0.95rem;"><strong>설명:</strong> ${m.description}</p>
                        <p><strong>상태:</strong> ${status}</p>
                        ${actionHtml}
                    </div>
                `;
            });
        }
        document.getElementById('mission-list').innerHTML = html;
    } catch (e) {
        console.error(e);
    }
}

async function submitMission(missionId) {
    const proofUrl = document.getElementById(`proof-${missionId}`).value;
    if (!proofUrl) {
        alert("인증 링크/내용을 입력해주세요.");
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/missions/${missionId}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ proof_url: proofUrl })
        });
        
        if (response.ok) {
            const data = await response.json();
            alert(`미션 완료! ${data.points_earned} 점을 획득했습니다.`);
            fetchMissions(); // reload missions
        } else {
            alert("미션 제출 실패");
        }
    } catch (e) {
        alert("통신 오류가 발생했습니다.");
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
