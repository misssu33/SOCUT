# 모션 자막 15종 + 쇼츠 레이아웃

모든 수치의 단일 기준은 `presets.json`이다. 문서와 스크립트가 같은 파일을 읽으므로, 값을 바꾸려면 **`presets.json`만 고치고** `python3 -c "import json;json.load(open('presets.json'))"`로 검증한다.

- 캔버스: **1080x1920, 30fps**
- 자막 기본 위치: 아래에서 520px(`MarginV=520`) → 화면 y≈1400, 최대 2줄·12자/줄
- 폰트 기본: `Noto Sans CJK KR` (Windows `Malgun Gothic`, macOS `Apple SD Gothic Neo`)

---

## 1. 안전영역 (세 플랫폼 공통)

1080x1920 기준. TikTok·Reels·Shorts의 UI가 덮는 영역 중 **가장 엄격한 값**을 쓴다.

| 가장자리 | 여백 | 이유 |
|---|---|---|
| 상단 | **288px** | YouTube Shorts 상단 검색·탭 |
| 하단 | **672px** | Meta 릴스(35%)·YouTube 설명 바 |
| 왼쪽 | **96px** | Meta 6% 올림 |
| 오른쪽 | **192px** | Shorts 좋아요·댓글·공유 버튼 |
| → 남는 텍스트 영역 | **792 x 960** | 가운데 정렬 시 폭 696px |

- **엄격 안전영역(절대 가리면 안 되는 곳)**: y 288~1248
- **실전 자막 밴드**: y **1200~1450**. 여기까지만 내려도 설명 바와 겹치지 않는다.
- 타이틀·댓글 카드는 상단 300~900 구간, 코너 라벨은 y 210, 하단 CTA는 y 1150.
- 렌더 후 `--guide`로 점선 가이드를 켜서 한 장 확인하면 실수를 줄인다.

---

## 2. 자막 모션 15종

| # | id | 이름 | 계열 | 언제 | ASS | HTML |
|---|---|---|---|---|---|---|
| 1 | `typewriter` | 타자기 | reveal | 정보형 첫 문장, 리스트 도입 | 글자 누적 이벤트 + 커서 | `typewriter` |
| 2 | `shift-key` | 시프트 키 | word-pop | 낱말이 또각또각 박히는 강조 | 낱말별 지연 태그 | `shift` |
| 3 | `chip-wipe` | 칩 와이프 | box-wipe | 예능·정보형 소제목(배경 칩) | BorderStyle 3 + `\fscx` 와이프 | `chip` |
| 4 | `pop-bounce` | 팝/바운스 | scale | 훅·충격 문장(가장 범용) | 62%→112%→100% | `pop` |
| 5 | `rise-lines` | 줄마다 올라오기 | line | 2줄 설명, 브릿지 자막 | 줄별 `\move`+페이드 | `rise` |
| 6 | `word-highlight` | 낱말 강조 | color | 핵심 명사·숫자만 튀게 | `\1c`+`\fscx` | `highlight` |
| 7 | `emoji-attach` | 이모지 부착 | decorate | 리액션(폰트 지원 확인) | 문장 끝 글리프 | `emoji` |
| 8 | `count-up` | 숫자 카운트 | number | 조회수·기간·금액 | 숫자 교체 이벤트 | `count` |
| 9 | `random-appear` | 무작위 등장 | reveal | 의성어·짧은 감탄 | 글자별 랜덤 지연 | `random` |
| 10 | `slide-in-top` | 위에서 내려오기 | move | 컷 직후 새 정보 | `\move` 위→아래 | `slideTop` |
| 11 | `jelly` | 젤리 글자 | scale | 귀여운 예능 톤 | 글자별 회전 지터 | `jelly` |
| 12 | `led-marquee` | LED 전광판 | loop | 짧은 문구 반복(2초+) | 색 점멸 `\t(\1c)` | `led` |
| 13 | `zoom-swap` | 줌 아웃 교체 | scale | 한 줄을 다음 줄이 밀어냄 | 165%→100% | `zoomSwap` |
| 14 | `color-fill` | 색 입히기 | color | 결론 문장·유도 한 줄 | 흰색→강조색 | `colorFill` |
| 15 | `outline-basic` | 기본 외곽선 | base | 안전한 기본값 | 굵은 검정 외곽선 | `none` |

**조합 규칙(과하지 않게)**
- 훅: `pop-bounce` 또는 `chip-wipe`
- 본문: 3~5초마다 한 번만 강조(`word-highlight`, `count-up`)
- 전환부: `rise-lines`로 "같은 순간, 오른쪽에선" 같은 브릿지
- 한 영상에 **모션 3종 이내**. 매 컷마다 다른 모션은 산만하다.

---

## 3. ASS 경로 — captions.json → subs.ass

### 입력 형식

```json
{
  "captions": [
    {"start": 0.3, "end": 2.4, "text": "카메라가 놓친", "style": "pop-bounce"},
    {"start": 2.4, "end": 4.4, "text": "오른쪽 4명 칼군무", "style": "chip-wipe", "highlight": "칼군무"},
    {"start": 4.4, "end": 6.0, "text": "조회수 120만", "style": "count-up"},
    {"start": 6.0, "end": 7.2, "words": [{"w": "같은", "s": 6.0, "e": 6.3}, {"w": "순간", "s": 6.3, "e": 6.6},
                                        {"w": "오른쪽에선", "s": 6.6, "e": 7.2}],
     "text": "같은 순간 오른쪽에선", "style": "shift-key"}
  ]
}
```

- `style`을 큐마다 지정하고 `--style-by-caption`으로 실행하면 프리셋이 섞인다.
- `words`(Whisper 결과)가 있으면 낱말 타이밍이 그대로 쓰인다. 없으면 자동 분배.
- `highlight`는 `word-highlight`에서 강조할 낱말.

### 명령

```bash
python3 scripts/make_ass.py captions.json -o build/subs.ass --preset pop-bounce
python3 scripts/make_ass.py captions.json -o build/subs.ass --style-by-caption
python3 scripts/make_ass.py --list                     # 프리셋 목록
python3 scripts/make_ass.py cap.json -o s.ass --font "Malgun Gothic" --size 96 --margin-v 560
```

`--margin-v`가 클수록 자막이 위로 올라간다(안전영역을 지키려면 520~620).

### ASS 스타일 기본값 (`presets.json` `ass_style`)

| 항목 | 값 |
|---|---|
| Fontname | Noto Sans CJK KR |
| Fontsize | 92 |
| PrimaryColour | `&H00FFFFFF` (흰색) |
| OutlineColour | `&H00101010` (검정) |
| Outline / Shadow | 8 / 3 |
| Alignment | 2 (하단 중앙), MarginL/R 120, MarginV 520 |

**색 표기 주의**: ASS는 `&HAABBGGRR`(BGR 순서). `#F0A93C`(앰버) → `&H003CA9F0`. HTML에는 `#F0A93C`를 그대로 쓴다. `presets.json`에 `accent_html`/`accent_ass`로 둘 다 적어 두었다.

### 검증된 사실
- 15종 전부 생성·굽기 성공, 한국어 정상 렌더(프레임 육안 확인).
- `chip-wipe`는 `BorderStyle: 4`가 아니라 **`BorderStyle: 3` + `Outline` 패딩**이어야 예쁜 칩이 나온다(4는 글자마다 검은 테두리가 생겼다).
- `\r` 대신 명시적 속성 리셋(`\1c&H00FFFFFF&\fscx100\fscy100`)을 써야 위치가 유지된다.
- 이모지는 폰트에 없으면 흑백 윤곽선으로 대체된다. 컬러 이모지가 필요하면 HTML 경로에서 PNG/SVG 아이콘을 쓴다.
- 둥근 모서리는 ASS로 불가능(칩은 각진 사각형). 둥글이 필요하면 HTML 경로.

---

## 4. HTML 경로 — 카드·타이틀·모션 자막

`assets/overlay.html`이 1080x1920 투명 레이어를 그리고, `scripts/render_overlay.py`가 프레임별 PNG를 뽑아 ffmpeg로 합성한다.

### overlay.json

```json
{
  "duration": 6.0,
  "title": {
    "badge": "카메라가 놓친",
    "badge_color": "#2F6BFF",
    "text": [{"t": "오른쪽 ", "c": "#FFFFFF"}, {"t": "4명 칼군무", "c": "#7C5CFF"}],
    "start": 0, "end": 6, "motion": "pop"
  },
  "corner": [
    {"start": 0, "end": 2.4, "left": "10.25 인기가요 풀캠", "right": "@choiaejjing"},
    {"start": 2.4, "end": 6.0, "left": "10.24 음악중심", "right": "@choiaejjing"}
  ],
  "comments": [
    {"start": 0.4, "end": 2.4, "handle": "@kkk_123", "likes": "1.2천",
     "text": "이 구간만 무한반복 중입니다", "accent": "무한반복"}
  ],
  "subtitles": [
    {"start": 0.3, "end": 2.4, "text": "카메라가 놓친", "style": "pop-bounce"},
    {"start": 2.4, "end": 4.4, "text": "오른쪽 4명 칼군무", "style": "chip-wipe", "highlight": "칼군무"},
    {"start": 4.4, "end": 6.0, "text": "조회수 120만", "style": "count-up"}
  ],
  "guide": false
}
```

| 필드 | 설명 |
|---|---|
| `title.badge` / `badge_color` | 둥근 배지(반지름 32px) + 문구 |
| `title.scrim` | 기본 `true`. 상단에 어두운 그라데이션을 깔아 밝은 영상에서도 제목이 읽히게 한다. 끄려면 `false` |
| `title.text` | `[{t,c}]` 배열 — 낱말마다 색을 지정해 **2색 제목** |
| `corner[]` | 구간마다 왼쪽 출처 라벨·오른쪽 채널명 교체 |
| `comments[]` | 유튜브 댓글 카드(핸들·하트수·본문·강조어) |
| `subtitles[]` | `style`은 위 15종 id |
| `guide` | 안전영역 점선 표시 |

### 명령

```bash
pip install playwright && python3 -m playwright install chromium

# 스틸 먼저 확인(빠름)
python3 scripts/render_overlay.py overlay.json --preview out/prev --times 1.0,3.0,5.0

# 본 렌더(합성까지)
python3 scripts/render_overlay.py overlay.json --base cut.mp4 -o final.mp4

# 안전영역 가이드 켜고 확인
python3 scripts/render_overlay.py overlay.json --base cut.mp4 -o final_guide.mp4 --guide
```

- 렌더 속도: 이 환경(2 vCPU급)에서 **6초·180프레임 = 약 26초**(합성 포함).
- 프레임은 임시 폴더에 만들고 자동 삭제. 보관하려면 `--keep-frames`.
- 출력은 1080x1920 H.264 High, bt709, 원본 오디오 유지.

### 검증된 사실
- 카드·타이틀·자막 전부 한국어 정상 렌더.
- `count-up`은 숫자만 별도 span으로 분리해야 "만" 같은 단위가 사라지지 않는다(수정 완료).
- 타이틀 위 어두운 스크림(기본 켜짐)이 없으면 밝은 무대 영상에서 제목이 묻힌다.
- 카드가 타이틀을 가리지 않게 댓글 카드는 y=520부터 시작.

---

## 5. 레이아웃 좌표 (`presets.json` `layouts`)

| 레이아웃 | 위치·크기 | 규칙 |
|---|---|---|
| 상단 타이틀 | x60, y300, w960 / 배지 h64 r32 fs34 / 제목 fs76 w900 | 첫 프레임부터 끝까지 고정, 색은 2개까지 |
| 댓글 카드 | x60, y520, w800 / r28 / 본문 fs38 | 컷마다 교체, 1.5~4초, 화면 1/3 이상 가리지 않기 |
| 코너 라벨 | 좌 x60 y210 h56 r12 fs30 / 우측정렬 fs28 | 왼쪽=방송·날짜, 오른쪽=채널명 |
| 브릿지 자막 | x90 y1200 w900 h250 / fs88 w900, 외곽선 10 | 전환 0.3~1.2초만, 2줄·12자 |
| 하단 CTA | y1150 / fs44 | 마지막 2~3초, 행동 하나만 |

---

## 6. 폰트

| OS | 자막 폰트 이름 |
|---|---|
| Windows | `Malgun Gothic` |
| macOS | `Apple SD Gothic Neo` |
| Linux | `Noto Sans CJK KR` |

**페어링 3종** (`presets.json` `fonts.pairings`)
1. `Black Han Sans` 제목 + `Noto Sans KR` 본문 — 아이돌·예능형
2. `Noto Serif KR` 제목 + `Noto Sans KR` 본문 — 정보·다큐형
3. `Pretendard ExtraBold` + `Pretendard` — 모바일 가독성 중시 정보형

무료 배포처: Google Fonts, 눈누(noonnu.cc), 배달의민족·카페24·쿠키런 폰트. 상업용 무료만 사용하고, 확실치 않으면 사용자에게 확인한다.

---

## 7. 훅 문구 패턴 (한국형)

| 패턴 | 예 | 쓰는 곳 |
|---|---|---|
| 숫자형 | "3초 만에 끝났다" | 정보·비교 |
| 반전형 | "다들 반대로 알고 있다" | 상식 뒤집기 |
| 약속형 | "이거 모르면 손해" | 리스트·꿀팁 |
| 질문형 | "왜 자꾸 끊길까?" | 문제 제기 |
| 무대 직캠형 | "카메라가 놓친" | 아이돌·공연 컷 |

12자 이내, 첫 프레임에 완성, 영상이 실제로 그 약속을 지켜야 한다.
