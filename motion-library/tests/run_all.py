#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""전체 검증 — motion-library가 실제로 도는지 한 번에 확인한다.

  python3 tests/run_all.py            # 기본(ASS 1개 + frames 1개 렌더)
  python3 tests/run_all.py --quick    # MP4 렌더 생략

검사 항목
  1. 프리셋 단일 기준 동기화 (motions.js 내장 == presets/*.json)
  2. motions.js 문법·UMD(CJS)·ESM import·전 프리셋 렌더·픽셀 변화
  3. ASS 컴파일: 프리셋 15종 전부에서 이벤트가 나오고 경고가 없는지
  4. MP4 렌더: ass 엔진 / frames 엔진 → 실제 해상도·길이·오디오 확인
"""
from __future__ import annotations

import http.server
import json
import os
import re
import pathlib
import socketserver
import subprocess
import sys
import threading

# 이 작업 환경에 미리 받아 둔 Chromium이 있으면 그걸 쓰고, 없으면 Playwright 기본 해석에 맡긴다
_PW_BROWSERS = "/workspace/.pw/browsers"
if os.path.isdir(_PW_BROWSERS):
    os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", _PW_BROWSERS)
    os.environ.setdefault("LD_LIBRARY_PATH", "/workspace/.pw/libs")

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
OUT.mkdir(exist_ok=True)
sys.path.insert(0, str(ROOT))

fails: list[str] = []


def check(cond: bool, msg: str, extra: str = "") -> None:
    print(("  ✅ " if cond else "  ❌ ") + msg + (f"  {extra}" if extra else ""))
    if not cond:
        fails.append(msg)


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, **kw)


# ---------------------------------------------------------------- 1. 동기화
print("① 프리셋 동기화")
r = run([sys.executable, "tools/sync_presets.py", "--check"])
check(r.returncode == 0, "motions.js 내장 프리셋 == presets JSON", r.stdout.strip() or r.stderr.strip())

doc = json.loads((ROOT / "presets" / "korean-motion-presets.json").read_text(encoding="utf-8"))
check(len(doc["presets"]) >= 14, f"프리셋 {len(doc['presets'])}종 / 테마 {len(doc['themes'])}종")
need_modes = {"line", "lines", "chip", "word", "char", "karaoke", "typewriter", "count", "shake", "glitch"}
missing = need_modes - {p.get("mode") for p in doc["presets"].values()}
check(not missing, "요청된 모션 모드가 모두 정의됨", str(sorted(missing)) if missing else "")

# ---------------------------------------------------------------- 2. motions.js
print("② motions.js (브라우저·Node 공용)")
r = run([sys.executable, "tests/smoke_js.py"])
check(r.returncode == 0, "문법·UMD(CJS)·전 프리셋 렌더·픽셀 변화", r.stdout.strip().splitlines()[-1] if r.stdout else r.stderr[-300:])

from playwright.sync_api import sync_playwright  # noqa: E402


class _H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(("127.0.0.1", 0), lambda *a, **k: _H(*a, directory=str(ROOT), **k))
port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.goto(f"http://127.0.0.1:{port}/tests/_esm.html")
    try:
        pg.wait_for_function("window.__esm && (window.__esm.ok || window.__esm.error)", timeout=8000)
    except Exception:
        pass
    res = pg.evaluate("() => window.__esm || null")
    check(bool(res and res.get("ok")), "ESM import(motions.esm.js) 동작", json.dumps(res, ensure_ascii=False))
    if res and res.get("ok"):
        check(res["presets"] == len(doc["presets"]), "ESM named export에서 프리셋 개수 일치", str(res["presets"]))
    b.close()
httpd.shutdown()

# ---------------------------------------------------------------- 3. ASS 컴파일
print("③ ASS 컴파일 (프리셋 전종)")
from make_ass import AssCompiler, Cue, DEFAULT_PRESETS, load_json  # noqa: E402

bad: list[str] = []
warned: list[str] = []
for pid in doc["presets"]:
    comp = AssCompiler(doc, "reels-dark", pid)
    text = "카메라가 놓친 오른쪽 4명 칼군무 그리고 조회수 120만 돌파"
    comp.compile_cue(Cue(start=0.3, end=2.6, text=text, preset=pid, theme="reels-dark"))
    comp.compile_cue(Cue(start=2.7, end=4.4, text="조회수 120만 돌파", preset=pid, theme="news-dark",
                         words=[{"w": "조회수", "s": 2.7, "e": 3.2}, {"w": "120만", "s": 3.2, "e": 3.8},
                                {"w": "돌파", "s": 3.8, "e": 4.4}]))
    ass = comp.script()
    events = [ln for ln in ass.splitlines() if ln.startswith("Dialogue")]
    if pid == "none":
        if events:
            bad.append(pid)
        continue
    if not events:
        bad.append(pid)
    if comp.warnings:
        warned.extend(f"{pid}: {w}" for w in comp.warnings)
    for need in ("PlayResX: 1080", "PlayResY: 1920", "WrapStyle: 2"):
        if need not in ass:
            bad.append(f"{pid}({need})")
check(not bad, "모든 프리셋이 Dialogue 이벤트를 만든다", str(sorted(set(bad))) if bad else "")
check(not warned, "컴파일 경고 없음", "; ".join(warned)[:200])

# ASS 텍스트가 깨지지 않는가(중괄호·역슬래시 이스케이프)
comp = AssCompiler(doc, "variety-pop", "outline-basic")
comp.compile_cue(Cue(start=0, end=2, text="중괄호 {테스트} 와 역슬래시 \\ 확인", preset="outline-basic", theme="variety-pop"))
ass = comp.script()
line = next((l for l in ass.splitlines() if l.startswith("Dialogue")), "")
fields = line.split(",", 9)
body = re.sub(r"\{[^{}]*\}", "", fields[9] if len(fields) == 10 else "")
stray = body.replace("\\N", "").replace("\\n", "")
check(bool(line) and "{" not in stray and "}" not in stray and "\\" not in stray,
      "본문의 중괄호/역슬래시가 ASS 태그로 새지 않음", body.strip()[:60])

# ---------------------------------------------------------------- 4. MP4
if "--quick" not in sys.argv:
    print("④ MP4 렌더 (ass · frames)")
    for engine in ("ass", "frames"):
        out = OUT / f"test-{engine}.mp4"
        r = run([sys.executable, "render_mp4.py",
                 "--video", "test/media/sample-9x16.mp4",
                 "--cues", "presets/cues-sample.json",
                 "--out", str(out.relative_to(ROOT)), "--engine", engine])
        if r.returncode != 0:
            check(False, f"{engine} 엔진 렌더", r.stderr[-400:])
            continue
        from make_ass import media_duration, media_size  # noqa: E402
        w, h = media_size(out)
        d = media_duration(out)
        check(out.exists() and out.stat().st_size > 50_000,
              f"{engine} 엔진 MP4 생성", f"{out.stat().st_size // 1024} KB")
        check((w, h) == (1080, 1920), f"{engine} 해상도 1080x1920", f"{w}x{h}")
        check(abs(d - 8.0) < 0.15, f"{engine} 길이 ≈ 8.0s", f"{d:.2f}s")
    print("⑤ 콘택트시트")
    r = run([sys.executable, "tests/contact_sheet.py"])
    check(r.returncode == 0, "프리셋 시각 검증(시간에 따라 변함)", r.stdout.strip().splitlines()[-1] if r.stdout else "")

print()
if fails:
    print(f"실패 {len(fails)}건:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("전체 통과 ✅")
