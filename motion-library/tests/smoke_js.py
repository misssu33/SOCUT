#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""motions.js 문법·UMD·프리셋 동기화 스모크 테스트 (Playwright Chromium 사용).

  python3 tests/smoke_js.py
"""
import json
import os
import pathlib
import sys

# 이 작업 환경에 미리 받아 둔 Chromium이 있으면 그걸 쓰고, 없으면 Playwright 기본 해석에 맡긴다
_PW_BROWSERS = "/workspace/.pw/browsers"
if os.path.isdir(_PW_BROWSERS):
    os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", _PW_BROWSERS)
    os.environ.setdefault("LD_LIBRARY_PATH", "/workspace/.pw/libs")

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
JS = (ROOT / "motions.js").read_text(encoding="utf-8")
DOC = json.loads((ROOT / "presets" / "korean-motion-presets.json").read_text(encoding="utf-8"))

fail = []


def check(name, cond, extra=""):
    print(("  ✅ " if cond else "  ❌ ") + name + (f"  {extra}" if extra else ""))
    if not cond:
        fail.append(name)


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.goto("about:blank")
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))

    # 1) CommonJS 경로(module.exports) — Node 없이 UMD의 CJS 분기를 실제로 실행
    res = pg.evaluate(
        """(src) => {
            const module = { exports: {} };
            const exports = module.exports;
            const fn = new Function('module', 'exports', src);
            fn(module, exports);
            const ML = module.exports;
            return {
                version: ML.VERSION,
                presets: Object.keys(ML.presets).length,
                themes: Object.keys(ML.themes).length,
                hasDraw: typeof ML.drawFrame === 'function'
            };
        }""",
        JS,
    )
    check("CommonJS require 경로 동작", res["version"] == "1.0.0", str(res))
    check("프리셋 15개 로드", res["presets"] == len(DOC["presets"]), str(res["presets"]))
    check("테마 5개 로드", res["themes"] == len(DOC["themes"]), str(res["themes"]))
    check("drawFrame 노출", res["hasDraw"])

    # 2) 브라우저 전역(전통 스크립트) 경로 + 실제 Canvas 렌더
    pg.add_script_tag(content=JS)
    r2 = pg.evaluate(
        """() => {
            const ML = window.KoreanMotion;
            const c = document.createElement('canvas');
            c.width = 540; c.height = 960;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#123';
            ctx.fillRect(0, 0, 540, 960);
            const cues = [
                {start: 0, end: 2, text: '카메라가 놓친 오른쪽 4명 칼군무'},
                {start: 2, end: 4, text: '조회수 120만 돌파', words: [
                    {w: '조회수', s: 2.0, e: 2.4}, {w: '120만', s: 2.4, e: 2.8}, {w: '돌파', s: 2.8, e: 3.2}]}
            ];
            const out = {};
            for (const preset of ML.listPresets().map(x => x.id)) {
                const info = ML.drawFrame(ctx, {cues, t: 0.6, W: 540, H: 960, preset, theme: 'reels-dark'});
                if (preset !== 'none' && !info) out[preset] = 'no-draw';
            }
            // 픽셀 변화 확인(자막이 실제로 그려졌는가)
            const before = ctx.getImageData(0, 0, 540, 960).data;
            ctx.fillStyle = '#123'; ctx.fillRect(0, 0, 540, 960);
            ML.drawFrame(ctx, {cues, t: 0.6, W: 540, H: 960, preset: 'outline-basic', theme: 'reels-dark'});
            const after = ctx.getImageData(0, 0, 540, 960).data;
            let diff = 0;
            for (let i = 0; i < before.length; i += 4) if (Math.abs(before[i] - after[i]) > 8) diff++;
            return {out, diff, plan: ML.plan(cues, {theme: 'reels-dark'})};
        }"""
    )
    check("15개 프리셋 모두 렌더 경로 통과", not r2["out"], str(r2["out"]))
    check("자막 픽셀이 실제로 그려짐", r2["diff"] > 500, f"changed px={r2['diff']}")
    plan = r2["plan"]
    check("plan() 줄바꿈 계산", len(plan) == 2 and all(p["lines"] for p in plan), str([p["lines"] for p in plan]))
    for p in plan:
        print("     ·", p["id"], p["size"], p["lines"], int(p["blockW"]))
    check("페이지 오류 없음", not errs, str(errs))
    b.close()

print()
if fail:
    print(f"실패 {len(fail)}건: {fail}")
    sys.exit(1)
print("모든 스모크 테스트 통과")
