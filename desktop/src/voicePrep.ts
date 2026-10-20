// ─────────────────────────────────────────────────────────────────────────────
// Voice preparation: a long recording made into a good Drama 3 reference.
// Cleaning helpers (rumble cut, quieter noise between phrases), the choice of
// the best 10–20 s stretch from recognised phrases (whole sentences, no long
// pauses, even level, one speaker), and building the reference from phrases.
// ─────────────────────────────────────────────────────────────────────────────

import { frameCount, shortenPauses } from "./audioEdit";
import type { TranscriptSegment, WavPcm } from "./types";

/** Rumble and hum below `hz` removed (2nd-order high-pass, mono or interleaved). */
export function highPass(pcm: WavPcm, hz = 75): WavPcm {
  const ch = pcm.channels;
  const w0 = (2 * Math.PI * hz) / pcm.sampleRate;
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const cos = Math.cos(w0);
  const a0 = 1 + alpha;
  const b0 = (1 + cos) / 2 / a0;
  const b1 = -(1 + cos) / a0;
  const b2 = (1 + cos) / 2 / a0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  const out = new Int16Array(pcm.samples.length);
  for (let c = 0; c < ch; c++) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = c; i < pcm.samples.length; i += ch) {
      const x = pcm.samples[i];
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      out[i] = Math.max(-32768, Math.min(32767, Math.round(y)));
    }
  }
  return { ...pcm, samples: out };
}

/**
 * Noise between phrases made quieter: where the level is near the noise floor the
 * sound is lowered by `depthDb`, smoothly, so breaths and word ends stay.
 */
export function gateNoise(pcm: WavPcm, depthDb = -14): WavPcm {
  const ch = pcm.channels;
  const window = Math.max(1, Math.round(pcm.sampleRate * 0.01));
  const frames = frameCount(pcm);
  const windows = Math.ceil(frames / window);
  const rms = new Float32Array(windows);
  for (let w = 0; w < windows; w++) {
    let sum = 0;
    const end = Math.min(frames, (w + 1) * window) * ch;
    for (let i = w * window * ch; i < end; i++) sum += pcm.samples[i] * pcm.samples[i];
    rms[w] = Math.sqrt(sum / Math.max(1, end - w * window * ch));
  }
  const sorted = Array.from(rms).sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)] || 1;
  const threshold = Math.max(floor * 3, 32768 * Math.pow(10, -50 / 20));
  const low = Math.pow(10, depthDb / 20);
  // Hold open 80 ms after speech, attack 10 ms, release 120 ms.
  const gains = new Float32Array(windows);
  let gain = 1;
  let hold = 0;
  for (let w = 0; w < windows; w++) {
    const open = rms[w] > threshold;
    if (open) hold = 8;
    else if (hold > 0) hold -= 1;
    const target = open || hold > 0 ? 1 : low;
    gain += (target - gain) * (target > gain ? 0.6 : 0.08);
    gains[w] = gain;
  }
  const out = new Int16Array(pcm.samples.length);
  for (let f = 0; f < frames; f++) {
    const w = Math.floor(f / window);
    const next = gains[Math.min(windows - 1, w + 1)];
    const g = gains[w] + (next - gains[w]) * ((f % window) / window);
    for (let c = 0; c < ch; c++) out[f * ch + c] = Math.round(pcm.samples[f * ch + c] * g);
  }
  return { ...pcm, samples: out };
}

const SENTENCE_END = /[.!?…]["»”)]*$/;

export type PhraseInfo = TranscriptSegment & {
  index: number;
  /** The phrase ends a sentence. */
  sentenceEnd: boolean;
  /** RMS level of the phrase, dBFS. */
  levelDb: number;
};

/** Recognised words are joined with spaces: "тихо , только" → "тихо, только". */
export function tidyRecognised(text: string): string {
  return text
    .replace(/\s+([,.!?…:;»”)])/g, "$1")
    .replace(/([«“(])\s+/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Phrases with their sentence ends and levels. */
export function phraseInfo(segments: TranscriptSegment[], pcm: WavPcm): PhraseInfo[] {
  const ch = pcm.channels;
  return [...segments]
    .sort((a, b) => a.start - b.start)
    .map((segment) => ({ ...segment, text: tidyRecognised(segment.text) }))
    .map((s, index) => {
      const a = Math.max(0, Math.floor(s.start * pcm.sampleRate)) * ch;
      const b = Math.min(frameCount(pcm), Math.ceil(s.end * pcm.sampleRate)) * ch;
      let sum = 0;
      for (let i = a; i < b; i++) sum += pcm.samples[i] * pcm.samples[i];
      const rms = Math.sqrt(sum / Math.max(1, b - a));
      return { ...s, index, sentenceEnd: SENTENCE_END.test(s.text.trim()), levelDb: 20 * Math.log10(Math.max(1, rms) / 32768) };
    });
}

export type Fragment = {
  /** Indices into the phrase list, consecutive. */
  phrases: number[];
  start: number;
  end: number;
  seconds: number;
  text: string;
  score: number;
  /** Why it is good or not quite, for the user. */
  notes: string[];
};

/**
 * The best stretches of whole sentences between `min` and `max` seconds: few and
 * short pauses, an even level, enough words, one speaker. Best first, not overlapping.
 */
export function bestFragments(phrases: PhraseInfo[], min = 10, max = 20, count = 3): Fragment[] {
  const found: Fragment[] = [];
  for (let i = 0; i < phrases.length; i++) {
    // A fragment starts where a sentence starts.
    if (i > 0 && !phrases[i - 1].sentenceEnd) continue;
    let longestGap = 0;
    let gaps = 0;
    for (let j = i; j < phrases.length; j++) {
      if (phrases[j].speaker !== phrases[i].speaker) break;
      if (j > i) {
        const gap = phrases[j].start - phrases[j - 1].end;
        longestGap = Math.max(longestGap, gap);
        gaps += Math.max(0, gap);
      }
      const seconds = phrases[j].end - phrases[i].start;
      if (seconds > max + 2) break;
      if (!phrases[j].sentenceEnd || seconds < min) continue;
      const list = phrases.slice(i, j + 1);
      const text = list.map((p) => p.text.trim()).join(" ");
      const words = text.split(/\s+/).filter(Boolean).length;
      const levels = list.map((p) => p.levelDb);
      const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
      const spread = Math.sqrt(levels.reduce((a, b) => a + (b - mean) ** 2, 0) / levels.length);
      const wordsPerSecond = words / Math.max(1, seconds - gaps);
      const notes: string[] = [];
      let score = 100;
      score -= Math.abs(seconds - 15) * 2;
      if (seconds > max) { score -= 15; notes.push("чуть длиннее нужного"); }
      if (longestGap > 1.2) { score -= 20; notes.push("есть длинная пауза (её укоротим)"); }
      else if (longestGap > 0.7) score -= 6;
      score -= gaps * 3;
      if (spread > 4) { score -= (spread - 4) * 4; notes.push("громкость скачет"); }
      if (mean < -40) { score -= 15; notes.push("тихо"); }
      if (words < 15) { score -= 15; notes.push("мало слов"); }
      if (wordsPerSecond < 1.5 || wordsPerSecond > 4.5) { score -= 10; notes.push(wordsPerSecond < 1.5 ? "речь медленная или с паузами" : "речь очень быстрая"); }
      if (notes.length === 0) notes.push("ровная речь, целые предложения");
      found.push({ phrases: list.map((p) => p.index), start: phrases[i].start, end: phrases[j].end, seconds, text, score, notes });
    }
  }
  found.sort((a, b) => b.score - a.score);
  const chosen: Fragment[] = [];
  for (const fragment of found) {
    if (chosen.some((c) => fragment.start < c.end && fragment.end > c.start)) continue;
    chosen.push(fragment);
    if (chosen.length >= count) break;
  }
  return chosen;
}

/**
 * The reference from the chosen phrases: each run of neighbouring phrases is cut
 * with a little air around it (never into the neighbours), runs are joined with a
 * short pause, long pauses inside are shortened, the ends fade.
 */
export function buildReference(pcm: WavPcm, phrases: PhraseInfo[], chosen: number[]): { pcm: WavPcm; text: string } {
  const ch = pcm.channels;
  const rate = pcm.sampleRate;
  const sorted = [...new Set(chosen)].sort((a, b) => a - b);
  const runs: number[][] = [];
  for (const index of sorted) {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === index - 1) last.push(index);
    else runs.push([index]);
  }
  const parts: Int16Array[] = [];
  const gap = new Int16Array(Math.round(0.35 * rate) * ch);
  runs.forEach((run, r) => {
    const first = phrases[run[0]];
    const last = phrases[run[run.length - 1]];
    const before = run[0] > 0 ? (first.start - phrases[run[0] - 1].end) / 2 : 0.3;
    const after = run[run.length - 1] < phrases.length - 1 ? (phrases[run[run.length - 1] + 1].start - last.end) / 2 : 0.4;
    const a = Math.max(0, Math.round((first.start - Math.min(0.15, Math.max(0, before))) * rate));
    const b = Math.min(frameCount(pcm), Math.round((last.end + Math.min(0.3, Math.max(0, after))) * rate));
    if (r > 0) parts.push(gap);
    parts.push(pcm.samples.slice(a * ch, b * ch));
  });
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const samples = new Int16Array(total);
  let offset = 0;
  for (const part of parts) {
    samples.set(part, offset);
    offset += part.length;
  }
  let result: WavPcm = { sampleRate: rate, channels: ch, samples };
  result = shortenPauses(result, 0.6, 0.35).pcm;
  // Fades: 15 ms in, 60 ms out.
  const frames = frameCount(result);
  const fadeIn = Math.round(0.015 * rate);
  const fadeOut = Math.round(0.06 * rate);
  for (let f = 0; f < frames; f++) {
    let g = 1;
    if (f < fadeIn) g = f / fadeIn;
    if (f > frames - fadeOut) g = Math.min(g, (frames - f) / fadeOut);
    if (g < 1) for (let c = 0; c < ch; c++) result.samples[f * ch + c] = Math.round(result.samples[f * ch + c] * g);
  }
  const text = sorted.map((i) => phrases[i].text.trim()).join(" ");
  return { pcm: result, text };
}
