# 한국어 자막 모션 라이브러리 — 분석 · 설계 · 검증 보고서

작성 2026-11-24 · `motion-library/` v1.0.0

---

## 0. 한 장 요약

두 GitHub 프로젝트를 **실제로 클론해 소스를 읽고**, 재사용할 수 있는 부분만 뽑아
우리 용도(한국어 세로 영상 자막)에 맞는 라이브러리를 새로 만들었습니다.

| 만든 것 | 무엇을 하는가 | 검증 |
|---|---|---|
| `motions.js` (1,751줄) | **의존성 0** 프리셋·레이아웃·Canvas 2D 렌더러. `<script>`, `require`, `import` 모두 동작 | 브라우저 실측 + CJS + ESM 통과 |
| `presets/korean-motion-presets.json` | 프리셋 15종·테마 5종의 **단일 기준** | motions.js 내장 사본과 일치 검사 |
| `make_ass.py` (874줄) | 같은 프리셋 → **ASS 자막 파일**(FFmpeg/libass용) | 프리셋 전종 컴파일, 경고 0 |
| `render_mp4.py` (339줄) | 영상 + 큐 → **실제 MP4**. 엔진 2종(ass / frames) | 1080×1920 · 8.00초 · 오디오 포함 실파일 생성 |
| `export-mp4.sh` | 위를 감싼 짧은 실행 스크립트 | — |
| `examples/preview.html` | 브라우저 미리보기(프리셋·테마·시간·안전영역) | Playwright 스크린샷 확인 |
| `ARCHITECTURE.md` | 이 문서 | — |

**검증된 실제 결과물** (모두 이 폴더 안에 있음):

```
out/demo-ass.mp4      1,655 KB · 1080×1920 · 8.00s · 오디오 있음   (FFmpeg+libass 엔진)
out/demo-frames.mp4     305 KB · 1080×1920 · 8.00s · 오디오 있음   (Canvas 프레임 엔진)
out/contact-presets.png       프리셋 14종 × 3시점 콘택트시트
out/detail-*.png              프리셋별 캡션 밴드 1080 실크기 크롭(애니메이션 5프레임)
out/band-*.png                테마별 실제 크기 크롭
```

`shorts-editor-webapp/` 과 `shorts-pro-skill/` 은 **읽기만 했고 한 글자도 고치지 않았습니다.**

---

## 1. Opus Motion Library — 실제 소스 구조

`GovinduSasanka/opus-motion-library` · v1.2.0 · MIT · 클론해서 확인

### 1.1 규모

```
README.md 269 KB, catalog.json 1.9 MB, props-schema.json 1.9 MB, styles.json 198 KB
src/ 754개 .ts/.tsx  →  src/motions/** 605+ 모션, 21개 카테고리
gallery/ 616장(모션별 결과 이미지), recipes/ 33개 조합 스펙, cli/ 18개, mcp/server.mjs
의존: Remotion 4.0.532 + React 19 + three.js (피어 의존성)
```

카테고리: `text, transition, shape, illustration, camera, particles, data, hud, 3d, texture,
character, environment, fx, image, ui, music, game, document, product, map, mascot`

### 1.2 모션 정의 스키마 — `src/core/types.ts`

```ts
interface MotionDef<P> {
  id: string;            // kebab-case, CLI/스펙에서 쓰는 키
  title: string;
  category: Category;
  description: string;   // 한 줄 설명
  source: string[];      // 어떤 샘플 영상에서 역산했는지 (예: "video10 0:04-0:42")
  useFor: string;        // 어떤 장면에 쓰면 좋은지
  durationInFrames: number;  // 기본 30fps 기준 프레임 수
  defaultProps: P;
  propDocs: Partial<Record<keyof P, string>>;
  component: React.FC<P>;
  tags?: string[];
}
```
`catalog.json`(617항목)은 이 메타데이터의 색인이고, `props-schema.json`은 여기서 **자동 생성**한
JSON Schema입니다(`cli/gen-schemas.mjs`). 즉 "정의 → 색인 → 스키마 → 문서"가 코드에서 생성됩니다.

### 1.3 순수 수학 — `src/core/ease.ts`

샘플 영상의 프레임별 위치 그래프에서 역산한 값이라는 주석이 달려 있습니다.

| 이름 | 값 | 용도 |
|---|---|---|
| `out` | `bezier(0.16, 1, 0.30, 1)` | 기본 등장 |
| `inOut` | `bezier(0.65, 0, 0.35, 1)` | 카메라 이동·모프 |
| `sine` | `bezier(0.37, 0, 0.63, 1)` | 긴 드리프트 |
| `in` | `bezier(0.55, 0, 1, 0.45)` | 퇴장 |
| `back` | `bezier(0.34, 1.56, 0.64, 1)` | 팝·스티커(오버슈트) |
| `expoOut` | `bezier(0.19, 1, 0.22, 1)` | 줌 통과 |

함수: `prog(frame,start,end,ease)`(구간 0..1), `tween(frame,[f0,f1],[v0,v1],ease)`,
`lerp`, `clamp`, `springs`(pop 11/160/0.7, soft 20/90/1, snappy 18/260/0.6, wobble 7/120/0.8),
`springAt`, `envelope(frame,total,inF,outF)`, `squash(velocity)`, `onTwos`, `phase`.
**전부 프레임(float)만 받는 순수 함수** — 다른 렌더러로 그대로 옮길 수 있는 부분입니다.

### 1.4 레이아웃 — `src/core/stage.tsx`, `src/core/kinetic-type-kit.tsx`

- `useStage()`: **`u = min(w,h)/1080`**. 모든 모션이 `u` 단위로 크기를 정해 16:9·1:1·9:16에서 같은 비율.
- `wrapWords(text,size,maxW,font,tracking)`: **추정 폭**으로 단어 단위 줄바꿈(첫 프레임부터 안정적).
- `fitBlock(text,size,maxW,maxH,...)`: 6%씩 줄이며 `maxW×maxH`에 맞는 최대 크기 탐색(우리 `layoutCaption`의 원형).
- `useTextWidths()`: DOM `offsetWidth` 실측 + `document.fonts.ready`까지 `delayRender`로 대기.
- `hexA()`, `mixCol()`, `h01(a,b,seed)`(결정적 해시), `scrambleChar()`.

### 1.5 디자인 토큰 — `styles.json`

148종. 각 항목이 **팔레트 + 폰트 + 모션 규칙**을 함께 가진 "스타일 어휘"입니다.

```json
{"id":"woodcut","family":"print","palette":{"bg":"#EFE8D8","ink":"#111111","accent":"#C8502A",
 "swatches":["#111111","#EFE8D8","#C8502A","#D8C29C"]},
 "fonts":{"display":"IM Fell English SC","body":"IM Fell English"},"step":2,
 "signature":["box-bot","flock","parallax-landscape","stamp-slam"],
 "avoid":["grey fills","photo-through-a-filter flatness"],
 "confusableWith":["engraving","newsprint"],
 "motionRules":"Characters on twos, camera on ones; pictures appear by being carved."}
```
`signature`(이 스타일에서 쓸 모션 id) · `avoid`(금지) · `confusableWith`(헷갈리는 스타일)는
**AI가 스타일을 고를 때 쓰라고 만든 필드**입니다. 우리 테마 JSON도 이 발상을 가져와
`note`(언제 쓰는지)를 넣었습니다.

### 1.6 도구 계층

- `cli/mgl.mjs`: `list / render / compose / serve / suggest` — 모션 id + props로 MP4 렌더.
- `recipes/*.json`: 여러 모션을 시간축에 배치한 조합 스펙(`compose`).
- `mcp/server.mjs`: MCP 도구 11종(`search_motions, get_motion, list_styles, preview, render,
  export(webm-alpha/prores/gif/png), add_to_project, integration_guide`).
  주석에 "렌더는 `npm install` + PATH의 FFmpeg 필요"라고 명시.
- `analysis/`, `docs/`, `specs/`, `storyboards/`: 역산 근거 자료.

### 1.7 자막 관련 모션 3종과 한계

| 파일 | 내용 |
|---|---|
| `src/motions/text/kinetic-captions.tsx` | **핵심.** `CaptionCue{text,from,to,highlight[],words[{text,from,to}],position,tone,sub}` + variant 10종(`kinetic/premium/slam/toast/frosted-bar/terminal/print/karaoke/rise/word`). 단어별 spring 팝(scale 0.82→1), 활성 단어 하이라이트 박스, 발화 타이밍에 맞춘 밝기(0.38→1.0), 쿠션 스크림 |
| `src/motions/text/hanazi-caption.tsx` | 예능 자막. 글자마다 5겹 텍스트(오프셋 엑스트루전·색 외곽·흰 외곽·그라데이션·광택)를 spring으로 팝, 이후 미세 wiggle/bob |
| `src/motions/text/story-caption-box.tsx` | 검정 박스 자막(`box`), 노란 판(`plate`) 등 6종 |

**우리가 메워야 할 구멍이 여기 있습니다.**
1. CJK 폰트 스택이 중국어 기준입니다 — `'Microsoft YaHei','PingFang SC','Noto Sans CJK SC'`.
   한국어 폰트(Noto Sans KR / Apple SD Gothic Neo / Malgun Gothic)도, 한글 줄바꿈 규칙도 없습니다.
2. 타이밍이 전부 **Remotion 프레임** 단위 → 브라우저 Canvas나 FFmpeg에서 그대로 못 씁니다.
3. 폰트를 `@remotion/google-fonts`로 받아오므로 **네트워크·번들러 전제**입니다.

---

## 2. Insta Reel Editor — 실제 자막 렌더 방식

### 2.1 후보 3개 중 실제 구현은 어느 것인가

`gh search repos "insta-reel-editor"` 결과 중 브리프에 있던 3개를 **전부 열어 확인**했습니다.

| 저장소 | 파일 | 실체 | 자막 렌더 |
|---|---|---|---|
| **PrajsRamteke/insta-reel-editor-skill** | 66개(코드 47) | Python 스킬. `build_ass.py`(12 KB) · `make_captions.py`(10 KB) · `build_hyperframes.py`(55 KB) · `reframe.py`(19 KB) · 문서 20여 편 | **✅ 진짜.** ASS 생성 + libass 굽기, 4가지 캡션 스타일, 단어 동기 |
| bhoomikakarmardi/instagram-reels-editor | 2개(`index.html` 8.6 KB) | 단일 HTML. Canvas2D + MediaRecorder | △ 정적 자막 1줄(`drawCaption`: measureText 줄바꿈, y=h*0.45, 800 Arial, shadowBlur 10). 애니메이션·타이밍 없음 |
| rogue-dev-studio/rogue-instagram-reel-editor-skill | 5개 | `SKILL.md` 산문뿐(코드 0) | ❌ 없음(moviepy `TextClip` 언급만) |

→ **본체는 PrajsRamteke 쪽**입니다. 아래는 그 코드를 직접 읽고 정리한 것입니다.

### 2.2 FFmpeg + ASS 엔진 — `scripts/build_ass.py`

실제 파일에서 확인한 7가지 기법. 이게 이 프로젝트의 핵심 자산입니다.

1. **`PlayResX: 1080` / `PlayResY: 1920`** — 없으면 libass가 384×288 기준으로 해석해
   폰트 크기·좌표가 전부 어긋납니다(주석에 명시).
2. **`WrapStyle: 2`** — 자동 줄바꿈을 끄고 `\N`으로 직접 끊습니다(줄 길이를 우리가 통제).
3. **색은 `&HAABBGGRR`** (알파 먼저, 그다음 BGR). `#FFD60A` → `&H000AD6FF`.
4. **`ASS_SCALE = 1.2`** — "libass 폰트 크기는 같은 숫자의 CSS px보다 약 20% 작게 읽힌다"는
   실측 보정값. (우리는 폰트가 달라 **1.45**로 다시 측정했습니다 — 4.6절)
5. **카라오케 = 낱말 구간마다 Dialogue 이벤트 하나**:
   페이지 전체 텍스트를 매번 다시 쓰고, 활성 낱말만 `{\c accent&\fscx108\fscy108}`로 감싼 뒤
   `{\c text&\fscx100\fscy100}`로 되돌립니다. → **레이아웃이 흔들리지 않고 단어 동기가 정확**.
   아직 안 나온 낱말은 `{\alpha&HFF&}`(투명) → **자리(레이아웃)는 유지한 채 숨김**.
6. **페이드는 첫·마지막 조각에만**: `\fad(90,0)`, `\fad(0,70)`. 조각마다 걸면 매 낱말마다 깜빡입니다
   (우리가 초기에 이 실수를 그대로 재현했다가 고쳤습니다 — 4.6절).
7. **번인**: `-vf ass=captions.ass:fontsdir=fonts_ass`를 **ASS 폴더를 cwd로** 실행
   (필터가 `:`와 `\`를 파싱하므로 상대 경로), `libx264 -crf 16 -pix_fmt yuv420p`, `-c:a copy`.

텍스트 그래픽도 ASS 태그로 해결합니다:
`hook-title`(kicker + `\move` 220 ms), `keyword`(`\t(0,180,\fscx100\fscy100)` 60%→100% 팝),
`cta`, `chapter`(칩) — 그리고 "칩 배경은 FFmpeg 엔진에서 지원 안 함"이라고 표에 적어 두었습니다.

### 2.3 캡션 그룹핑 — `scripts/make_captions.py`

| 규칙 | 값 |
|---|---|
| 페이지 분할 | 무음 ≥ 0.45 s · 문장부호(`.!?`) 뒤 · 쉼표+0.2 s · 단어 4개 · 글자 18 · 길이 2.6 s |
| 스타일별 | `karaoke` 2–4단어/18자/2줄, `pop` 1–3/14/1, `phrase` 4–8/26/2, `minimal` 3–6/28/2 |
| 읽기 보정 | 줄 끝에 기능어 남기지 않기("breathe the / wrong way" → "breathe / the wrong way"), 고아 단어 병합, 0.5 s 미만 깜빡임 병합, 줄 균형 |
| 타이밍 | 첫 낱말 60 ms 전 등장, 최대 0.5 s 잔류, 페이지끼리 겹치지 않음 |

### 2.4 안전영역 · 타이밍 표 (문서에서 확인)

`reference/safe-zones.md`, `scripts/_common.py`의 `SAFE` 상수:

```
top_organic 220 / top_conservative 270 / title_safe x70–1010 y270–1240
caption_band x140–940 y990–1240 / rail x940–1080 y1000–1750
bottom_conservative 1250 / bottom_organic 1500 / side 65
그리드 3:4 크롭 y240–1680, 피드 4:5 y285–1635
```

`reference/timing-easing.md`: 요소별 enter/exit/hold 초 표, GSAP↔CSS↔Remotion 이징 대응,
스프링 4단계, 스태거 예산, 오버슈트 예산, 성격(personalty)별 모션 팔레트.
이 표들은 **렌더러와 무관한 지식**이라 그대로 가져왔습니다.

### 2.5 테마 토큰 — `assets/themes/*.json` (7종)

```json
{"name":"minimal-subtitle","personality":"premium",
 "fonts":{"display":{"family":"Inter","package":"@fontsource/inter","weight":700}, "body":{...}},
 "colors":{"text":"#FFFFFF","accent":"#FFFFFF","card":"rgba(0,0,0,0.55)","on_card":"#FFFFFF", ...},
 "caption":{"style":"minimal","size":46,"weight":600,"case":"none","highlight":"none","box":true},
 "motion":{"in":0.4,"out":0.3,"ease_in":"power2.out","pop":"power2.out","stagger":0.06,"word_pop":1.0},
 "ambient":{"scrim_bottom":false,"drift_zoom":0.0,"progress_bar":false}}
```

### 2.6 한계 (그래서 우리가 새로 만든 이유)

- **영어 전제**: `max_words`·영어 기능어 목록(`the, a, of, to…`)·라틴 폰트 벤더링(npm `@fontsource`).
  한국어는 낱말 수 = 글자 수가 아니고, 조사가 붙어 띄어쓰기 단위가 다릅니다.
- 애니메이션이 프리셋 몇 개에 **하드코딩**된 ASS 태그. 새 모션을 추가하려면 파이썬을 고쳐야 합니다.
- 폰트를 npm에서 받아 `.woff`를 fontsdir로 복사 → **node/npm 필요**(우리 환경엔 없음).
- 한국어 폰트가 없으면 두부(□)가 나옵니다.

---

## 3. 비교와 재사용 분리

### 3.1 순수 수학·모션 수식 (양쪽에서 그대로 재사용)

| 자산 | 출처 | 우리 구현 |
|---|---|---|
| 이징 곡선 6종 | Opus `ease.ts` + insta-reel `timing-easing.md` | `motions.js` `ease` (10종, 같은 베지어 값) |
| `prog / lerp / clamp` | Opus | `prog, lerp, clamp` (초 단위로 일반화) |
| 스프링 4종 | Opus `springs`, insta-reel 표 | `spring(t,cfg)` 감쇠 진동 해석해(프레임레이트 무관) |
| `envelope(in,out)` | Opus | 프리셋 `enter/exit` 진행도로 흡수 |
| `squash(velocity)` | Opus | `char-jelly`의 `from.squash` |
| 결정적 해시 `h01` | Opus `kinetic-type-kit` | `hash01/hashSigned` (shake·glitch 지터, 파이썬과 **같은 값**) |
| 스태거·오버슈트 예산 | insta-reel 표 | 프리셋 `stagger`, `backOut` 곡선 |

### 3.2 레이아웃·타이포·테마 토큰

| 자산 | 출처 | 우리 구현 |
|---|---|---|
| `u = min(w,h)/1080` | Opus `stage.tsx` | `unit(W,H)`, 모든 치수를 `em`/`u`로 |
| 자동 크기 맞춤 | Opus `fitBlock` | `layoutCaption`(6% 축소, `maxLines`까지) |
| 줄바꿈 | Opus `wrapWords`(추정폭) | `wrapTokens` + **한국어 규칙**(3.3절) |
| 안전영역 좌표 | insta-reel `_common.SAFE` | `presets.json > canvas.safe`(같은 숫자) |
| 캡션 밴드 = 아래끝 1240 | insta-reel | `defaultLayout()` 기본값 |
| 테마 토큰 스키마 | 양쪽 | `themes/*`(font/weight/sizeRatio/lineHeight/letterSpacing/colors/outlineEm/haloEm/shadowEm) |
| 스타일 `note`(언제 쓰나) | Opus `useFor` | 테마·프리셋 `note` |
| 요소별 enter/exit/hold 초 | insta-reel 표 | 프리셋 `enter.dur/exit.dur` 기본값 |

### 3.3 렌더러별 레이어 (공유 불가 → 각각 구현)

| 기능 | Canvas 2D (`motions.js`) | ASS (`make_ass.py`) | 일치도 |
|---|---|---|---|
| 페이드 | `globalAlpha` | `\fad(in,out)` | 일치 |
| 이동 | `ctx.translate` | `\move(...)` / `\pos` | 일치 |
| 확대·회전 | `ctx.scale/rotate` | `\fscx\fscy\frz\t(...)` | 일치 |
| 외곽선 | `strokeText` 2겹 | `Outline` / `\bord` | 근사(굵기 단위 다름, 4.6절) |
| 둥근 칩 | `roundRect` | 벡터 `\p1` + 베지어 | 근사(모서리 반경 동일) |
| 칩 와이프 | 폭 보간 | `\org`+`\fscx` 0→100 | 근사(같은 방향·시간) |
| 글자별 젤리 | `scale(sx,sy)` 개별 | 불가 → 낱말 팝으로 근사 | 부분 |
| RGB 글리치 | `lighter` 합성 3겹 + 슬라이스 | `\c` 3겹 이벤트 | 근사 |
| 커서 | 사각형 1개 | `|` 글자 | 근사 |
| 줄바꿈 | **실측**(`measureText`) | **추정폭**(한글 1.0em) | 대체로 일치, 경계에서 갈릴 수 있음 |

**버린 것**: Remotion/React 컴포넌트, three.js, `@remotion/google-fonts` 로딩, HyperFrames 엔진,
npm 기반 폰트 벤더링. (우리 환경에 node/npm이 없고, 사용자 앱은 단일 HTML이어야 하므로)

**새로 만든 것**: 한국어 줄바꿈기, 초 단위 타임라인, 선언적 프리셋 15종, 두 렌더러를 하나로 묶는
프리셋 JSON, 그리고 **실제로 MP4를 뽑는 파이프라인 2종**.

---

## 4. 우리 라이브러리 설계

### 4.1 파일 구조

```
motion-library/
├── motions.js                         # UMD: 순수수학 + 토큰 + 레이아웃 + Canvas 렌더러
├── motions.esm.js                     # ESM named export 껍데기
├── presets/
│   ├── korean-motion-presets.json      # ★ 단일 기준(프리셋 15 · 테마 5 · 안전영역)
│   ├── cues-sample.json                # 예시 큐 4개(프리셋/테마를 큐마다 지정)
│   └── job-sample.json                 # 예시 작업(영상+큐+출력 경로)
├── make_ass.py                         # 프리셋 → ASS (FFmpeg/libass)
├── render_mp4.py                       # 영상+큐 → MP4 (엔진 ass / frames)
├── export-mp4.sh                       # 짧은 실행 래퍼
├── examples/preview.html               # 브라우저 미리보기
├── tools/sync_presets.py               # JSON → motions.js 내장 사본 주입/검사
├── tests/
│   ├── run_all.py                      # 전체 검증(동기화·JS·ESM·ASS·MP4·시각)
│   ├── smoke_js.py                     # UMD/CJS + 15프리셋 렌더 + 픽셀 변화
│   ├── contact_sheet.py                # 콘택트시트·상세 크롭 생성
│   └── _esm.html                       # ESM import 확인용 페이지
├── test/media/sample-9x16.mp4          # 검증용 8초 1080×1920 샘플(ffmpeg로 생성)
└── out/                                # 검증 산출물(MP4·PNG)
```

### 4.2 단일 기준과 동기화

프리셋은 **JSON 한 곳**에만 있습니다. `motions.js`는 네트워크 없이(파일 하나로) 돌아야 하므로
같은 JSON을 `// @presets:begin … end` 블록에 내장하고, `tools/sync_presets.py`가 주입합니다.
`tests/run_all.py` 첫 검사가 **두 사본이 같은지** 확인하므로 조용히 어긋날 수 없습니다.

```bash
python3 tools/sync_presets.py          # 주입
python3 tools/sync_presets.py --check  # 검사(불일치 시 exit 1)
```

### 4.3 프리셋 15종과 11개 모드

프리셋 하나 = `{mode, enter, hold, exit, per, stagger, style, ass}`.
`mode`가 Canvas 경로와 ASS 경로를 1:1로 갈라놓는 축입니다.

| 프리셋 | mode | 캔버스에서 보이는 것 | ASS에서 |
|---|---|---|---|
| `none` | none | 아무것도 안 그림 | 이벤트 없음 |
| `outline-basic` | line | 0.16 s 페이드 + 0.1em 상승 | `\fad` |
| `slide-in-top` | line | 1.1em 위에서 back 이징으로 낙하 | `\move` + `\fad` |
| `zoom-swap` | line | 1.22 → 1.0 축소, 퇴장 0.9 | `\fscx/\t` |
| `chip-wipe` | chip | 칩이 왼→오로 쓸리고 글자가 0.1 s 뒤 등장 | 벡터 `\p1`+`\org`+`\fscx\t` + 텍스트 지연 |
| `line-rise` | lines | 줄마다 0.06 s 간격으로 상승 | 줄별 이벤트 + `\pos` |
| `pop-bounce` | word | 낱말마다 0.55배→1.22배 오버슈트 팝 | 낱말 구간 이벤트 + `\alpha&HFF&` 숨김 |
| `shift-key` | word | 오른쪽에서 기울어져 진입 | 낱말 구간 이벤트 |
| `word-highlight` | karaoke | 지금 말하는 낱말만 강조색+1.10배 | 활성 낱말 `\c`+`\fscx` |
| `karaoke-fill` | karaoke | 지나간 낱말이 채워지고 미발화는 0.42 투명 | 활성/미발화 `\c` |
| `typewriter` | typewriter | 초당 14자 + 얇은 커서 깜빡임 | 글자 수만큼 세그먼트 + `|` |
| `count` | count | 숫자를 0→목표로 0.8 s 카운트 | 0.06 s 간격 숫자 세그먼트 |
| `shake` | shake | 0.35 s 감쇠 지터 | 2프레임 단위 `\pos` 지터 |
| `glitch` | glitch | RGB 3겹 + 가로 슬라이스 | `\c` 3겹 이벤트 + 지터 |
| `char-jelly` | char | 글자마다 스쿼시·스트레치 스프링 | 낱말 팝으로 근사 |

### 4.4 한국어 처리

- **줄바꿈**: 공백 토큰 + ① 숫자·단위 묶음(`120만`, `3.5%`, `12초`) ② 줄 끝 금지 문자(여는 괄호·따옴표)
  ③ 줄 머리 금지 문자(닫는 괄호·마침표·쉼표) ④ 한 토큰이 폭을 넘으면 글자 단위 분할 ⑤ 2줄이면 **균형**
  (문장부호 뒤 분할 선호). Python 쪽도 같은 규칙·같은 추정폭 표를 씁니다.
- **크기는 큐마다 고정**: 자막 크기가 큐마다 달라지면 읽기 리듬이 깨지므로, 2줄을 넘을 때만 6%씩 줄입니다.
- **자간**: 테마의 `letterSpacing`(em)을 Canvas `ctx.letterSpacing`과 ASS `Spacing`에 같은 값으로.
- **폰트 스택**: `"Noto Sans CJK KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif`.
  이 환경에는 `/usr/share/fonts/pickle-hwp/NotoSansCJKkr-Regular.otf`(Regular 1벌)만 있습니다.
- **한국어 예능 톤**: `variety-pop` 테마 = 노란 채움 + 흰 헤일로 + 빨간 외곽(3겹) —
  Opus의 `hanazi-caption` 5겹 스택을 Canvas 3겹·ASS 2겹으로 줄여 구현했습니다.

### 4.5 MP4 파이프라인 2종

```
① ass 엔진 (기본, 빠름)
   cues.json ─▶ make_ass.py ─▶ captions.ass ─▶ ffmpeg(-vf ass=…:fontsdir=…) ─▶ MP4
   실측: 8초 1080×1920 → 약 1.6 MB, 1~2초 소요

② frames 엔진 (미리보기와 픽셀 동일)
   cues.json ─▶ Playwright Chromium ─▶ motions.js drawFrame(1080×1920) ─▶ PNG 240장
             ─▶ ffmpeg -framerate 30 -i f%05d.png -i 원본 ─▶ MP4
   실측: 8초 240프레임 렌더 9.3초 + 인코딩 → 305 KB
```

두 엔진 모두 **원본 오디오를 그대로** 넣습니다(`-c:a copy` 또는 AAC 재인코딩).

검증 결과(실제로 만든 파일을 다시 ffmpeg로 읽어 확인):

| 파일 | 해상도 | 길이 | 오디오 | 크기 | 엔진 |
|---|---|---|---|---|---|
| `out/demo-ass.mp4` | 1080×1920 | 8.00 s | 있음 | 1,655 KB | ass |
| `out/demo-frames.mp4` | 1080×1920 | 8.00 s | 있음 | 305 KB | frames |

### 4.6 실측 보정치 (숫자가 다르면 결과가 어긋나는 것들)

| 항목 | 측정/결정 | 근거 |
|---|---|---|
| libass 폰트 배율 | **1.45** (CSS px × 1.45 = ASS Fontsize) | Fontsize 100 → 한글 advance 63.7px·잉크높이 63px, Chromium 62.1px → 잉크높이 58px. insta-reel의 1.2(라틴 Inter 기준)와 다름 |
| ASS 타임스탬프 | **내림(floor)** | 반올림하면 이어지는 두 조각이 같은 시각을 가져 한 프레임에 겹칩니다(카운트 프리셋에서 "돌"이 뭉개짐 → 수정) |
| 페이드 | 첫 조각 in / 마지막 조각 out만 | 조각마다 `\fad`를 걸면 낱말마다 화면이 깜빡임(타자기에서 실측 확인) |
| 굵기 | `Bold=-1` 그대로 + 합성굵기 기본 **끔** | libass가 Regular 폰트를 FreeType으로 굵게 그려 줍니다. 두 겹 덧칠(`--synthetic-bold`)은 62px에서 ㄷ·ㅗ·ㄹ 사이가 메워져 오히려 나빴습니다 |
| 칩 모서리 | ASS 벡터 `b`(3차 베지어, k=0.5523r) | 사각형만으론 캔버스 `roundRect`와 달라 보임 |
| 줄바꿈 | Python도 **균형(balance)** 적용 | 없으면 캔버스는 "카메라가 놓친 / 오른쪽 4명 칼군무", ASS는 "카메라가 놓친 오른쪽 4명 / 칼군무"로 갈렸음 |
| 프레임 엔진 | 240장/8초 = 9.3초 | 1080×1920 PNG 저장 포함 |

### 4.7 성능

| 작업 | 시간 |
|---|---|
| 프리셋 1개 ASS 컴파일 | ~10 ms |
| 8초 영상 ass 번인 | ~2 초 |
| 8초 영상 frames 렌더(240프레임) | ~9 초 |
| `tests/run_all.py` 전체 | 약 40 초 |

### 4.8 한계와 다음 단계

**한계(정직하게)**
1. **ASS 경로는 근사**입니다 — 글자별 젤리, RGB 슬라이스, 칩 둥근 모서리 반경 등은 Canvas와
   완전히 같지 않습니다. 정확히 같게 하려면 `--engine frames`를 쓰세요.
2. **줄바꿈은 측정 방식이 다릅니다** — Canvas는 실측, ASS는 추정폭. 폭이 경계에 걸리는 문장은
   줄이 갈릴 수 있습니다(현재 샘플 문장들에서는 일치 확인).
3. **Bold 폰트가 없습니다** — libass의 합성 굵기에 의존합니다. `fonts/`에 Bold를 넣고
   `--fontsdir`로 넘기면 더 정확합니다.
4. **자막 생성(ASR)은 범위 밖**입니다 — 큐 JSON(텍스트+시각)을 입력으로 받습니다.
   필요하면 Whisper 계열로 `words[]`를 채워 넣으면 `karaoke` 계열이 발화에 정확히 붙습니다.
5. 자동 줄바꿈이 `maxLines`를 넘으면 글자를 줄이므로, 아주 긴 문장은 작아집니다(의도된 동작).

**Step 5 연결 가이드(다른 작업이 끝난 뒤 메인에서)**
- `shorts-editor-webapp`은 지금 `S.ov.sub = {on, style, text, color}` + `drawSubtitle(ctx,W,H,t)`로
  `none/plain/chip/popup/typing` 5종을 직접 그립니다. 교체는 세 줄이면 됩니다:
  ```js
  // 기존: drawSubtitle(...) 호출부
  KoreanMotion.drawFrame(ctx, {
    cues: [{start: 0, end: 1e9, text: S.ov.sub.text, preset: S.ov.sub.style, theme: S.ov.theme || 'reels-dark'}],
    t: t, W: W, H: H, preset: S.ov.sub.style, theme: S.ov.theme || 'reels-dark'
  });
  ```
  기존 `popup`→`pop-bounce`, `typing`→`typewriter`, `chip`→`chip-wipe`, `plain`→`outline-basic`,
  `none`→`none` 으로 매핑하면 UI는 그대로 두고 14종으로 늘어납니다.
- `index.html` 빌드 전에 `motions.js`를 `<script src="motions.js">`로 넣거나 build.py에서 합치면 됩니다.
- `shorts-pro-skill`의 `make_ass.py`(15종, 자체 프리셋)와 역할이 겹칩니다. 정리 방향:
  `presets.json`의 `subtitle_motions`를 이 라이브러리 프리셋으로 대체하고, `make_ass.py`는
  이 폴더의 `make_ass.py`로 위임하는 얇은 래퍼로 바꾸는 것이 좋습니다.

---

## 5. 출처·라이선스

| 대상 | 라이선스 | 우리가 가져온 것 |
|---|---|---|
| `GovinduSasanka/opus-motion-library` v1.2.0 | MIT | 이징 곡선 값, `u` 단위, 추정폭 줄바꿈·크기맞춤, 결정적 해시, 스프링 값, 테마 토큰 발상 |
| `PrajsRamteke/insta-reel-editor-skill` | (저장소 라이선스 파일 없음 — 아이디어/기법만 참고) | ASS 기법 7가지, 캡션 그룹핑 규칙, 안전영역·타이밍 표, 테마 스키마 |
| 이 프로젝트 코드 (`motions.js`, `make_ass.py`, `render_mp4.py` 등) | MIT | 우리가 새로 작성 |

문서·수치의 근거는 모두 위 두 저장소의 해당 파일이며, 이 문서 1~2장에 파일 경로를 함께 적었습니다.
