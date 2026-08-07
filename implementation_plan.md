# 멘토-멘티 활동 장려 시스템 구현 계획

현재 작성해주신 아이디어와 [testui.html](file:///c:/Users/apf_temp_admin/Desktop/%ED%8C%80%EC%A0%95%EC%9C%A4%ED%95%98/testui.html)을 바탕으로, 동아리 내 멘토-멘티 매칭 및 미션 수행 웹사이트를 개발하기 위한 전반적인 설계 및 파일 구조 계획을 구상했습니다.

## 핵심 기능 분석
- **사용자 프로필**: 이름, 성별, 나이, MBTI, 취미 키워드, 자취/통학, 신입생/재학생, 전화번호
- **알고리즘 매칭**: 재학생(멘토)과 신입생(멘티)를 1:1로 매칭. MBTI 궁합 점수 및 취미 키워드 일치도 활용.
- **미션 시스템**: 매칭된 팀 단위의 미션 부여 및 결과 제출(인증).
- **점수 및 대시보드**: 미션 수행에 따른 점수 부여 및 순위표 시각화.

## User Review Required

> [!IMPORTANT]
> 본격적인 개발을 시작하기 앞서 다음 사항들에 대한 질문/확인이 필요합니다.
> 1. **기술 스택 선정:** 백엔드를 Python(FastAPI)로 구성할지, Javascript(Node.js)로 구성할지 선호하시는 기술이 있나요? 프론트엔드는 현재처럼 HTML/CSS/JS로 진행하는게 편하신가요 아니면 React 등의 프레임워크를 원하시나요? 최근 사용하신 이력으로는 FastAPI 서버를 만드신 적이 있어서, FastAPI(백엔드) + HTML/JS(프론트엔드) 조합을 추천드립니다만 결정해 주시면 맞춰서 진행하겠습니다.
> 2. **미션 설계 방안:** "어떻게 미션을 해결하는 걸 표현할건지" 고민중이라고 하셨습니다. 시스템적으로 가장 간단하고 효과적인 방식은 팀별 미션 완료 시 **인증 사진과 짧은 소감을 함께 업로드**하여, 전체 피드백 게시판이나 대시보드에 전시하는 형태입니다. 이렇게 하면 다른 팀들이 활동하는 것을 보고 서로 자극을 받을 수 있습니다. 어떠신가요?
> 3. **데이터 저장:** 빠르고 간편한 구축을 위해 SQLite를 활용하여 데이터베이스를 연동하고자 하는데 괜찮으시겠죠?

## Proposed Architecture & File Structure

전반적인 아키텍처는 클라이언트 앱(Frontend)과 API 서버(Backend)의 분리된 형태를 추천합니다. 개발의 확장성과 유지 보수성을 높일 수 있습니다.
다음은 Python FastAPI + HTML/JS 기반의 파일 구조 예시입니다.

### [NEW] `frontend/` (프론트엔드 - 사용자 화면)
현재 작성하신 [testui.html](file:///c:/Users/apf_temp_admin/Desktop/%ED%8C%80%EC%A0%95%EC%9C%A4%ED%95%98/testui.html)을 분리하고 고도화합니다.
- `index.html`: 메인 껍데기 HTML
- `css/style.css`: 모던하고 아름다운 UI 디자인 적용 (현재 디자인에서 Glassmorphism 등 화려하게 개선)
- `js/app.js`: 로그인 상태 관리 및 화면(탭) 전환을 관리하는 메인 로직
- `js/api.js`: 서버와 통신(Fetch API)을 위한 네트워크 모듈
- `js/matching.js`, `js/mission.js`: 매칭 렌더링 및 미션 업로드 처리 등 기능별 스크립트

### [NEW] `backend/` (백엔드 - 데이터 저장 및 로직 처리)
- `main.py`: 서버 구동 및 외부 라우팅 진입점
- `routers/`: Auth(인증), User(가입 등), Match(매칭API), Mission(미션API) 라우터
- `services/matcher.py`: MBTI 궁합과 취미 키워드 등을 활용한 1:1 매칭 알고리즘 로직
- `models.py`: User, Match, Mission 데이터베이스 스키마
- `database.py`: DB 생성 및 연결 관리 (SQLite 연동)

### DB 스키마 기초(Draft)
- **User**: id, name, gender, age, mbti, hobbies, living_type, user_type(mentor/mentee), phone
- **Match**: id, mentor_id, mentee_id, created_at, status
- **Mission**: id, match_id, mission_title, description, is_completed, image_url, score

## Verification Plan

### Automated Tests
- 백엔드 구현 후 `pytest` 또는 `curl` 요청을 이용해 회원가입 API와 매칭 알고리즘이 올바르게 동작하는지 자동화된 형태로 검증하겠습니다.
- 매칭 알고리즘의 경우, 사전에 만들어 둔 더미 유저 세트를 입력하여 MBTI와 취미가 유사한 사람끼리 잘 묶이는지 Unit Test를 진행하겠습니다.

### Manual Verification
- 브라우저를 통해 `index.html`을 띄워 실제로 가입, 로그인, 매칭 클릭 시 화면이 부드럽게 넘어가는지 직접 클릭해봅니다.
- 미션 인증 화면에서 텍스트 및 이미지 URL을 입력할 때 서버에 올바르게 기록되고, 점수판(리더보드)에 점수가 올라가는지 확인을 부탁드릴 예정입니다.
