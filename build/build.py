#!/usr/bin/env python3
"""Assemble the single-file index.html from build/ parts.

`motion-library/motions.js`(한국어 자막 모션 라이브러리)를 그대로 인라인해
index.html 하나로 완전 자체 포함(외부 요청 0건)을 유지한다.
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
_C = [ROOT / "motion-library" / "motions.js", ROOT.parent / "motion-library" / "motions.js"]
MOTION = next((c for c in _C if c.exists()), _C[0])

css = (BUILD / "style.css").read_text(encoding="utf-8")
body = (BUILD / "body.html").read_text(encoding="utf-8")
js = (BUILD / "app.js").read_text(encoding="utf-8")

if not MOTION.exists():
    raise SystemExit(f"자막 모션 라이브러리가 없습니다: {MOTION}")
motions = MOTION.read_text(encoding="utf-8")
if "root.KoreanMotion = factory();" not in motions:
    raise SystemExit(f"motions.js 가 UMD 전역(KoreanMotion)을 내보내지 않습니다: {MOTION}")
if "</script" in motions.lower():
    raise SystemExit("motions.js 안에 </script> 문자열이 있어 인라인할 수 없습니다.")

html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">
<meta name="theme-color" content="#0a0c11">
<meta name="description" content="유튜브 쇼츠·릴스용 세로 영상을 브라우저에서 바로 편집하는 무료 웹앱. 설치 없이 색감, 자르기, 자막, 댓글 카드까지.">
<title>쇼츠 에디터 · Shorts &amp; Reels 편집</title>
<style>
{css}
</style>
</head>
<body>
{body}
<script>
/* ===== 한국어 자막 모션 라이브러리 (motion-library/motions.js 인라인) ===== */
{motions}
</script>
<script>
{js}
</script>
</body>
</html>
"""

out = ROOT / "index.html"
out.write_text(html, encoding="utf-8")
print("wrote", out, len(html), "chars",
      f"(css {len(css):,} + body {len(body):,} + motions {len(motions):,} + app {len(js):,})")
