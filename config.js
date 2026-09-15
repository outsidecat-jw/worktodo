// ─────────────────────────────────────────────────────────────
//  Firebase 설정
//  - null 이면 "로컬 모드" (이 기기 브라우저에만 저장, 동기화 없음)
//  - 값이 있으면 동기화 모드 (로그인 화면이 뜸)
//  ※ 이 값들은 공개되어도 되는 값입니다. 데이터 보호는 Firestore 규칙(본인 uid만)이 담당.
// ─────────────────────────────────────────────────────────────
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBw0DBCWcIllciPibE00ZtvIqKbo_hBypU",
  authDomain: "worktodo-dcabc.firebaseapp.com",
  projectId: "worktodo-dcabc",
  storageBucket: "worktodo-dcabc.firebasestorage.app"
};

// 로컬 모드로 되돌리려면 위 블록을 지우고 아래 한 줄만 남기면 됩니다.
// window.FIREBASE_CONFIG = null;

// 푸시 알림 공개 키 (VAPID). 비공개 키는 GitHub Secrets 에만 있고 여기엔 절대 넣지 않음.
// 이 값은 공개되어도 됩니다.
window.VAPID_PUBLIC_KEY = "BPF0z2FNr0J5JMJXmk6AWcFqoClzuTlC-qtszQcyjf7cKrAPXPyMNafwRayYf4ZMFsnJYNV5fzz-35HVnfoRGDA";
