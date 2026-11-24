/*!
 * motions.esm.js — motions.js 를 ES 모듈로 쓰기 위한 얇은 껍데기.
 *
 *   import KM from './motions.esm.js';
 *   import { drawFrame, ease, presets } from './motions.esm.js';
 *
 * motions.js 자체는 UMD라 <script>·require 어디서나 동작한다. 이 파일은
 * 번들러/모던 브라우저에서 named import를 쓰고 싶을 때만 필요하다.
 */
import './motions.js';

const KM = globalThis.KoreanMotion;

if (!KM) throw new Error('motions.js 를 먼저 불러와야 합니다.');

export default KM;
export const VERSION = KM.VERSION;
export const document = KM.document;
export const themes = KM.themes;
export const presets = KM.presets;
export const safe = KM.safe;
export const ease = KM.ease;
export const cubicBezier = KM.cubicBezier;
export const clamp = KM.clamp;
export const lerp = KM.lerp;
export const prog = KM.prog;
export const spring = KM.spring;
export const theme = KM.theme;
export const preset = KM.preset;
export const unit = KM.unit;
export const defaultLayout = KM.defaultLayout;
export const tokenize = KM.tokenize;
export const layoutCaption = KM.layoutCaption;
export const makeMeasure = KM.makeMeasure;
export const estimateWidth = KM.estimateWidth;
export const buildTimeline = KM.buildTimeline;
export const cueAt = KM.cueAt;
export const drawCue = KM.drawCue;
export const drawFrame = KM.drawFrame;
export const drawSafeZones = KM.drawSafeZones;
export const plan = KM.plan;
export const compilerInput = KM.compilerInput;
export const listPresets = KM.listPresets;
export const listThemes = KM.listThemes;
