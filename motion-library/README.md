# 한국어 자막 모션 라이브러리 (`motion-library/`)

세로 영상(숏폼·릴스·쇼츠)용 **한국어 자막 모션**을 한 곳에서 정의하고,
**브라우저 Canvas 미리보기**와 **MP4 파일**에 같은 모양으로 적용하는 라이브러리입니다.
의존성 0(브라우저), 파이썬 표준 라이브러리만(렌더).

- 프리셋 **15종** · 테마 **5종** · 안전영역/한국어 줄바꿈 내장
- 미리보기: `examples/preview.html` (파일 하나, 네트워크 불필요)
- MP4: FFmpeg+libass(빠름) 또는 브라우저 Canvas 프레임(미리보기와 픽셀 동일)

자세한 분석·설계는 **[ARCHITECTURE.md](ARCHITECTURE.md)** 를 보세요.

---

## 1. 브라우저에서 (미리보기)

```html
<script src="motions.js"></script>
<canvas id="c" width="1080" height="1920"></canvas>
<script>
  const ctx = document.getElementById('c').getContext('2d');
  const cues = [
    { start: 0.2, end: 2.6, text: '카메라가 놓친 오른쪽 4명 칼군무', preset: 'pop-bounce', theme: 'reels-dark' },
    { start: 2.7, end: 4.5, text: '조회수 120만 돌파', preset: 'count', theme: 'news-dark' }
  ];
  KoreanMotion.drawFrame(ctx, { cues, t: 1.2, W: 1080, H: 1920, scrim: { alpha: 0.55 } });
</script>
```

ESM/번들러에서는:

```js
import KM, { drawFrame, listPresets } from './motions.esm.js';
```

`motions.js` 하나로 `<script>`, `require()`, `import` 가 모두 됩니다(UMD).

## 2. MP4로 뽑기

```bash
# 가장 빠른 길 (FFmpeg + libass)
python3 render_mp4.py --video in.mp4 --cues presets/cues-sample.json --out out/result.mp4

# 프리셋/테마 지정
python3 render_mp4.py --video in.mp4 --cues cues.json --preset chip-wipe --theme mono-hud --out out/result.mp4

# 미리보기와 픽셀까지 같은 결과 (브라우저 Canvas로 프레임 렌더)
python3 render_mp4.py --video in.mp4 --cues cues.json --out out/result.mp4 --engine frames

# 작업 파일로 한 번에 (두 엔진 모두)
python3 render_mp4.py --job presets/job-sample.json

# 영상 없이 카드만
python3 render_mp4.py --cues cues.json --preset typewriter --duration 5 --out out/card.mp4
```

`export-mp4.sh` 는 위를 감싼 짧은 래퍼입니다.

```bash
./export-mp4.sh in.mp4 out.mp4 pop-bounce reels-dark ass
```

### 큐 파일 형식

```json
{
  "cues": [
    { "start": 0.3, "end": 2.6, "text": "카메라가 놓친 오른쪽 4명 칼군무",
      "preset": "pop-bounce", "theme": "reels-dark" },
    { "start": 2.75, "end": 4.5, "text": "조회수 120만 돌파",
      "preset": "count", "theme": "news-dark",
      "words": [{ "w": "조회수", "s": 2.75, "e": 3.3 },
                { "w": "120만", "s": 3.3, "e": 3.9 },
                { "w": "돌파", "s": 3.9, "e": 4.4 }] }
  ]
}
```

- `words` 를 넣으면 **발화 타이밍**에 맞춰 강조가 움직입니다(`word-highlight`, `karaoke-fill`).
  없으면 큐 길이를 고르게 나눕니다.
- `preset`/`theme` 은 큐마다 다르게 줄 수 있습니다(ASS 경로도 큐별 테마 지원).

## 3. 프리셋 · 테마

```bash
python3 make_ass.py --list-presets
```

| 프리셋 | 설명 |
|---|---|
| `outline-basic` | 흰 글자 + 외곽선, 짧은 페이드 (기본) |
| `slide-in-top` | 위에서 튕기며 내려오기 |
| `zoom-swap` | 1.22배에서 줄어들며 정착 |
| `chip-wipe` | 어두운 칩이 왼→오로 쓸리고 글자가 뜸 |
| `line-rise` | 줄마다 차례로 올라오기 |
| `pop-bounce` | 낱말마다 팝·바운스 (숏폼 기본) |
| `shift-key` | 오른쪽에서 기울어져 밀려 들어오기 |
| `word-highlight` | 지금 말하는 낱말만 강조 |
| `karaoke-fill` | 지나간 낱말이 색으로 채워짐 |
| `typewriter` | 타자기 + 커서 |
| `count` | 숫자 카운트업 |
| `shake` | 등장 셰이크 |
| `glitch` | RGB 글리치 |
| `char-jelly` | 글자별 젤리 |
| `none` | 자막 끔 |

테마: `reels-dark`(기본) · `news-dark` · `pastel-soft` · `mono-hud` · `variety-pop`(예능: 노랑+흰테+빨간외곽)

프리셋/테마는 **`presets/korean-motion-presets.json` 한 곳**만 고치면 됩니다.
고친 뒤 반드시:

```bash
python3 tools/sync_presets.py     # motions.js 내장 사본 갱신
```

## 4. 검증

```bash
python3 tests/run_all.py          # 전체(동기화·JS·ESM·ASS·MP4 2종·시각)
python3 tests/run_all.py --quick  # MP4 렌더 생략
python3 tests/smoke_js.py         # UMD/CJS + 15프리셋 + 픽셀 변화만
python3 tests/contact_sheet.py    # out/contact-presets.png, out/detail-*.png 생성
```

## 5. 환경 요구

| 항목 | 내용 |
|---|---|
| ffmpeg | PATH에 있으면 사용, 없으면 `imageio-ffmpeg` 번들 사용(이 환경엔 9.0.2, libass/libx264 포함) |
| 한국어 폰트 | `Noto Sans CJK KR` 필요. 리눅스는 `/usr/share/fonts` 아래에 있으면 자동 인식 |
| frames 엔진 | Playwright Chromium (없으면 ass 엔진만 사용) |
| Python | 3.10+ 표준 라이브러리만 (외부 패키지 없음) |

## 6. 라이선스

우리 코드 MIT. 참고한 두 프로젝트의 출처와 라이선스는 [ARCHITECTURE.md 5장](ARCHITECTURE.md#5-출처라이선스) 참고.
