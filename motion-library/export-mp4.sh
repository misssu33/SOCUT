#!/usr/bin/env bash
# export-mp4.sh — render_mp4.py 의 짧은 껍데기. 자주 쓰는 호출만 감쌌다.
#
#   ./export-mp4.sh in.mp4 out.mp4 [preset] [theme]
#   ./export-mp4.sh --job presets/job-sample.json
#   ./export-mp4.sh in.mp4 out.mp4 pop-bounce reels-dark frames
#
# 엔진: ass(기본, 빠름) | frames(브라우저 Canvas 그대로, 픽셀 동일) | both
set -euo pipefail
cd "$(dirname "$0")"

if [ "${1:-}" = "--job" ]; then
  exec python3 render_mp4.py --job "$2" "${@:3}"
fi

VIDEO="${1:?사용법: ./export-mp4.sh in.mp4 out.mp4 [preset] [theme] [engine]}"
OUT="${2:?출력 파일 경로가 필요합니다}"
PRESET="${3:-pop-bounce}"
THEME="${4:-reels-dark}"
ENGINE="${5:-ass}"

exec python3 render_mp4.py \
  --video "$VIDEO" --out "$OUT" \
  --cues presets/cues-sample.json \
  --preset "$PRESET" --theme "$THEME" --engine "$ENGINE"
