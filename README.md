# 회사 일정 (개인용 스케줄러 PWA)

광고 없는 개인용 달력 일정 앱. 아이폰(홈 화면 추가) + PC(크롬/엣지 앱 설치)에서
같은 데이터를 거의 실시간으로 동기화합니다.

## 파일
| 파일 | 역할 |
|---|---|
| `index.html` | 앱 전체 (화면 + 로직) |
| `config.js` | Firebase 설정. `null`이면 로컬 모드(동기화 없음) |
| `manifest.json` | 홈 화면 설치 정보 |
| `sw.js` | 오프라인 캐시 |
| `icon-*.png` | 앱 아이콘 |

## 기능
- 월 달력: 날짜별 남은 일정 개수 표시, 전부 완료하면 ✓
- 일정 추가 / 수정 / 삭제 / 완료 체크
- 일정 탭 → 내일 하기 / 날짜 바꾸기 / 반복 설정
- 반복: 매일 / 평일 / 매주(요일 선택) / 매월(같은 날짜)
  - 반복 일정의 "내일 하기·날짜 바꾸기"는 그 날만 빼서 옮김
  - 반복 일정 삭제는 "이 날만 / 전체" 선택

## 1단계. 로컬로 먼저 써보기
`index.html`을 더블클릭하면 브라우저에서 바로 열립니다. (이 기기 브라우저에만 저장)

## 2단계. Firebase 연결 (동기화 켜기) — 약 10분
1. https://console.firebase.google.com 접속 → **프로젝트 추가** (이름 자유, 애널리틱스는 끔)
2. 왼쪽 **빌드 → Authentication → 시작하기 → 이메일/비밀번호 → 사용 설정 → 저장**
3. **Authentication → Users 탭 → 사용자 추가** : 본인 이메일 + 비밀번호 입력 (이 계정으로 로그인)
4. 왼쪽 **빌드 → Firestore Database → 데이터베이스 만들기** → 위치 `asia-northeast3 (서울)` → **프로덕션 모드**로 시작
5. **Firestore → 규칙** 탭에 아래 내용 붙여넣고 **게시**:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```
6. **프로젝트 설정(톱니바퀴) → 일반 → 내 앱 → 웹 앱 추가(`</>` 아이콘)** → 닉네임 아무거나 → 등록
   → 나오는 `firebaseConfig = { ... }` 내용을 `config.js`의 `window.FIREBASE_CONFIG = { ... }`에 붙여넣기
7. 저장 후 앱을 다시 열면 로그인 화면이 뜹니다. 3번에서 만든 이메일/비밀번호로 로그인.

## 3단계. 인터넷에 올리기 (GitHub Pages) — 아이폰에서 열려면 필요
1. GitHub Desktop → **File → Add local repository** 로 이 폴더(`worktodo`) 추가 (없다고 하면 create a repository 클릭)
2. Commit → **Publish repository** (Keep this code private 체크 **해제** — Pages 무료 사용 조건)
3. github.com 저장소 → **Settings → Pages → Branch: `master` (또는 main) / `(root)` → Save**
4. 1~2분 후 `https://<계정>.github.io/worktodo/` 로 열림
5. Firebase 콘솔 → **Authentication → 설정 → 승인된 도메인 → 도메인 추가** : `<계정>.github.io`

> Firebase 설정값(apiKey 등)은 공개되어도 되는 값입니다. 데이터 보호는 5번 규칙(본인 uid만 읽기/쓰기)이 담당합니다.

## 4단계. 설치
- **아이폰**: Safari로 주소 열기 → 공유 버튼 → **홈 화면에 추가**
- **PC**: 크롬/엣지로 주소 열기 → 주소창 오른쪽 **앱 설치** 아이콘

## 수정 후 반영
`index.html` 수정 → GitHub Desktop에서 커밋+Push → 1분 뒤 새로고침(앱은 껐다 켜기).
GitHub Pages는 10분 캐시 헤더를 보내서, Push 직후 껐다 켜면 옛 화면이 나올 수 있습니다. 10분 뒤에 다시 열거나, 크롬이면 F5(강력 새로고침 Ctrl+F5)로 바로 받습니다. (sw.js가 매번 서버 확인하도록 되어 있어 보통은 한 번 껐다 켜면 반영)

## 5단계. 시간 알림 (푸시) 켜기 — 형님 클릭 작업 약 10분
알림은 GitHub가 5분마다 `server/send-alarms.js`를 돌려서 보냅니다. 비용 0원. 아래 비밀값 4개를 GitHub에 넣어야 합니다.

### A. Firebase 서비스 계정 키 받기
1. Firebase 콘솔 → 왼쪽 위 톱니바퀴 **프로젝트 설정** → 위쪽 **서비스 계정** 탭
2. **새 비공개 키 생성** → **키 생성** → JSON 파일이 다운로드됨 (이 파일은 **절대 저장소에 넣지 말 것**)
3. 그 파일을 메모장으로 열어 내용 전체 복사

### B. GitHub 저장소에 비밀값 넣기
1. github.com/outsidecat-jw/worktodo → **Settings** → 왼쪽 **Secrets and variables → Actions** → **New repository secret**
2. 아래 4개를 하나씩 추가 (Name 은 정확히, Secret 은 값):

| Name | Secret 값 |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | A-3 에서 복사한 JSON 전체 |
| `VAPID_PUBLIC_KEY` | `Desktop\worktodo_secrets\vapid_keys.txt` 의 PUBLIC 값 |
| `VAPID_PRIVATE_KEY` | 같은 파일의 PRIVATE 값 |
| `VAPID_SUBJECT` | `mailto:본인이메일` (예: `mailto:outsidecat@naver.com`) |

### C. 자동 실행 켜기
1. 저장소 위쪽 **Actions** 탭 → "I understand my workflows, go ahead and enable them" 버튼이 있으면 클릭
2. 왼쪽 **알림 발송** → 오른쪽 **Run workflow** → dry_run 에 `1` → **Run workflow** (실제로 안 보내고 점검만)
3. 1분쯤 뒤 초록 체크가 뜨면 성공. 클릭해서 로그에 "검사 N건" 이 보이면 정상. 빨간 X 면 로그 캡처를 Claude 에게.
4. 이후에는 5분마다 자동으로 돕니다.

### D. 기기마다 알림 켜기
- **아이폰**: 홈 화면의 앱에서 아무 일정 → **알림 설정** → 맨 위 "이 기기에서 알림 받으려면 **켜기**" → 허용. (Safari 에서는 안 되고 홈 화면 앱에서만 됨. iOS 16.4 이상)
- **PC**: 설치한 앱에서 같은 방법. 크롬이 "알림 허용?" 물으면 허용.
- 끄고 싶으면 같은 자리 **끄기**.

### 동작
- 일정에 시간 + 알림(예: 30분 전)을 넣으면 그 시각에 알림. 5분 단위로 확인하므로 최대 5~10분 늦을 수 있음.
- 완료 체크한 일정은 알림 안 옴. 체크를 풀면 다시 옴.
- 알림을 누르면 앱이 그 날짜로 열림.

### 자동 실행이 멈추지 않게
GitHub 는 저장소에 60일간 커밋이 없으면 예약 실행을 멈춥니다. `.github/workflows/keepalive.yml` 이 매주 확인해서 45일 넘게 커밋이 없으면 빈 커밋을 자동으로 넣어 계속 돌게 합니다. 손댈 것 없음.
