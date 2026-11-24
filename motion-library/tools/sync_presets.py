#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""presets/korean-motion-presets.json 을 motions.js 의 @presets 블록에 주입한다.

프리셋의 단일 기준은 JSON 파일이다. motions.js 는 그 사본을 내장해
네트워크 없이(파일 하나로) 브라우저에서 동작한다. 두 사본이 어긋나지 않도록
tests 로 검증하고, 이 스크립트로 다시 동기화한다.

  python3 tools/sync_presets.py            # 주입
  python3 tools/sync_presets.py --check    # 주입 없이 일치 여부만 검사(불일치 시 exit 1)
"""
import argparse
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
JSON_PATH = ROOT / "presets" / "korean-motion-presets.json"
JS_PATH = ROOT / "motions.js"
BEGIN = "// @presets:begin"
END = "// @presets:end"


def render_block(doc: dict) -> str:
    body = json.dumps(doc, ensure_ascii=False, indent=2)
    body = "\n".join("  " + ln for ln in body.splitlines())
    return (
        BEGIN
        + "  (presets/korean-motion-presets.json 사본 — tools/sync_presets.py 로 생성. 직접 수정 금지)\n"
        + "  var PRESET_DOC = "
        + body.lstrip()
        + ";\n  "
        + END
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="쓰지 않고 일치하는지만 확인")
    a = ap.parse_args()

    doc = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    js = JS_PATH.read_text(encoding="utf-8")
    new_block = render_block(doc)
    pattern = re.compile(re.escape(BEGIN) + r".*?" + re.escape(END), re.S)
    if not pattern.search(js):
        print(f"ERROR: {BEGIN} / {END} 마커를 motions.js에서 찾지 못했습니다", file=sys.stderr)
        return 1
    updated = pattern.sub(lambda _m: new_block, js, count=1)

    if a.check:
        if updated != js:
            print("MISMATCH: motions.js 내장 프리셋이 JSON과 다릅니다. tools/sync_presets.py 를 실행하세요.", file=sys.stderr)
            return 1
        print("OK: motions.js 내장 프리셋이 JSON과 일치합니다.")
        return 0

    JS_PATH.write_text(updated, encoding="utf-8")
    print(f"OK: {JSON_PATH.name} -> {JS_PATH.name} 주입 완료 ({len(doc.get('presets', {}))}개 프리셋, {len(doc.get('themes', {}))}개 테마)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
