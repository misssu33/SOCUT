/*!
 * Korean Subtitle Motion Library — motions.js  v1.0.0
 * ------------------------------------------------------------------
 * 의존성 0. 브라우저(Canvas 2D) / Node(CommonJS) / AMD 어디서든 같은 코드로 동작한다.
 *
 *   [1] 순수 수학   : 이징(cubic-bezier) · 스프링 · 진행도 · 스태거 · 결정적 난수
 *   [2] 디자인 토큰 : 테마(폰트·색·자간·행간) · 릴스 안전영역
 *   [3] 레이아웃    : 한국어 줄바꿈 · 자동 크기 맞춤 · 캡션 밴드 배치
 *   [4] 프리셋      : 선언적 모션 정의(enter/hold/exit) — presets/korean-motion-presets.json 이 단일 기준
 *   [5] Canvas 렌더 : drawFrame(ctx, {cues, t}) — 브라우저 미리보기·프레임 캡처
 *   [6] ASS 연결    : 프리셋의 `ass` 블록이 FFmpeg(libass) 컴파일러의 입력이 된다
 *
 * 프리셋 JSON은 아래 @presets 블록에 그대로 주입된다(tools/sync_presets.py).
 * 손으로 고치지 말고 presets/korean-motion-presets.json 을 고친 뒤 동기화한다.
 *
 * 라이선스: 이 프로젝트 자체 코드(MIT). 참고한 아이디어의 출처는 ARCHITECTURE.md 5장 참고.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();            // Node / bundler (CommonJS)
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);                   // AMD
  } else {
    root.KoreanMotion = factory();         // <script> 전역
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  /* ==================================================================
   * 0. 프리셋 문서 (단일 기준의 사본)
   * ================================================================== */

  // @presets:begin  (presets/korean-motion-presets.json 사본 — tools/sync_presets.py 로 생성. 직접 수정 금지)
  var PRESET_DOC = {
    "schema": "korean-motion-library/presets@1",
    "version": "1.0.0",
    "updated": "2026-11-24",
    "locale": "ko-KR",
    "notes": [
      "이 파일이 프리셋·테마·안전영역의 단일 기준(single source of truth)이다.",
      "motions.js(브라우저 Canvas 2D)와 make_ass.py(FFmpeg·libass)가 같은 숫자를 읽는다.",
      "단위 규칙: 길이(dur/stagger/delay)는 초, dy/dx/outline/blur는 글자크기(em) 배수, scale은 배수, rot은 도(deg).",
      "mode는 Canvas 렌더 경로와 ASS 컴파일 경로가 1:1로 대응한다(ARCHITECTURE.md 3장 표 참고)."
    ],
    "canvas": {
      "W": 1080,
      "H": 1920,
      "fps": 30,
      "safe": {
        "top_organic": 220,
        "top_conservative": 270,
        "title_safe": {
          "x0": 70,
          "y0": 270,
          "x1": 1010,
          "y1": 1240
        },
        "caption_band": {
          "x0": 140,
          "y0": 990,
          "x1": 940,
          "y1": 1240
        },
        "rail": {
          "x0": 940,
          "y0": 1000,
          "x1": 1080,
          "y1": 1750
        },
        "bottom_conservative": 1250,
        "bottom_organic": 1500,
        "side": 65
      }
    },
    "themes": {
      "reels-dark": {
        "label": "릴스 다크",
        "note": "흰 글자 + 진한 외곽선 + 핑크 포인트. 가장 무난한 기본값.",
        "font": "\"Noto Sans CJK KR\", \"Apple SD Gothic Neo\", \"Malgun Gothic\", sans-serif",
        "weight": 800,
        "sizeRatio": 0.0575,
        "lineHeight": 1.26,
        "letterSpacing": -0.012,
        "colors": {
          "text": "#FFFFFF",
          "outline": "#0B0B0F",
          "accent": "#FF3D6E",
          "onAccent": "#FFFFFF",
          "chip": "rgba(9,12,18,0.80)",
          "chipAccentBar": "#FF3D6E",
          "shadow": "rgba(0,0,0,0.72)"
        },
        "outlineEm": 0.085,
        "shadowEm": 0.035,
        "upper": false
      },
      "news-dark": {
        "label": "뉴스 다크",
        "note": "노란 포인트 + 얇은 외곽선. 정보 전달·뉴스·리뷰 영상.",
        "font": "\"Noto Sans CJK KR\", \"Apple SD Gothic Neo\", \"Malgun Gothic\", sans-serif",
        "weight": 700,
        "sizeRatio": 0.0535,
        "lineHeight": 1.3,
        "letterSpacing": -0.006,
        "colors": {
          "text": "#F7F7F5",
          "outline": "#101114",
          "accent": "#FFD60A",
          "onAccent": "#141414",
          "chip": "rgba(14,16,20,0.86)",
          "chipAccentBar": "#FFD60A",
          "shadow": "rgba(0,0,0,0.68)"
        },
        "outlineEm": 0.062,
        "shadowEm": 0.028,
        "upper": false
      },
      "pastel-soft": {
        "label": "파스텔 라이트",
        "note": "크림 칩 위에 먹색 글자. 밝은 영상·일상 브이로그.",
        "font": "\"Noto Sans CJK KR\", \"Apple SD Gothic Neo\", \"Malgun Gothic\", sans-serif",
        "weight": 700,
        "sizeRatio": 0.054,
        "lineHeight": 1.34,
        "letterSpacing": -0.004,
        "colors": {
          "text": "#1B1B22",
          "outline": "#FFF6E9",
          "accent": "#F0577B",
          "onAccent": "#FFFFFF",
          "chip": "rgba(255,246,233,0.92)",
          "chipAccentBar": "#F0577B",
          "shadow": "rgba(90,70,60,0.28)"
        },
        "outlineEm": 0.0,
        "shadowEm": 0.02,
        "upper": false
      },
      "mono-hud": {
        "label": "모노 HUD",
        "note": "자간을 넓힌 테크 느낌. 제품·데이터·튜토리얼.",
        "font": "\"Noto Sans CJK KR\", \"Apple SD Gothic Neo\", \"Malgun Gothic\", sans-serif",
        "weight": 700,
        "sizeRatio": 0.0505,
        "lineHeight": 1.34,
        "letterSpacing": 0.02,
        "colors": {
          "text": "#F2FFFB",
          "outline": "#04140F",
          "accent": "#5BF0C2",
          "onAccent": "#04140F",
          "chip": "rgba(4,20,15,0.80)",
          "chipAccentBar": "#5BF0C2",
          "shadow": "rgba(0,0,0,0.60)"
        },
        "outlineEm": 0.055,
        "shadowEm": 0.03,
        "upper": false
      },
      "variety-pop": {
        "label": "예능 팝",
        "note": "두꺼운 흰 테두리 + 노란 글자 + 빨간 외곽. 예능·리액션 순간에만.",
        "font": "\"Noto Sans CJK KR\", \"Apple SD Gothic Neo\", \"Malgun Gothic\", sans-serif",
        "weight": 800,
        "sizeRatio": 0.066,
        "lineHeight": 1.2,
        "letterSpacing": -0.018,
        "colors": {
          "text": "#FFD400",
          "outline": "#B3113D",
          "accent": "#FFFFFF",
          "onAccent": "#B3113D",
          "chip": "rgba(0,0,0,0)",
          "chipAccentBar": "#FFD400",
          "halo": "#FFFFFF",
          "shadow": "rgba(0,0,0,0.55)"
        },
        "outlineEm": 0.16,
        "haloEm": 0.075,
        "shadowEm": 0.05,
        "upper": false
      }
    },
    "presets": {
      "none": {
        "label": "자막 없음",
        "note": "자막을 끄는 상태값. 렌더러는 아무것도 그리지 않는다.",
        "mode": "none",
        "enter": {
          "dur": 0,
          "ease": "linear",
          "from": {}
        },
        "hold": {},
        "exit": {
          "dur": 0,
          "ease": "linear",
          "to": {}
        },
        "per": "page",
        "stagger": 0,
        "style": {},
        "ass": {
          "mode": "none"
        }
      },
      "outline-basic": {
        "label": "기본 외곽선",
        "note": "가장 조용한 기본값. 0.16초 페이드 + 0.1em 상승 진입, 짧은 페이드 아웃.",
        "mode": "line",
        "enter": {
          "dur": 0.16,
          "ease": "outSoft",
          "from": {
            "opacity": 0,
            "dy": 0.1
          }
        },
        "hold": {
          "breathe": 0.0
        },
        "exit": {
          "dur": 0.12,
          "ease": "in",
          "to": {
            "opacity": 0
          }
        },
        "per": "page",
        "stagger": 0,
        "style": {
          "highlight": "none"
        },
        "ass": {
          "mode": "line",
          "fadeIn": 80,
          "fadeOut": 60
        }
      },
      "slide-in-top": {
        "label": "위에서 내려오기",
        "note": "1.1em 위에서 살짝 튕기며 내려온다. 첫 큐·훅에 적합.",
        "mode": "line",
        "enter": {
          "dur": 0.34,
          "ease": "backOut",
          "from": {
            "opacity": 0,
            "dy": -1.1,
            "scale": 0.98
          }
        },
        "hold": {
          "bob": 0.012,
          "bobDur": 2.6
        },
        "exit": {
          "dur": 0.2,
          "ease": "in",
          "to": {
            "opacity": 0,
            "dy": -0.35
          }
        },
        "per": "page",
        "stagger": 0,
        "style": {
          "highlight": "none"
        },
        "ass": {
          "mode": "line",
          "moveFrom": [
            0,
            -1.1
          ],
          "enterMs": 340,
          "fadeIn": 120,
          "fadeOut": 180
        }
      },
      "zoom-swap": {
        "label": "줌 교체",
        "note": "1.22배에서 줄어들며 정착, 끝날 때 0.9배로 빠진다. 장면 전환형 자막.",
        "mode": "line",
        "enter": {
          "dur": 0.3,
          "ease": "expoOut",
          "from": {
            "opacity": 0,
            "scale": 1.22
          }
        },
        "hold": {
          "breathe": 0.008,
          "breatheDur": 2.0
        },
        "exit": {
          "dur": 0.18,
          "ease": "in",
          "to": {
            "opacity": 0,
            "scale": 0.9
          }
        },
        "per": "page",
        "stagger": 0,
        "style": {
          "highlight": "none"
        },
        "ass": {
          "mode": "line",
          "scaleFrom": 1.22,
          "enterMs": 300,
          "fadeIn": 90,
          "fadeOut": 90
        }
      },
      "chip-wipe": {
        "label": "칩 와이프",
        "note": "어두운 칩 배경이 왼쪽에서 오른쪽으로 쓸리듯 깔린 뒤 글자가 뜬다.",
        "mode": "chip",
        "enter": {
          "dur": 0.28,
          "ease": "outSoft",
          "from": {
            "wipe": 0,
            "textDelay": 0.1,
            "textDur": 0.12
          }
        },
        "hold": {},
        "exit": {
          "dur": 0.2,
          "ease": "in",
          "to": {
            "wipe": 0,
            "textDelay": 0,
            "textDur": 0.08
          }
        },
        "per": "page",
        "stagger": 0,
        "style": {
          "highlight": "none",
          "chipPadEm": 0.62,
          "chipRadiusEm": 0.3,
          "accentBar": true
        },
        "ass": {
          "mode": "chip",
          "wipeMs": 280,
          "textDelayMs": 100,
          "fadeOut": 100
        }
      },
      "line-rise": {
        "label": "줄마다 라이즈",
        "note": "줄 단위로 0.55em 아래에서 차례로 올라온다. 2줄 자막에서 특히 좋다.",
        "mode": "lines",
        "enter": {
          "dur": 0.3,
          "ease": "outSoft",
          "from": {
            "opacity": 0,
            "dy": 0.55
          }
        },
        "hold": {},
        "exit": {
          "dur": 0.18,
          "ease": "in",
          "to": {
            "opacity": 0,
            "dy": -0.18
          }
        },
        "per": "line",
        "stagger": 0.06,
        "style": {
          "highlight": "none"
        },
        "ass": {
          "mode": "lines",
          "lineDelayMs": 60,
          "fadeIn": 120,
          "fadeOut": 100
        }
      },
      "pop-bounce": {
        "label": "팝·바운스",
        "note": "낱말마다 0.55배에서 튕겨 오른다(1.22배 오버슈트). 숏폼 기본값.",
        "mode": "word",
        "enter": {
          "dur": 0.34,
          "ease": "backOut",
          "from": {
            "opacity": 0,
            "scale": 0.55,
            "dy": 0.18,
            "rot": -4
          }
        },
        "hold": {
          "breathe": 0.012,
          "breatheDur": 2.2
        },
        "exit": {
          "dur": 0.2,
          "ease": "in",
          "to": {
            "opacity": 0,
            "scale": 0.9
          }
        },
        "per": "word",
        "stagger": 0.085,
        "style": {
          "highlight": "none"
        },
        "ass": {
          "mode": "word",
          "fadeIn": 0,
          "fadeOut": 90
        }
      },
      "shift-key": {
        "label": "시프트 키",
        "note": "낱말이 오른쪽에서 기울어져 밀려 들어온다. 리듬이 빠른 편집에.",
        "mode": "word",
        "enter": {
          "dur": 0.26,
          "ease": "expoOut",
          "from": {
            "opacity": 0,
            "dx": 0.6,
            "rot": 6,
            "scale": 1.04
          }
        },
        "hold": {},
        "exit": {
          "dur": 0.16,
          "ease": "in",
          "to": {
            "opacity": 0,
            "dx": -0.25
          }
        },
        "per": "word",
        "stagger": 0.05,
        "style": {
          "highlight": "none"
        },
        "ass": {
          "mode": "word",
          "fadeIn": 0,
          "fadeOut": 80
        }
      },
      "word-highlight": {
        "label": "낱말 강조",
        "note": "지금 말하는 낱말만 강조색 + 1.10배. 발화 타이밍(words)이 있으면 그대로 따른다.",
        "mode": "karaoke",
        "enter": {
          "dur": 0.12,
          "ease": "outSoft",
          "from": {
            "opacity": 0,
            "dy": 0.06
          }
        },
        "hold": {},
        "exit": {
          "dur": 0.16,
          "ease": "in",
          "to": {
            "opacity": 0
          }
        },
        "per": "word",
        "stagger": 0,
        "style": {
          "highlight": "scale",
          "highlightScale": 1.1,
          "unsungOpacity": 1.0
        },
        "ass": {
          "mode": "karaoke",
          "fadeIn": 80,
          "fadeOut": 60
        }
      },
      "karaoke-fill": {
        "label": "색 채우기",
        "note": "가사처럼 지나간 낱말이 강조색으로 채워지고, 아직 말하지 않은 낱말은 흐리다.",
        "mode": "karaoke",
        "enter": {
          "dur": 0.12,
          "ease": "outSoft",
          "from": {
            "opacity": 0,
            "dy": 0.04
          }
        },
        "hold": {},
        "exit": {
          "dur": 0.14,
          "ease": "in",
          "to": {
            "opacity": 0
          }
        },
        "per": "word",
        "stagger": 0,
        "style": {
          "highlight": "fill",
          "highlightScale": 1.0,
          "unsungOpacity": 0.42
        },
        "ass": {
          "mode": "karaoke",
          "fadeIn": 80,
          "fadeOut": 60
        }
      },
      "typewriter": {
        "label": "타자기",
        "note": "한국어 기준 초당 14자로 찍히고, 끝나면 얇은 커서가 깜빡인다.",
        "mode": "typewriter",
        "enter": {
          "dur": 0.06,
          "ease": "linear",
          "from": {
            "opacity": 0
          }
        },
        "hold": {
          "cps": 14,
          "cursor": "bar",
          "cursorBlink": 2.2
        },
        "exit": {
          "dur": 0.12,
          "ease": "in",
          "to": {
            "opacity": 0
          }
        },
        "per": "char",
        "stagger": 0,
        "style": {
          "highlight": "none"
        },
        "ass": {
          "mode": "typewriter",
          "stepMs": 70,
          "cursor": "|",
          "fadeOut": 100
        }
      },
      "count": {
        "label": "숫자 카운트",
        "note": "문장 안의 숫자를 0에서 목표값까지 0.8초에 올린다(%, 만, 원 등 단위 유지).",
        "mode": "count",
        "enter": {
          "dur": 0.2,
          "ease": "outSoft",
          "from": {
            "opacity": 0,
            "dy": 0.12,
            "scale": 0.94
          }
        },
        "hold": {
          "countDur": 0.8,
          "countEase": "outSoft"
        },
        "exit": {
          "dur": 0.16,
          "ease": "in",
          "to": {
            "opacity": 0
          }
        },
        "per": "page",
        "stagger": 0,
        "style": {
          "highlight": "none"
        },
        "ass": {
          "mode": "count",
          "stepMs": 60,
          "fadeIn": 120,
          "fadeOut": 90
        }
      },
      "shake": {
        "label": "셰이크",
        "note": "등장할 때 0.35초 흔들리고 정착. 충격·반전 순간에 한 번만.",
        "mode": "shake",
        "enter": {
          "dur": 0.1,
          "ease": "outSoft",
          "from": {
            "opacity": 0,
            "scale": 1.06
          }
        },
        "hold": {
          "shakeAmp": 0.055,
          "shakeHz": 26,
          "shakeDecay": 0.35
        },
        "exit": {
          "dur": 0.14,
          "ease": "in",
          "to": {
            "opacity": 0
          }
        },
        "per": "page",
        "stagger": 0,
        "style": {
          "highlight": "none"
        },
        "ass": {
          "mode": "shake",
          "ampEm": 0.055,
          "hz": 26,
          "decay": 0.35,
          "fadeOut": 80
        }
      },
      "glitch": {
        "label": "글리치",
        "note": "RGB 3중 겹침 + 2프레임 단위 지터. 0.45초 버스트 뒤 정착.",
        "mode": "glitch",
        "enter": {
          "dur": 0.05,
          "ease": "linear",
          "from": {
            "opacity": 0
          }
        },
        "hold": {
          "glitchDur": 0.45,
          "splitEm": 0.12,
          "jitterEm": 0.05,
          "holdBurst": 0.6,
          "burstDur": 0.22,
          "stepFrames": 2
        },
        "exit": {
          "dur": 0.14,
          "ease": "in",
          "to": {
            "opacity": 0
          }
        },
        "per": "page",
        "stagger": 0,
        "style": {
          "highlight": "none",
          "glitchColors": [
            "#FF2D55",
            "#00E5A0",
            "#4D7CFF"
          ]
        },
        "ass": {
          "mode": "glitch",
          "splitEm": 0.12,
          "jitterEm": 0.05,
          "stepFrames": 2,
          "fadeOut": 80
        }
      },
      "char-jelly": {
        "label": "젤리 글자",
        "note": "글자마다 눌렸다 늘어나는 스프링. 짧은 감탄·강조에.",
        "mode": "char",
        "enter": {
          "dur": 0.4,
          "ease": "backOut",
          "from": {
            "opacity": 0,
            "scale": 0.6,
            "squash": 0.35
          }
        },
        "hold": {
          "breathe": 0.014,
          "breatheDur": 2.0
        },
        "exit": {
          "dur": 0.18,
          "ease": "in",
          "to": {
            "opacity": 0
          }
        },
        "per": "char",
        "stagger": 0.03,
        "style": {
          "highlight": "none"
        },
        "ass": {
          "mode": "word",
          "fadeIn": 0,
          "fadeOut": 90
        }
      }
    },
    "ass_style": {
      "font": "Noto Sans CJK KR",
      "fontFallback": [
        "Noto Sans CJK KR",
        "Noto Sans KR",
        "Malgun Gothic",
        "Apple SD Gothic Neo"
      ],
      "sizeEm": 1.0,
      "bold": true,
      "syntheticBold": true,
      "maxCharsPerLine": 11,
      "maxLines": 2,
      "marginLr": 140,
      "captionBottomY": 1240,
      "lineGapEm": 1.26,
      "libassScale": 1.0
    }
  };
  // @presets:end

  /* ==================================================================
   * 1. 순수 수학 — 렌더러와 무관하게 어디서나 같은 값을 낸다
   * ================================================================== */

  function clamp(v, a, b) {
    if (a === undefined) a = 0;
    if (b === undefined) b = 1;
    return v < a ? a : v > b ? b : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** CSS cubic-bezier(x1,y1,x2,y2) → t(0..1) → 진행도. y는 1을 넘을 수 있다(오버슈트). */
  function cubicBezier(x1, y1, x2, y2) {
    if (x1 === y1 && x2 === y2) return function (t) { return t; };
    var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    var cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    function sx(t) { return ((ax * t + bx) * t + cx) * t; }
    function sy(t) { return ((ay * t + by) * t + cy) * t; }
    function dx(t) { return (3 * ax * t + 2 * bx) * t + cx; }
    function solve(x) {
      var t = x;
      for (var i = 0; i < 6; i++) {
        var d = dx(t);
        if (Math.abs(d) < 1e-6) break;
        var e = sx(t) - x;
        if (Math.abs(e) < 1e-6) break;
        t -= e / d;
      }
      if (t < 0 || t > 1) { // 뉴턴 실패 → 이분법
        var lo = 0, hi = 1;
        t = x;
        for (var j = 0; j < 24; j++) {
          var m = (lo + hi) / 2;
          if (sx(m) < x) lo = m; else hi = m;
          t = m;
        }
      }
      return sy(t);
    }
    return function (t) {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      return solve(t);
    };
  }

  /**
   * 이징 어휘. 곡선 값은 Opus Motion Library의 ease.ts(샘플 영상에서 역산한 값)와
   * insta-reel-editor-skill의 timing-easing.md(GSAP/CSS 대응표)를 같은 표로 합친 것이다.
   */
  var ease = {
    linear: function (t) { return t; },
    out: cubicBezier(0.16, 1, 0.30, 1),      // expo.out — 기본 등장
    outSoft: cubicBezier(0.33, 1, 0.68, 1),  // power2.out — 부드러운 등장
    outQuart: cubicBezier(0.25, 1, 0.50, 1), // power3.out
    inOut: cubicBezier(0.65, 0, 0.35, 1),    // power2.inOut — 카메라/이동
    in: cubicBezier(0.32, 0, 0.67, 0),       // power2.in — 퇴장
    backOut: cubicBezier(0.34, 1.56, 0.64, 1), // 오버슈트 팝
    expoOut: cubicBezier(0.19, 1, 0.22, 1),
    expoInOut: cubicBezier(0.87, 0, 0.13, 1),
    sine: cubicBezier(0.37, 0, 0.63, 1),
    material: cubicBezier(0.2, 0, 0, 1)
  };

  function easeFn(name) {
    if (typeof name === 'function') return name;
    return ease[name] || ease.out;
  }

  /** t가 [t0,t1] 구간에서 0..1로 진행한 값(이징 적용, 구간 밖은 고정) */
  function prog(t, t0, t1, e) {
    if (t1 <= t0) return t >= t0 ? 1 : 0;
    return easeFn(e)(clamp((t - t0) / (t1 - t0), 0, 1));
  }

  /**
   * 감쇠 스프링 응답(0 → 1). Remotion/Framer의 damping·stiffness·mass 의미를 따른다.
   * 초기 속도 0, 목표 1로 두고 해석해를 그대로 쓴다(프레임 레이트와 무관).
   */
  var SPRINGS = {
    pop: { damping: 11, stiffness: 160, mass: 0.7 },
    soft: { damping: 20, stiffness: 90, mass: 1 },
    snappy: { damping: 18, stiffness: 260, mass: 0.6 },
    wobble: { damping: 7, stiffness: 120, mass: 0.8 },
    settle: { damping: 24, stiffness: 320, mass: 0.8 }
  };

  function spring(t, cfg) {
    if (t <= 0) return 0;
    cfg = typeof cfg === 'string' ? (SPRINGS[cfg] || SPRINGS.pop) : (cfg || SPRINGS.pop);
    var m = cfg.mass || 1, k = cfg.stiffness || 160, c = cfg.damping || 12;
    var w0 = Math.sqrt(k / m);
    var zeta = c / (2 * Math.sqrt(k * m));
    if (zeta >= 1) { // 과감쇠: 단조 증가
      var r = Math.sqrt(zeta * zeta - 1) * w0;
      var a = -zeta * w0;
      return 1 - Math.exp(a * t) * (Math.cosh(r * t) + (Math.abs(a) / r) * Math.sinh(r * t));
    }
    var wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }

  /** 프레임 번호 기준 스프링(Remotion의 spring({frame,fps})과 같은 의미) */
  function springAt(frame, fps, startFrame, cfg) {
    return spring(Math.max(0, frame - startFrame) / (fps || 30), cfg);
  }

  /** i번째 요소의 지연(초). stagger가 'auto'면 남는 시간에 맞춰 나눈다. */
  function staggerDelay(i, spec, n, totalWindow) {
    if (!n || n < 2) return 0;
    if (spec === 'auto') return totalWindow ? (totalWindow * 0.55 * i) / n : 0;
    return (spec || 0) * i;
  }

  /** 0..1 결정적 해시(글리치·셰이크 지터용, Math.random 금지) */
  function hash01(a, b, seed) {
    var x = (Math.imul((a | 0) + 1, 374761393) ^ Math.imul((b | 0) + 7, 668265263) ^ Math.imul((seed | 0) + 13, 2147483647)) >>> 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0;
    x = (x ^ (x >>> 16)) >>> 0;
    return x / 4294967296;
  }

  /** -1..1 결정적 난수 */
  function hashSigned(a, b, seed) { return hash01(a, b, seed) * 2 - 1; }

  /* ==================================================================
   * 2. 디자인 토큰
   * ================================================================== */

  var THEMES = PRESET_DOC.themes || {};
  var PRESETS = PRESET_DOC.presets || {};
  var SAFE = (PRESET_DOC.canvas && PRESET_DOC.canvas.safe) || {};

  function theme(nameOrObj) {
    if (!nameOrObj) return THEMES['reels-dark'] || {};
    if (typeof nameOrObj === 'string') return THEMES[nameOrObj] || THEMES['reels-dark'] || {};
    return nameOrObj;
  }

  function preset(nameOrObj) {
    if (!nameOrObj) return PRESETS['outline-basic'] || {};
    if (typeof nameOrObj === 'string') return PRESETS[nameOrObj] || PRESETS['outline-basic'] || {};
    return nameOrObj;
  }

  /** 해상도 독립 단위: 1080 프레임에서 1u = 1px (Opus의 useStage와 같은 규칙) */
  function unit(W, H) { return Math.min(W, H) / 1080; }

  /** 캡션 밴드 기본값: 아래끝 y=1240, 좌우 140 (인스타 릴스 안전영역) */
  function defaultLayout(W, H) {
    var u = unit(W, H);
    var band = SAFE.caption_band || { x0: 140, y0: 990, x1: 940, y1: 1240 };
    var k = H / 1920;
    return {
      maxW: (band.x1 - band.x0) * (W / 1080),
      bottomY: band.y1 * k,
      topY: band.y0 * k,
      maxLines: 2,
      anchor: 'bottom',
      u: u
    };
  }

  /* ==================================================================
   * 3. 레이아웃 — 한국어 줄바꿈과 크기 맞춤
   * ================================================================== */

  // 줄 머리에 올 수 없는 문자(앞 줄 끝에 붙어야 한다)
  var NO_LINE_START = /^[)\]}〉》」』】〕”’"'.,!?;:·…%]$/;
  // 줄 끝에 올 수 없는 문자(다음 줄로 넘어가야 한다)
  var NO_LINE_END = /[([{〈《「『【〔“‘"']$/;
  // 숫자 + 단위는 한 덩어리로 묶는다 ("120만", "3.5%", "12초")
  var UNIT_AFTER_NUMBER = /^(\d[\d,.]*)\s*(%|원|만|억|천|개|명|분|초|시간|일|주|개월|년|월|위|등|점|배|번|km|kg|g|ml|l|cm|mm|℃|도)$/i;

  /**
   * 측정 함수 기반 토큰화. 공백 단위로 나누되,
   *  - "숫자 단위"는 붙여서 한 토큰으로,
   *  - 닫는 문장부호는 앞 토큰에 붙인다.
   */
  function tokenize(text) {
    var raw = String(text == null ? '' : text).split(/\s+/).filter(Boolean);
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var w = raw[i];
      var m = w.match(UNIT_AFTER_NUMBER);
      if (m) w = m[1] + m[2]; // "120 만" → "120만": 숫자와 단위는 한 덩어리로 묶는다
      if (out.length && NO_LINE_START.test(w)) out[out.length - 1] += w;
      else out.push(w);
    }
    return out;
  }

  /** 토큰 하나가 줄 끝에 남으면 안 되는지(다음 토큰과 붙여야 하는지) */
  function keepWithNext(tok) {
    return NO_LINE_END.test(tok) || /^[-–—]$/.test(tok);
  }

  /**
   * 한국어 자막 줄바꿈.
   * measure(tok, size) → px. maxW를 넘지 않게 줄을 채우고, 마지막 줄이 한 토큰만
   * 남는 "고아 줄"이면 앞 줄에서 한 토큰을 끌어내려 균형을 맞춘다.
   */
  function wrapTokens(tokens, measure, size, maxW) {
    var space = measure(' ', size);
    var lines = [], cur = [], curW = 0;
    function push() { if (cur.length) { lines.push(cur); cur = []; curW = 0; } }
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      var w = measure(tok, size);
      var add = (cur.length ? space : 0) + w;
      if (cur.length && curW + add > maxW) {
        // 이전 토큰이 다음 토큰과 붙어야 하면 함께 내린다
        var carry = [];
        while (cur.length > 1 && keepWithNext(cur[cur.length - 1])) carry.unshift(cur.pop());
        push();
        cur = carry.slice();
        curW = cur.reduce(function (a, t, k) { return a + measure(t, size) + (k ? space : 0); }, 0);
        // 한 토큰이 maxW보다 길면 글자 단위로 쪼갠다
        if (!cur.length && w > maxW) {
          var chars = Array.from(tok);
          var line = '';
          for (var c = 0; c < chars.length; c++) {
            var test = line + chars[c];
            if (line && measure(test, size) > maxW) { lines.push([line]); line = chars[c]; }
            else line = test;
          }
          if (line) { cur = [line]; curW = measure(line, size); }
          continue;
        }
        curW += (cur.length ? space : 0) + w;
        cur.push(tok);
      } else {
        curW += add;
        cur.push(tok);
      }
    }
    push();
    return lines;
  }

  /** 2줄일 때 줄 길이를 고르게(문장부호 뒤 분할을 우선) */
  function balanceLines(lines, measure, size) {
    if (lines.length !== 2) return lines;
    var a = lines[0].join(' '), b = lines[1].join(' ');
    var wa = measure(a, size), wb = measure(b, size);
    var best = [lines[0].slice(), lines[1].slice()];
    var bestDiff = Math.abs(wa - wb);
    var flat = lines[0].concat(lines[1]);
    for (var k = 1; k < flat.length; k++) {
      var l1 = flat.slice(0, k).join(' '), l2 = flat.slice(k).join(' ');
      if (!l1 || !l2) continue;
      var d = Math.abs(measure(l1, size) - measure(l2, size));
      var bonus = /[,;:！?]$/.test(flat[k - 1]) ? 0.18 * size : 0;
      if (d - bonus < bestDiff - 0.001) {
        bestDiff = d - bonus;
        best = [flat.slice(0, k), flat.slice(k)];
      }
    }
    return best;
  }

  /**
   * 한 큐를 배치한다.
   * 반환: {size, lines:[{text, tokens, width}], blockW, blockH, lineGap, charIndex}
   */
  function layoutCaption(text, opts) {
    opts = opts || {};
    var measure = opts.measure;
    var maxW = opts.maxW || 800;
    var maxLines = opts.maxLines || 2;
    var baseSize = opts.size || 62;
    var lineHeight = opts.lineHeight || 1.26;
    var minSize = opts.minSize || 24;
    var size = baseSize;
    var lines = null;
    for (var i = 0; i < 40; i++) {
      var toks = tokenize(text);
      lines = wrapTokens(toks, measure, size, maxW);
      if (lines.length <= maxLines) break;
      if (size <= minSize) break;
      size = Math.max(minSize, size * 0.94);
    }
    if (lines.length === 2) lines = balanceLines(lines, measure, size);
    var rows = lines.map(function (tokens) {
      var t = tokens.join(' ');
      return { text: t, tokens: tokens, width: measure(t, size) };
    });
    var blockW = rows.reduce(function (a, r) { return Math.max(a, r.width); }, 0);
    var gap = size * lineHeight;
    var blockH = rows.length ? gap * (rows.length - 1) + size : size;
    return { size: size, lines: rows, blockW: blockW, blockH: blockH, lineGap: gap, lineHeight: lineHeight };
  }

  /** 토큰 폭을 실제로 재는 측정기(Canvas 없이도 쓸 수 있게 추정 폭 표를 함께 제공) */
  function makeMeasure(ctx, font) {
    var cache = {};
    return function (text, size) {
      var key = size + '|' + text;
      if (cache[key] != null) return cache[key];
      var w;
      if (ctx) {
        ctx.font = '700 ' + Math.round(size) + 'px ' + (font || 'sans-serif');
        w = ctx.measureText(text).width;
      } else {
        w = estimateWidth(text, size);
      }
      cache[key] = w;
      return w;
    };
  }

  /**
   * Canvas 없이 쓰는 근사 폭. 한글 음절·자모는 전각(1.0em),
   * 라틴 문자는 자주 쓰는 폭 표를 쓴다(줄바꿈 계획·CLI 검증용).
   */
  var LATIN_W = {
    ' ': 0.26, 'i': 0.24, 'l': 0.24, 'j': 0.24, 't': 0.32, 'f': 0.32, 'r': 0.36, 'I': 0.27,
    'm': 0.82, 'w': 0.74, 'M': 0.84, 'W': 0.92, 'J': 0.44
  };
  function estimateWidth(text, size) {
    var total = 0;
    Array.from(String(text)).forEach(function (ch) {
      var cp = ch.codePointAt(0);
      if (cp >= 0x1100 && cp <= 0x11FF) total += 1.0;          // 한글 자모
      else if (cp >= 0x3130 && cp <= 0x318F) total += 1.0;      // 호환 자모
      else if (cp >= 0xAC00 && cp <= 0xD7A3) total += 1.0;      // 한글 음절
      else if (cp >= 0x4E00 && cp <= 0x9FFF) total += 1.0;      // 한자
      else if (cp >= 0x3000 && cp <= 0x30FF) total += 1.0;      // CJK 문장부호·가나
      else if (cp < 128) total += (LATIN_W[ch] != null ? LATIN_W[ch] : (ch === ch.toUpperCase() ? 0.62 : 0.52));
      else total += 0.58;                                        // 그리스/기타
    });
    return total * size;
  }

  /* ==================================================================
   * 4. 타임라인 — 큐와 낱말 시각
   * ================================================================== */

  function normalizeCue(c, i) {
    var start = Math.max(0, Number(c.start || 0));
    var end = Math.max(start + 0.05, Number(c.end || start + 2));
    return {
      id: c.id != null ? c.id : 'c' + i,
      start: start,
      end: end,
      text: String(c.text == null ? '' : c.text),
      words: Array.isArray(c.words) ? c.words : null,
      highlight: c.highlight || null,
      preset: c.preset || null,
      theme: c.theme || null
    };
  }

  /** 낱말별 표시 구간. words가 없으면 큐 길이를 고르게 나눈다. */
  function wordWindows(cue) {
    var toks = String(cue.text || '').split(/\s+/).filter(Boolean);
    if (!toks.length) return [];
    if (cue.words && cue.words.length) {
      return cue.words.map(function (w, i) {
        var s = Number(w.s != null ? w.s : (w.start != null ? w.start : cue.start));
        var e = Number(w.e != null ? w.e : (w.end != null ? w.end : s + 0.2));
        return { text: String(w.w != null ? w.w : (w.text || toks[i] || '')), start: s, end: Math.max(s + 0.02, e) };
      });
    }
    var span = (cue.end - cue.start) * 0.82;
    var per = span / toks.length;
    return toks.map(function (t, i) {
      return { text: t, start: cue.start + per * i, end: cue.start + per * (i + 1) };
    });
  }

  /** 큐 목록을 겹치지 않게 정리하고 낱말 시각을 붙인다 */
  function buildTimeline(cues, opts) {
    opts = opts || {};
    var list = (cues || []).map(normalizeCue).sort(function (a, b) { return a.start - b.start; });
    var minDur = opts.minDuration || 0.4;
    for (var i = 0; i < list.length; i++) {
      if (list[i].end - list[i].start < minDur) list[i].end = list[i].start + minDur;
      if (i + 1 < list.length && list[i].end > list[i + 1].start) list[i].end = list[i + 1].start;
      list[i].words = wordWindows(list[i]);
    }
    return list;
  }

  function cueAt(timeline, t) {
    for (var i = 0; i < timeline.length; i++) {
      if (t >= timeline[i].start && t < timeline[i].end) return timeline[i];
    }
    return null;
  }

  /* ==================================================================
   * 5. Canvas 2D 렌더러
   * ================================================================== */

  var FONT_FALLBACK = '"Noto Sans CJK KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

  function setFont(ctx, size, themeObj) {
    var t = themeObj || {};
    ctx.font = (t.weight || 700) + ' ' + Math.round(size) + 'px ' + (t.font || FONT_FALLBACK);
    if (typeof ctx.letterSpacing === 'string') {
      ctx.letterSpacing = ((t.letterSpacing || 0) * size).toFixed(2) + 'px';
    }
  }

  function clearLetterSpacing(ctx) {
    if (typeof ctx.letterSpacing === 'string') ctx.letterSpacing = '0px';
  }

  /** 외곽선 + 그림자 + 채우기. 한글은 외곽선이 있어야 어떤 영상 위에서도 읽힌다. */
  function paintText(ctx, text, x, y, size, themeObj, opt) {
    opt = opt || {};
    var t = themeObj || {};
    var col = t.colors || {};
    setFont(ctx, size, t);
    var outline = (t.outlineEm || 0) * size * (opt.outlineScale == null ? 1 : opt.outlineScale);
    var halo = (t.haloEm || 0) * size;
    ctx.textAlign = opt.align || 'center';
    ctx.textBaseline = opt.baseline || 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    var prevAlpha = ctx.globalAlpha;
    if (opt.alpha != null) ctx.globalAlpha = prevAlpha * opt.alpha;
    if (opt.fill) ctx.fillStyle = opt.fill;
    else ctx.fillStyle = col.text || '#FFFFFF';

    // 바깥 → 안쪽 순서로 그린다: 외곽선(가장 두껍게) → 헤일로(중간) → 글자 채우기
    if (outline > 0) {
      ctx.save();
      ctx.strokeStyle = opt.outline || col.outline || '#000';
      ctx.lineWidth = outline * 2;
      if (opt.shadow !== false && t.shadowEm) {
        ctx.shadowColor = col.shadow || 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = t.shadowEm * size * 2;
        ctx.shadowOffsetY = (opt.shadowY == null ? 0.12 : opt.shadowY) * size * 0.12;
      }
      ctx.strokeText(text, x, y);
      ctx.restore();
    }
    if (halo > 0 && col.halo) {
      ctx.save();
      ctx.strokeStyle = col.halo;
      ctx.lineWidth = halo * 2;
      ctx.strokeText(text, x, y);
      ctx.restore();
    }
    if (outline <= 0 && opt.shadow !== false && t.shadowEm) {
      ctx.save();
      ctx.shadowColor = col.shadow || 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = t.shadowEm * size * 2;
      ctx.shadowOffsetY = 0.02 * size;
      ctx.fillText(text, x, y);
      ctx.restore();
    }
    ctx.fillStyle = opt.fill || col.text || '#FFFFFF';
    ctx.fillText(text, x, y);
    ctx.globalAlpha = prevAlpha;
    clearLetterSpacing(ctx);
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /** 큐의 낱말 배치: 각 낱말의 시작 x(중앙 정렬)와 폭 */
  function wordPlacements(ctx, cue, lay, size, themeObj) {
    var all = [];
    var space = 0;
    setFont(ctx, size, themeObj);
    if (typeof ctx.letterSpacing === 'string') ctx.letterSpacing = ((themeObj.letterSpacing || 0) * size).toFixed(2) + 'px';
    space = ctx.measureText(' ').width;
    clearLetterSpacing(ctx);
    var widx = 0;
    lay.lines.forEach(function (row, li) {
      var total = row.width;
      var x = lay.centerX == null ? -total / 2 : lay.centerX - total / 2;
      var words = row.text.split(' ');
      words.forEach(function (w, wi) {
        setFont(ctx, size, themeObj);
        if (typeof ctx.letterSpacing === 'string') ctx.letterSpacing = ((themeObj.letterSpacing || 0) * size).toFixed(2) + 'px';
        var ww = ctx.measureText(w).width;
        clearLetterSpacing(ctx);
        all.push({ text: w, index: widx++, line: li, x: x + ww / 2, y: 0, w: ww });
        x += ww + space;
      });
    });
    return all;
  }

  function numberTokens(text) {
    var out = [];
    var re = /\d[\d,.]*/g, m;
    while ((m = re.exec(text))) {
      var raw = m[0];
      var val = Number(raw.replace(/,/g, ''));
      if (isFinite(val)) out.push({ raw: raw, value: val, index: m.index, comma: raw.indexOf(',') >= 0 });
    }
    return out;
  }

  function formatCount(v, comma) {
    var n = Math.round(v);
    var s = String(Math.abs(n));
    if (comma || Math.abs(n) >= 10000) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n < 0 ? '-' : '') + s;
  }

  function countText(text, p, fmt) {
    var toks = numberTokens(text);
    if (!toks.length) return text;
    var out = '', last = 0;
    toks.forEach(function (t) {
      out += text.slice(last, t.index) + (fmt === 'pct' ? formatCount(t.value * p, t.comma) : formatCount(t.value * p, t.comma));
      last = t.index + t.raw.length;
    });
    return out + text.slice(last);
  }

  /** 현재 발화 중인 낱말 인덱스(없으면 -1) */
  function activeWord(cue, t) {
    var ws = cue.words || [];
    var idx = -1;
    for (var i = 0; i < ws.length; i++) if (t >= ws[i].start) idx = i;
    return idx;
  }

  /**
   * 한 큐를 그린다. 좌표계는 "블록 중앙 = (0,0)"으로 옮긴 뒤 그린다.
   * env: {W,H,theme,preset,layout,debug}
   */
  function drawCue(ctx, cue, t, env) {
    var P = preset(cue.preset || env.preset);
    var T = theme(cue.theme || env.theme);
    if (!P || P.mode === 'none') return null;
    var W = env.W, H = env.H, u = env.u || unit(W, H);
    var L = env.layout || defaultLayout(W, H);
    var dur = Math.max(0.08, cue.end - cue.start);
    var local = t - cue.start;
    if (local < 0 || t >= cue.end + 0.5) return null;

    var inD = Math.min(P.enter && P.enter.dur ? P.enter.dur : 0.15, dur * 0.6);
    var outD = Math.min(P.exit && P.exit.dur ? P.exit.dur : 0.15, dur * 0.5);
    var pe = prog(t, cue.start, cue.start + inD, (P.enter && P.enter.ease) || 'out');
    var px = prog(t, cue.end - outD, cue.end, (P.exit && P.exit.ease) || 'in');
    var from = (P.enter && P.enter.from) || {};
    var to = (P.exit && P.exit.to) || {};

    var size = (L.size || (T.sizeRatio || 0.0575) * W) * (L.sizeScale || 1);
    var measure = env.measure || makeMeasure(ctx, T.font);
    var lay = layoutCaption(cue.text, {
      measure: measure, maxW: L.maxW, maxLines: L.maxLines || 2,
      size: size, lineHeight: T.lineHeight || 1.26
    });
    size = lay.size;

    var bandH = lay.blockH;
    var baseY = L.anchor === 'top' ? L.topY + bandH / 2
      : L.anchor === 'center' ? (L.topY + L.bottomY) / 2
        : L.bottomY - bandH / 2;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    var mode = P.mode;
    var alpha = (from.opacity != null ? lerp(from.opacity, 1, pe) : 1) * (to.opacity != null ? lerp(1, to.opacity, px) : 1);
    if (alpha <= 0.002) { ctx.restore(); return null; }

    var hold = P.hold || {};
    var breathe = hold.breathe ? 1 + hold.breathe * Math.sin((t / (hold.breatheDur || 2)) * Math.PI * 2) : 1;

    // ---------- 모드별 변환/그리기 ----------
    if (mode === 'line' || mode === 'chip') {
      var dy = lerp(from.dy || 0, 0, pe) + lerp(0, to.dy || 0, px);
      var dx = lerp(from.dx || 0, 0, pe) + lerp(0, to.dx || 0, px);
      var sc = lerp(from.scale || 1, 1, pe) * lerp(1, to.scale || 1, px) * breathe;
      var rot = lerp(from.rot || 0, 0, pe) * (1 - px);

      if (mode === 'chip') drawChip(ctx, cue, lay, size, T, W, baseY, alpha, pe, px, P, u);

      // 칩 모드: 칩이 먼저 깔리고 글자는 textDelay 뒤에 떠오른다
      var textAlpha = 1;
      if (mode === 'chip') {
        var td0 = from.textDelay || 0;
        var tdD = from.textDur || 0.12;
        textAlpha = prog(t, cue.start + td0, cue.start + td0 + tdD, 'out');
      }

      ctx.globalAlpha = alpha * textAlpha;
      ctx.translate(W / 2 + dx * size, baseY + dy * size);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.scale(sc, sc);
      var fillCol = T.colors && T.colors.text;
      lay.lines.forEach(function (row, i) {
        var y = -lay.blockH / 2 + size / 2 + i * lay.lineGap;
        if (mode === 'chip') paintText(ctx, row.text, (P.style && P.style.accentBar ? size * 0.10 : 0), y, size, T, { alpha: 1, fill: fillCol });
        else paintText(ctx, row.text, 0, y, size, T, { alpha: 1, fill: fillCol });
      });
      ctx.globalAlpha = 1;
    } else if (mode === 'lines') {
      var stg = typeof P.stagger === 'number' ? P.stagger : 0.06;
      ctx.globalAlpha = 1;
      lay.lines.forEach(function (row, i) {
        var lpe = prog(t, cue.start + i * stg, cue.start + i * stg + inD, (P.enter && P.enter.ease) || 'outSoft');
        var lpx = prog(t, cue.end - outD, cue.end, (P.exit && P.exit.ease) || 'in');
        var a = (from.opacity != null ? lerp(from.opacity, 1, lpe) : 1) * (to.opacity != null ? lerp(1, to.opacity, lpx) : 1);
        if (a <= 0.002) return;
        var ldy = lerp(from.dy || 0, 0, lpe) + lerp(0, to.dy || 0, lpx);
        var lsc = lerp(from.scale || 1, 1, lpe);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(W / 2, baseY - lay.blockH / 2 + size / 2 + i * lay.lineGap + ldy * size);
        ctx.scale(lsc, lsc);
        paintText(ctx, row.text, 0, 0, size, T, { alpha: 1 });
        ctx.restore();
      });
    } else if (mode === 'word' || mode === 'char') {
      var places = wordPlacements(ctx, cue, { lines: lay.lines, centerX: 0 }, size, T);
      var stgW = typeof P.stagger === 'number' ? P.stagger : 0.08;
      var perUnit = mode === 'char';
      ctx.globalAlpha = 1;
      var charOffset = 0;
      places.forEach(function (pl, i) {
        var delay = perUnit ? 0 : i * stgW;
        var wpe = perUnit ? pe : prog(t, cue.start + delay, cue.start + delay + inD, (P.enter && P.enter.ease) || 'out');
        var wpx = perUnit ? px : prog(t, cue.end - outD, cue.end, (P.exit && P.exit.ease) || 'in');
        var a = (from.opacity != null ? lerp(from.opacity, 1, wpe) : 1) * (to.opacity != null ? lerp(1, to.opacity, wpx) : 1);
        if (a <= 0.002) return;
        var wdy = lerp(from.dy || 0, 0, wpe) + lerp(0, to.dy || 0, wpx);
        var wdx = lerp(from.dx || 0, 0, wpe) + lerp(0, to.dx || 0, wpx);
        var wsc = lerp(from.scale || 1, 1, wpe) * lerp(1, to.scale || 1, wpx);
        var wrot = lerp(from.rot || 0, 0, wpe) * (1 - wpx);
        if (!perUnit) {
          ctx.save();
          ctx.globalAlpha = a;
          ctx.translate(W / 2 + pl.x + wdx * size, baseY - lay.blockH / 2 + size / 2 + pl.line * lay.lineGap + wdy * size);
          ctx.rotate((wrot * Math.PI) / 180);
          ctx.scale(wsc, wsc);
          paintText(ctx, pl.text, 0, 0, size, T, { alpha: 1 });
          ctx.restore();
        } else {
          // 글자 단위: 낱말 안에서 글자마다 스태거 + 젤리 스쿼시
          var chars = Array.from(pl.text);
          var cw = pl.w / Math.max(1, chars.length);
          var x0 = pl.x - pl.w / 2 + cw / 2;
          chars.forEach(function (ch, ci) {
            var cdelay = (charOffset + ci) * (typeof P.stagger === 'number' ? P.stagger : 0.03);
            var cpe = prog(t, cue.start + cdelay, cue.start + cdelay + inD, (P.enter && P.enter.ease) || 'backOut');
            var ca = (from.opacity != null ? lerp(from.opacity, 1, cpe) : 1) * (1 - px);
            if (ca <= 0.002) return;
            var sp = spring(t - cue.start - cdelay, 'pop');
            var squash = (from.squash || 0) * (1 - sp);
            var csc = lerp(from.scale || 1, 1, cpe);
            ctx.save();
            ctx.globalAlpha = ca;
            ctx.translate(W / 2 + x0 + ci * cw, baseY - lay.blockH / 2 + size / 2 + pl.line * lay.lineGap);
            ctx.rotate((lerp(from.rot || 0, 0, cpe) * Math.PI) / 180);
            ctx.scale(csc * (1 + squash * 0.35), csc * (1 - squash * 0.45));
            paintText(ctx, ch, 0, 0, size, T, { alpha: 1 });
            ctx.restore();
          });
          charOffset += chars.length;
        }
      });
    } else if (mode === 'karaoke') {
      var places2 = wordPlacements(ctx, cue, { lines: lay.lines, centerX: 0 }, size, T);
      var act = activeWord(cue, t);
      var hl = (P.style && P.style.highlight) || 'scale';
      var unsung = (P.style && P.style.unsungOpacity != null ? P.style.unsungOpacity : 1);
      ctx.globalAlpha = alpha * breathe;
      ctx.translate(W / 2, baseY - lay.blockH / 2 + size / 2);
      places2.forEach(function (pl, i) {
        var isAct = i === act;
        var spoken = i <= act;
        var y = pl.line * lay.lineGap;
        var scl = isAct && hl === 'scale' ? (P.style.highlightScale || 1.1) : 1;
        var a2 = hl === 'fill' ? (spoken ? 1 : unsung) : 1;
        var fill = isAct && hl !== 'fill' ? (T.colors.accent) : (hl === 'fill' && spoken ? T.colors.accent : T.colors.text);
        if (isAct && hl === 'pill') {
          ctx.save();
          ctx.fillStyle = T.colors.accent;
          roundRect(ctx, pl.x - pl.w / 2 - size * 0.12, y - size * 0.62, pl.w + size * 0.24, size * 1.24, size * 0.18);
          ctx.fill();
          ctx.restore();
        }
        ctx.save();
        ctx.translate(pl.x, y);
        ctx.scale(scl, scl);
        paintText(ctx, pl.text, 0, 0, size, T, { alpha: a2, fill: fill });
        ctx.restore();
      });
    } else if (mode === 'typewriter') {
      var cps = (hold.cps || 14);
      var totalChars = lay.lines.reduce(function (a, r) { return a + Array.from(r.text).length; }, 0);
      var typed = clamp((local - 0.02) * cps, 0, totalChars + 1);
      var done = typed >= totalChars;
      var cursorOn = !done || Math.floor(t * (hold.cursorBlink || 2)) % 2 === 0;
      var cursor = hold.cursor || '▌';
      var left = typed;
      ctx.globalAlpha = alpha;
      ctx.translate(W / 2, baseY - lay.blockH / 2 + size / 2);
      lay.lines.forEach(function (row, i) {
        var chars = Array.from(row.text);
        var n = clamp(Math.floor(left), 0, chars.length);
        left -= chars.length;
        var shown = chars.slice(0, n).join('');
        var isLastTouched = n < chars.length || i === lay.lines.length - 1;
        var showCursor = isLastTouched && cursorOn;
        var bar = cursor === 'bar';
        var text = shown + (showCursor && !bar ? cursor : '');
        if (!text && !(showCursor && bar)) return;
        ctx.save();
        ctx.translate(0, i * lay.lineGap);
        ctx.textAlign = 'center';
        if (text) paintText(ctx, text, 0, 0, size, T, { alpha: 1 });
        if (showCursor && bar) {
          // 커서는 글리프 대신 얇은 사각형으로 그린다(폰트에 막대 글리프가 없어도 동일하게 보임)
          var w = shown ? measure(shown, size) : 0;
          var bx = (bar ? w / 2 : 0) + size * 0.08;
          ctx.save();
          ctx.fillStyle = (T.colors && T.colors.accent) || '#fff';
          ctx.fillRect(bx, -size * 0.46, Math.max(2, size * 0.075), size * 0.92);
          ctx.restore();
        }
        ctx.restore();
      });
    } else if (mode === 'count') {
      var cd = (hold.countDur || 0.8);
      var cp = prog(t, cue.start + 0.02, cue.start + 0.02 + cd, hold.countEase || 'outSoft');
      var shownText = countText(cue.text, cp);
      var dy2 = lerp(from.dy || 0, 0, pe) + lerp(0, to.dy || 0, px);
      var sc2 = lerp(from.scale || 1, 1, pe);
      var lay2 = shownText === cue.text ? lay : layoutCaption(shownText, {
        measure: measure, maxW: L.maxW, maxLines: L.maxLines || 2,
        size: size, lineHeight: T.lineHeight || 1.26
      });
      ctx.globalAlpha = alpha;
      ctx.translate(W / 2, baseY + dy2 * size);
      ctx.scale(sc2, sc2);
      lay2.lines.forEach(function (row, i) {
        paintText(ctx, row.text, 0, -lay2.blockH / 2 + lay2.size / 2 + i * lay2.lineGap, lay2.size, T, { alpha: 1 });
      });
    } else if (mode === 'shake') {
      var amp = (hold.shakeAmp || 0.05) * size;
      var decay = hold.shakeDecay || 0.35;
      var age = clamp(local / decay, 0, 1);
      var k = (1 - age) * (1 - age);
      var jx = hashSigned(Math.floor(t * 30), 1, 7) * amp * k;
      var jy = hashSigned(Math.floor(t * 30), 2, 7) * amp * k * 0.6;
      var jr = hashSigned(Math.floor(t * 30), 3, 7) * 1.2 * k;
      ctx.globalAlpha = alpha;
      ctx.translate(W / 2 + jx, baseY + jy);
      ctx.rotate((jr * Math.PI) / 180);
      lay.lines.forEach(function (row, i) {
        paintText(ctx, row.text, 0, -lay.blockH / 2 + size / 2 + i * lay.lineGap, size, T, { alpha: 1 });
      });
    } else if (mode === 'glitch') {
      var gdur = hold.glitchDur || 0.45;
      var burst2 = hold.holdBurst != null ? hold.holdBurst : 0.6;
      var burstDur = hold.burstDur || 0.18;
      var inBurst = local < gdur || (local > dur * burst2 && local < dur * burst2 + burstDur);
      var split = (hold.splitEm || 0.12) * size;
      var jit = (hold.jitterEm || 0.05) * size;
      var frame = Math.floor((t * 30) / (hold.stepFrames || 2));
      var cols = (P.style && P.style.glitchColors) || ['#FF2D55', '#00E5A0', '#4D7CFF'];
      ctx.globalAlpha = alpha;
      ctx.translate(W / 2, baseY);
      lay.lines.forEach(function (row, i) {
        var y = -lay.blockH / 2 + size / 2 + i * lay.lineGap;
        if (inBurst) {
          // 1) RGB 3중 겹침 — 스크린 합성으로 색이 겹쳐 보이게
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          for (var c = 0; c < cols.length; c++) {
            var ox = (c - 1) * split + hashSigned(frame, c + 1, 11) * jit;
            var oy = hashSigned(frame, c + 5, 11) * jit * 0.7;
            paintText(ctx, row.text, ox, y + oy, size, T, {
              alpha: 0.85, fill: cols[c], shadow: false, outline: 'transparent'
            });
          }
          ctx.restore();
          // 2) 가로 띠 잘라 옆으로 밀기(슬라이스 글리치)
          for (var b = 0; b < 3; b++) {
            var sy = y - size * 0.55 + hash01(frame, b, 17) * size * 1.1;
            var bh = size * (0.14 + 0.16 * hash01(frame, b + 3, 19));
            var dxs = hashSigned(frame, b + 7, 23) * size * 0.22;
            ctx.save();
            ctx.beginPath();
            ctx.rect(-W, sy, W * 2, bh);
            ctx.clip();
            paintText(ctx, row.text, dxs, y, size, T, {
              alpha: 0.65, fill: cols[b % cols.length], shadow: false, outline: 'transparent'
            });
            ctx.restore();
          }
        }
        var gx = inBurst ? hashSigned(frame, 9, 13) * jit * 0.6 : 0;
        var gy = inBurst ? hashSigned(frame, 10, 13) * jit * 0.4 : 0;
        paintText(ctx, row.text, gx, y + gy, size, T, { alpha: 1 });
      });
    }

    ctx.restore();
    ctx.globalAlpha = 1;
    return { size: size, blockH: lay.blockH, blockW: lay.blockW, lines: lay.lines.length, baseY: baseY };
  }

  /** 칩 배경: 왼쪽에서 오른쪽으로 쓸리는 사각형 + 강조 바 */
  function drawChip(ctx, cue, lay, size, T, W, baseY, alpha, pe, px, P, u) {
    var st = P.style || {};
    var padX = (st.chipPadEm || 0.62) * size;
    var padY = size * 0.46;
    var w = Math.min(W * 0.9, lay.blockW + padX * 2 + (st.accentBar ? size * 0.34 : 0));
    var h = lay.blockH + padY * 2;
    var x0 = W / 2 - w / 2, y0 = baseY - h / 2;
    var wipe = lerp((P.enter.from && P.enter.from.wipe != null ? P.enter.from.wipe : 0), 1, pe) * (1 - px);
    if (wipe <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = (T.colors && T.colors.chip) || 'rgba(9,12,18,0.8)';
    roundRect(ctx, x0, y0, w * wipe, h, (st.chipRadiusEm || 0.3) * size);
    ctx.fill();
    if (st.accentStyle !== 'none' && st.accentBar) {
      ctx.fillStyle = (T.colors && T.colors.chipAccentBar) || (T.colors && T.colors.accent) || '#fff';
      var barW = size * 0.13;
      ctx.globalAlpha = alpha * clamp((wipe - 0.55) / 0.45, 0, 1);
      roundRect(ctx, x0 + size * 0.24, y0 + h / 2 - size * 0.52, barW, size * 1.04, barW / 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** 아래쪽 가독성 스크림(그라데이션) */
  function drawScrim(ctx, W, H, opts) {
    opts = opts || {};
    var h = H * (opts.height || 0.34);
    var g = ctx.createLinearGradient(0, H - h, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,' + (opts.alpha == null ? 0.55 : opts.alpha) + ')');
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, H - h, W, h);
    ctx.restore();
  }

  /** 안전영역 가이드(미리보기 전용) */
  function drawSafeZones(ctx, W, H) {
    var u = unit(W, H);
    var bar = function (x, y, w, h, col) {
      ctx.save();
      ctx.fillStyle = col;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    };
    bar(0, 0, W, 220 * (H / 1920), 'rgba(255,45,85,0.18)');
    bar(0, 1500 * (H / 1920), W, (1920 - 1500) * (H / 1920), 'rgba(255,45,85,0.18)');
    bar(940 * (W / 1080), 1000 * (H / 1920), (1080 - 940) * (W / 1080), 750 * (H / 1920), 'rgba(255,45,85,0.18)');
    ctx.save();
    ctx.strokeStyle = 'rgba(0,255,255,0.75)';
    ctx.lineWidth = 2 * u;
    ctx.setLineDash([10 * u, 8 * u]);
    ctx.strokeRect(70 * (W / 1080), 270 * (H / 1920), (1010 - 70) * (W / 1080), (1240 - 270) * (H / 1920));
    ctx.strokeStyle = 'rgba(255,214,10,0.9)';
    ctx.strokeRect(140 * (W / 1080), 990 * (H / 1920), (940 - 140) * (W / 1080), (1240 - 990) * (H / 1920));
    ctx.restore();
  }

  /**
   * 프레임 하나를 그린다(브라우저 미리보기와 프레임 캡처가 같은 경로).
   * opts: {cues|timeline, t, W, H, theme, preset, layout, scrim, debug, background}
   */
  function drawFrame(ctx, opts) {
    var W = opts.W || (PRESET_DOC.canvas && PRESET_DOC.canvas.W) || 1080;
    var H = opts.H || (PRESET_DOC.canvas && PRESET_DOC.canvas.H) || 1920;
    var u = unit(W, H);
    var env = {
      W: W, H: H, u: u,
      theme: opts.theme || 'reels-dark',
      preset: opts.preset || 'outline-basic',
      layout: opts.layout || defaultLayout(W, H),
      measure: opts.measure || makeMeasure(ctx, theme(opts.theme).font)
    };
    var t = opts.t || 0;
    ctx.save();
    if (opts.background) {
      ctx.fillStyle = opts.background;
      ctx.fillRect(0, 0, W, H);
    }
    if (opts.scrim) drawScrim(ctx, W, H, opts.scrim);
    var tl = opts.timeline || buildTimeline(opts.cues || []);
    var cue = cueAt(tl, t);
    var info = null;
    if (cue) info = drawCue(ctx, cue, t, env);
    if (opts.debug) drawSafeZones(ctx, W, H);
    ctx.restore();
    return info;
  }

  /* ==================================================================
   * 6. 컴파일러 연결 + 계획 도구
   * ================================================================== */

  /** FFmpeg(ASS) 컴파일러에 넘길 입력(테마·프리셋·캔버스). Python make_ass.py가 같은 JSON을 읽는다. */
  function compilerInput() {
    return { canvas: PRESET_DOC.canvas, themes: PRESET_DOC.themes, presets: PRESET_DOC.presets, ass_style: PRESET_DOC.ass_style };
  }

  /**
   * Canvas 없이 큐 목록을 배치 계획으로 바꾼다(CLI/Node에서 미리 검증할 때).
   * 반환: 큐마다 {id,start,end,text,size,lines,blockW,blockH}
   */
  function plan(cues, opts) {
    opts = opts || {};
    var W = opts.W || 1080, H = opts.H || 1920;
    var T = theme(opts.theme);
    var L = opts.layout || defaultLayout(W, H);
    var size = opts.size || (T.sizeRatio || 0.0575) * W;
    var measure = makeMeasure(null, T.font);
    var tl = buildTimeline(cues, opts);
    return tl.map(function (c) {
      var lay = layoutCaption(c.text, {
        measure: measure, maxW: L.maxW, maxLines: L.maxLines || 2,
        size: size, lineHeight: T.lineHeight || 1.26
      });
      return {
        id: c.id, start: c.start, end: c.end, text: c.text,
        size: lay.size, lines: lay.lines.map(function (r) { return r.text; }),
        blockW: lay.blockW, blockH: lay.blockH, words: c.words
      };
    });
  }

  /** 프리셋 목록(문서 순서 유지) */
  function listPresets() {
    return Object.keys(PRESETS).map(function (id) {
      return { id: id, label: PRESETS[id].label, note: PRESETS[id].note, mode: PRESETS[id].mode };
    });
  }

  function listThemes() {
    return Object.keys(THEMES).map(function (id) {
      return { id: id, label: THEMES[id].label, note: THEMES[id].note };
    });
  }

  return {
    VERSION: VERSION,
    document: PRESET_DOC,
    themes: THEMES,
    presets: PRESETS,
    safe: SAFE,
    // 수학
    cubicBezier: cubicBezier,
    ease: ease,
    easeFn: easeFn,
    clamp: clamp,
    lerp: lerp,
    prog: prog,
    spring: spring,
    springAt: springAt,
    SPRINGS: SPRINGS,
    staggerDelay: staggerDelay,
    hash01: hash01,
    hashSigned: hashSigned,
    // 토큰/레이아웃
    theme: theme,
    preset: preset,
    unit: unit,
    defaultLayout: defaultLayout,
    tokenize: tokenize,
    wrapTokens: wrapTokens,
    balanceLines: balanceLines,
    layoutCaption: layoutCaption,
    makeMeasure: makeMeasure,
    estimateWidth: estimateWidth,
    // 타임라인
    normalizeCue: normalizeCue,
    wordWindows: wordWindows,
    buildTimeline: buildTimeline,
    cueAt: cueAt,
    activeWord: activeWord,
    // 렌더
    setFont: setFont,
    paintText: paintText,
    roundRect: roundRect,
    wordPlacements: wordPlacements,
    drawCue: drawCue,
    drawFrame: drawFrame,
    drawScrim: drawScrim,
    drawSafeZones: drawSafeZones,
    countText: countText,
    numberTokens: numberTokens,
    formatCount: formatCount,
    // 도구
    compilerInput: compilerInput,
    plan: plan,
    listPresets: listPresets,
    listThemes: listThemes
  };
});
