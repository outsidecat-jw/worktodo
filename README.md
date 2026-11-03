# 회사 일정 (개인용 스케줄러 PWA)

광고 없는 개인용 달력 일정 앱. 아이폰(홈 화면 추가) + PC(크롬/엣지 앱 설치)에서
같은 데이터를 거의 실시간으로 동기화합니다.

## 파일
| 파일 | 역할 |
|---|---|
| `index.html` | 앱 전체 (화면 + 로직) |
| `config.js` | Firebase 설정. `null`이면 로컬 모드(동기화 없음) |
| `home/index.html` | 개인 일정용 주소. `index.html` 의 사본 (`sh tools/make-home.sh` 로 생성) |
| `manifest.json` | 홈 화면 설치 정보 (회사 일정) |
| `manifest-home.json` | 홈 화면 설치 정보 (개인 일정) |
| `repeat.js` | 반복 규칙. 앱과 알림 서버가 이 파일 하나를 같이 씀 (달력에 뜨는 날 = 알림 가는 날) |
| `holidays.json` | 공휴일 목록 처음 값·오프라인용 (애플 "대한민국 공휴일"). 최신본은 `holidays` 브랜치 — 손으로 고치지 말 것 |
| `server/update-holidays.js` | 공휴일 목록 받아 오는 스크립트 (`.github/workflows/holidays.yml` 이 매주 실행) |
| `sw.js` | 오프라인 캐시 |
| `icon-*.png` | 앱 아이콘 (검정=회사, `icon-home-*`=개인, 보라) |

## 기능
- **회사 / 개인 두 공간**: 상단 왼쪽 버튼으로 전환. 달력·목록·보관함·휴지통·검색이 모두 그 공간 것만 보임
  - 일정마다 `space`(`work`/`home`)를 달아 구분. 공간 표시가 없는 옛 일정은 회사 일정으로 봄
  - 고른 공간은 기기에 기억. 주소 끝에 `?s=home`을 붙이면 개인 일정으로 열림(아이콘 2개용)
- 월 달력: 날짜별 남은 일정 개수 표시, 전부 완료하면 ✓
- 일정 추가 / 수정 / 삭제 / 완료 체크
- 일정 탭 → 내일 하기 / 날짜 바꾸기 / 반복 설정
- 반복: 아이폰 캘린더와 같은 메뉴 — 없음 / 매일 / 평일 / 매주(요일 선택) / 2주마다 / 매월 / 매년 / **사용자 지정** + **반복 종료일**
  - 사용자 지정: N일·N주·N개월·N년마다, 매주 여러 요일, 매월 여러 날짜(예: 1·15일) 또는 "몇째 무슨 요일"(첫째 월요일, 마지막 평일, 첫째 주말 …), 매년 여러 달 + 요일
  - 매월 31일·매년 2월 29일처럼 그 달·그 해에 없는 날짜는 그 달 마지막 날에 뜸 (사용자 지정에서 날짜를 여러 개 고른 경우엔 없는 달은 건너뜀 — 아이폰과 같음)
  - 규칙은 `repeat.js` 한 곳. 고치면 앱과 알림 서버가 같이 바뀜
- 공휴일: 달력 숫자가 빨갛게, 날짜 아래 이름(예: "개천절(대체 휴일)"). 애플 "대한민국 공휴일"과 같은 자료라 대체공휴일·선거일도 들어감
  - GitHub 가 매주 월요일 새벽에 새로 받아, 바뀐 게 있으면 **`holidays` 브랜치에만** 올림. 앱은 그 브랜치 파일을 직접 읽어서 다음에 열 때 반영됨
  - main 은 건드리지 않으므로 GitHub Desktop 에 Pull origin 이 뜨지 않음 (신경 쓸 것 없음). `holidays` 브랜치는 손대지 말 것
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

## 4단계. 설치 — 아이콘 2개 (회사용 / 개인용)
홈 화면에 추가할 때의 주소에 따라 아이콘·이름이 갈립니다. 두 번 추가하면 아이콘 2개가 생깁니다.

| 아이콘 | 주소 | 이름 | 색 |
|---|---|---|---|
| 회사용 | `https://<계정>.github.io/worktodo/` | 회사 일정 | 검정 |
| 개인용 | `https://<계정>.github.io/worktodo/home/` | 개인 일정 | 보라 |

> 개인용은 반드시 **`/home/`** 주소로 추가해야 합니다. 아이폰은 홈 화면에 추가할 때 JS 로 바꾼
> 제목·아이콘·manifest 를 무시하고 그 HTML 에 처음부터 박힌 값만 쓰기 때문에, `?s=home` 으로 추가하면
> 이름이 "회사 일정"이 되고 열 때도 회사 공간으로 열립니다. 다른 주소로 넘겨 주는 방식도 소용없습니다
> (넘어간 뒤에 추가하면 결국 회사용 페이지에서 추가한 것이 되므로).
>
> 그래서 `home/index.html` 은 **`index.html` 의 사본**이며 머리말(head) 다섯 줄만 다릅니다
> (제목·홈 화면 이름·manifest·아이콘 + `<base href="../">` 로 파일 경로를 윗 폴더 기준으로).
> **`index.html` 을 고쳤으면 반드시 아래를 한 번 돌려 사본을 다시 만들어야 합니다.**
>
> ```
> sh tools/make-home.sh
> ```

- **아이폰**: Safari로 위 주소를 열기 → 공유 버튼 → **홈 화면에 추가**. 주소를 바꿔 한 번 더.
- **PC**: 크롬/엣지로 위 주소를 열기 → 주소창 오른쪽 **앱 설치** 아이콘. 주소를 바꿔 한 번 더.
  (PC 크롬은 `/home/` 로 설치해도 같은 앱으로 보고 "이미 설치됨"이 될 수 있습니다. 그때는
  회사 앱 하나만 두고 앱 안에서 전환하거나, 개인용 주소를 즐겨찾기/바로가기로 두십시오.)
- 어느 아이콘으로 열든 앱 안에서 **회사 ↔ 개인** 전환은 됩니다. 아이콘은 "바로 그 공간으로 열기"용입니다.
- `?s=` 없이 연 경우에는 마지막으로 보던 공간으로 열립니다.

## 수정 후 반영
`index.html` 수정 → **`sh tools/make-home.sh`** (개인용 사본 다시 만들기) → GitHub Desktop에서 커밋+Push
→ 1분 뒤 새로고침(앱은 껐다 켜기).
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
| `VAPID_SUBJECT` | `mailto:본인이메일` (예: `mailto:myname@example.com`) |

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
- 일정에 시간 + 알림(예: 30분 전)을 넣으면 그 시각에 알림. 서버가 매 1분 확인하므로 보통 1분 안에 옴.
- 완료 체크한 일정은 알림 안 옴. 체크를 풀면 다시 옴.
- 알림을 누르면 앱이 그 날짜로 열림.

### 자동 실행이 멈추지 않게
알림 발송은 실행 하나가 50분 돌고 끝날 때 스스로 다음 실행을 예약해 이어 달립니다(5분 예약은 끊겼을 때 되살리는 보험). 또 GitHub 는 저장소에 60일간 커밋이 없으면 예약 실행을 멈추는데, `.github/workflows/keepalive.yml` 이 매주 확인해서 45일 넘게 커밋이 없으면 빈 커밋을 자동으로 넣어 계속 돌게 합니다. 손댈 것 없음.
