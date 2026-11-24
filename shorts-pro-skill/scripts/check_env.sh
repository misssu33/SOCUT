#!/usr/bin/env bash
# shorts-pro 환경 점검
set -u
ok=0; warn=0
say(){ printf "%s\n" "$*"; }

say "== shorts-pro 환경 점검 =="

if command -v ffmpeg >/dev/null 2>&1; then
  say "✅ ffmpeg: $(ffmpeg -version 2>/dev/null | head -1)"
  for f in libx264 libass libfreetype; do
    if ffmpeg -hide_banner -buildconf 2>/dev/null | grep -q -- "--enable-$f"; then
      say "   - $f: 포함"
    else
      say "   ! $f: 확인 안 됨 (ASS/DrawText 사용 시 문제될 수 있음)"; warn=$((warn+1))
    fi
  done
  if ffmpeg -hide_banner -filters 2>/dev/null | grep -q " subtitles "; then
    say "   - subtitles 필터: 있음"
  else
    say "   ! subtitles 필터 없음 → libass 포함 빌드 필요"; warn=$((warn+1))
  fi
else
  if python3 -c "import imageio_ffmpeg" 2>/dev/null; then
    say "! PATH에 ffmpeg 없음 — 파이썬 imageio-ffmpeg 번들 사용 가능: $(python3 -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())')"
    say "   (스크립트는 자동으로 이 바이너리를 씁니다. 완전한 기능은 시스템 ffmpeg 설치 권장)"
    warn=$((warn+1))
  else
    say "❌ ffmpeg 없음 — Win: winget install Gyan.FFmpeg / mac: brew install ffmpeg / Ubuntu: sudo apt install ffmpeg"
    ok=1
  fi
fi

command -v ffprobe >/dev/null 2>&1 && say "✅ ffprobe 있음" || { say "! ffprobe 없음(길이 확인이 제한됨)"; warn=$((warn+1)); }

if command -v python3 >/dev/null 2>&1; then
  pyv=$(python3 -c 'import sys;print("%d.%d"%sys.version_info[:2])')
  say "✅ python3: $pyv"
  python3 -c "import json" 2>/dev/null && say "   - json 모듈: 정상"
else
  say "❌ python3 없음 — scripts/*.py 실행 불가"; ok=1
fi

if python3 -c "import playwright" 2>/dev/null; then
  say "✅ playwright 있음(카드 오버레이 사용 가능)"
  python3 -c "
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(); print('   - chromium:', b.version); b.close()
" 2>/dev/null || { say "   ! chromium 실행 실패 → python3 -m playwright install chromium"; warn=$((warn+1)); }
else
  say "· playwright 없음(선택) — 카드 오버레이를 쓰려면: pip install playwright && python3 -m playwright install chromium"
fi

if command -v node >/dev/null 2>&1; then
  say "✅ node: $(node -v) (Remotion 경로 사용 가능)"
else
  say "· node 없음(선택) — Remotion 경로를 쓰지 않으면 필요 없음"
fi

# 한국어 폰트
found=""
if command -v fc-list >/dev/null 2>&1; then
  found=$(fc-list :lang=ko 2>/dev/null | head -3)
fi
if [ -n "$found" ]; then
  say "✅ 한국어 폰트:"
  printf "%s\n" "$found" | sed 's/^/   - /'
else
  case "$(uname -s 2>/dev/null)" in
    Darwin) say "· macOS: Apple SD Gothic Neo 사용 가능(시스템 내장)" ;;
    *) say "! 한국어 폰트를 찾지 못함 — 자막이 □로 나올 수 있음(Noto Sans KR 설치 권장)"; warn=$((warn+1));;
  esac
fi

say ""
if [ "$ok" -ne 0 ]; then
  say "결과: 필수 항목 누락(위 ❌ 참고)"; exit 1
elif [ "$warn" -ne 0 ]; then
  say "결과: 사용 가능하지만 확인 필요 항목 $warn개"; exit 0
fi
say "결과: 모든 필수 항목 통과"
