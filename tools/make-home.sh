#!/bin/sh
# 개인 일정용 주소(home/index.html) 를 index.html 에서 자동으로 만든다.
#
# 왜 파일을 따로 두나:
#   아이폰은 "홈 화면에 추가" 할 때 JS 로 바꾼 제목·아이콘·manifest 를 무시하고,
#   그 HTML 에 처음부터 박혀 있는 값만 쓴다. 그래서 개인용 아이콘을 만들려면
#   제목·아이콘·manifest 가 처음부터 "개인 일정" 인 주소가 따로 있어야 한다.
#   다른 주소로 넘겨 주는(redirect) 방식은 소용없다 — 넘어간 뒤에 추가하면
#   결국 회사용 페이지에서 추가한 것이 되기 때문이다.
#
# 그래서 home/index.html 은 index.html 과 "머리말(head) 몇 줄만 다른 사본" 이다.
# index.html 을 고칠 때마다 이 스크립트를 한 번 돌리면 사본이 다시 만들어진다.
#   실행:  sh tools/make-home.sh     (저장소 맨 위 폴더에서)
set -e
cd "$(dirname "$0")/.."
[ -f index.html ] || { echo "index.html 을 찾을 수 없습니다"; exit 1; }
mkdir -p home

sed \
  -e 's|<title>회사 일정</title>|<title>개인 일정</title>\n<base href="../">\n<script>window.__SPACE_DEFAULT="home";</script>|' \
  -e 's|<meta name="apple-mobile-web-app-title" content="회사 일정">|<meta name="apple-mobile-web-app-title" content="개인 일정">|' \
  -e 's|<link rel="manifest" href="manifest.json">|<link rel="manifest" href="manifest-home.json">|' \
  -e 's|<link rel="apple-touch-icon" href="icon-180.png">|<link rel="apple-touch-icon" href="icon-home-180.png">|' \
  -e 's|<link rel="icon" href="icon-192.png">|<link rel="icon" href="icon-home-192.png">|' \
  index.html > home/index.html

# 바뀐 줄이 전부 제대로 들어갔는지 확인 (하나라도 빠지면 중단)
for need in '<title>개인 일정</title>' '<base href="../">' 'window.__SPACE_DEFAULT="home"' \
            'content="개인 일정"' 'manifest-home.json' 'icon-home-180.png' 'icon-home-192.png'; do
  grep -qF "$need" home/index.html || { echo "실패: '$need' 가 home/index.html 에 없습니다"; exit 1; }
done
grep -qF '<title>회사 일정</title>' home/index.html && { echo "실패: 회사 제목이 남아 있습니다"; exit 1; }

echo "home/index.html 을 만들었습니다 ($(wc -l < home/index.html) 줄)"
