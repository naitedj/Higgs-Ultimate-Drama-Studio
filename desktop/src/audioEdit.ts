// ─────────────────────────────────────────────────────────────────────────────
// Editing generated or reference audio: finding long pauses, shortening them,
// cutting a range out and cropping to a range. Works on 16-bit PCM (WavPcm),
// joins with a short crossfade so cuts do not click.
// ─────────────────────────────────────────────────────────────────────────────

import { encodeWavPcm, parseWavPcm } from "./audio";
import type { GenerationResult, WavPcm } from "./types";

export const PAUSE_TRIM_STORAGE_KEY = "dramaStudio.pauseTrim";

/** Below this level a stretch of audio counts as silence. */
export const SILENCE_DB = -45;
const WINDOW_SECONDS = 0.01;
const CROSSFADE_SECONDS = 0.008;

export type PauseTrimSettings = {
  /** Shorten long pauses right after each Drama 3 generation. */
  auto: boolean;
  /** A silence longer than this, in seconds, is a long pause. */
  longerThan: number;
  /** How much of a long pause is kept, in seconds. */
  keep: number;
};

export const DEFAULT_PAUSE_TRIM: PauseTrimSettings = { auto: true, longerThan: 1.0, keep: 0.5 };

export function loadPauseTrimSettings(): PauseTrimSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(PAUSE_TRIM_STORAGE_KEY) || "null");
    if (raw && typeof raw === "object") {
      const longerThan = clamp(Number(raw.longerThan), 0.3, 10, DEFAULT_PAUSE_TRIM.longerThan);
      return {
        auto: typeof raw.auto === "boolean" ? raw.auto : DEFAULT_PAUSE_TRIM.auto,
        longerThan,
        keep: Math.min(clamp(Number(raw.keep), 0, 5, DEFAULT_PAUSE_TRIM.keep), longerThan),
      };
    }
  } catch {
    // Defaults below.
  }
  return { ...DEFAULT_PAUSE_TRIM };
}

export function savePauseTrimSettings(settings: PauseTrimSettings): void {
  localStorage.setItem(PAUSE_TRIM_STORAGE_KEY, JSON.stringify(settings));
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** A stretch of the audio in frames (one frame = one sample per channel), end exclusive. */
export type FrameRange = { start: number; end: number };

export function frameCount(pcm: WavPcm): number {
  return Math.floor(pcm.samples.length / pcm.channels);
}

/**
 * Silences longer than `minSeconds` (below SILENCE_DB in windows of 10 ms). `edges`
 * tells whether the silence at the very start and end is included too.
 */
export function findPauses(pcm: WavPcm, minSeconds: number, edges = true): FrameRange[] {
  const frames = frameCount(pcm);
  const window = Math.max(1, Math.round(pcm.sampleRate * WINDOW_SECONDS));
  const threshold = 32768 * Math.pow(10, SILENCE_DB / 20);
  const minFrames = Math.round(minSeconds * pcm.sampleRate);
  const pauses: FrameRange[] = [];
  let runStart = -1;
  for (let start = 0; start < frames; start += window) {
    const end = Math.min(frames, start + window);
    let peak = 0;
    for (let i = start * pcm.channels; i < end * pcm.channels; i++) {
      const v = Math.abs(pcm.samples[i]);
      if (v > peak) peak = v;
    }
    if (peak < threshold) {
      if (runStart < 0) runStart = start;
    } else if (runStart >= 0) {
      if (start - runStart >= minFrames) pauses.push({ start: runStart, end: start });
      runStart = -1;
    }
  }
  if (runStart >= 0 && frames - runStart >= minFrames) pauses.push({ start: runStart, end: frames });
  return edges ? pauses : pauses.filter((p) => p.start > 0 && p.end < frames);
}

/** The audio without the given ranges, each join crossfaded. Ranges may be unsorted. */
export function removeRanges(pcm: WavPcm, ranges: FrameRange[]): WavPcm {
  const frames = frameCount(pcm);
  const ch = pcm.channels;
  const cuts = ranges
    .map((r) => ({ start: Math.max(0, Math.min(frames, Math.floor(r.start))), end: Math.max(0, Math.min(frames, Math.ceil(r.end))) }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);
  // Merge overlapping cuts.
  const merged: FrameRange[] = [];
  for (const cut of cuts) {
    const last = merged[merged.length - 1];
    if (last && cut.start <= last.end) last.end = Math.max(last.end, cut.end);
    else merged.push({ ...cut });
  }
  // The pieces that stay.
  const pieces: FrameRange[] = [];
  let pos = 0;
  for (const cut of merged) {
    if (cut.start > pos) pieces.push({ start: pos, end: cut.start });
    pos = cut.end;
  }
  if (pos < frames) pieces.push({ start: pos, end: frames });

  // Each piece overlaps the end of the one before by a few milliseconds, faded across.
  const src = pcm.samples;
  const out = new Int16Array(frames * ch);
  const fade = Math.max(1, Math.round(pcm.sampleRate * CROSSFADE_SECONDS));
  let written = 0;
  pieces.forEach((piece, index) => {
    const length = piece.end - piece.start;
    const n = index > 0 ? Math.min(fade, length, written) : 0;
    for (let f = 0; f < n; f++) {
      const w = (f + 1) / (n + 1);
      for (let c = 0; c < ch; c++) {
        const idx = (written - n + f) * ch + c;
        out[idx] = Math.round(out[idx] * (1 - w) + src[(piece.start + f) * ch + c] * w);
      }
    }
    out.set(src.subarray((piece.start + n) * ch, piece.end * ch), written * ch);
    written += length - n;
  });
  return { sampleRate: pcm.sampleRate, channels: ch, samples: out.slice(0, written * ch) };
}

/** Only the given range, faded in and out over a few milliseconds. */
export function cropTo(pcm: WavPcm, range: FrameRange): WavPcm {
  const frames = frameCount(pcm);
  const start = Math.max(0, Math.min(frames, Math.floor(range.start)));
  const end = Math.max(start, Math.min(frames, Math.ceil(range.end)));
  const ch = pcm.channels;
  const out = pcm.samples.slice(start * ch, end * ch);
  const n = Math.min(Math.round(pcm.sampleRate * 0.005), Math.floor((end - start) / 2));
  for (let f = 0; f < n; f++) {
    const w = f / n;
    for (let c = 0; c < ch; c++) {
      out[f * ch + c] = Math.round(out[f * ch + c] * w);
      const tail = (end - start - 1 - f) * ch + c;
      out[tail] = Math.round(out[tail] * w);
    }
  }
  return { sampleRate: pcm.sampleRate, channels: ch, samples: out };
}

/**
 * Shortens every pause longer than `longerThan` seconds to `keep` seconds (half kept
 * on each side, so the breath around words stays). Silence at the very start and
 * end is cut to at most 0.15 s and `keep` s. Returns the audio and how many pauses
 * were shortened and by how many seconds in all.
 */
export function shortenPauses(pcm: WavPcm, longerThan: number, keep: number): { pcm: WavPcm; count: number; seconds: number } {
  const frames = frameCount(pcm);
  const keepFrames = Math.round(Math.min(keep, longerThan) * pcm.sampleRate);
  const cuts: FrameRange[] = [];
  for (const pause of findPauses(pcm, longerThan)) {
    if (pause.start === 0) {
      cuts.push({ start: 0, end: Math.max(0, pause.end - Math.round(0.15 * pcm.sampleRate)) });
    } else if (pause.end >= frames) {
      cuts.push({ start: pause.start + keepFrames, end: frames });
    } else {
      const half = Math.floor(keepFrames / 2);
      cuts.push({ start: pause.start + half, end: pause.end - (keepFrames - half) });
    }
  }
  const real = cuts.filter((c) => c.end > c.start);
  const removed = real.reduce((sum, c) => sum + c.end - c.start, 0);
  return {
    pcm: real.length > 0 ? removeRanges(pcm, real) : pcm,
    count: real.length,
    seconds: removed / pcm.sampleRate,
  };
}

export function pcmToResult(pcm: WavPcm): GenerationResult {
  return {
    sampleRate: pcm.sampleRate,
    channels: pcm.channels,
    sampleCount: pcm.samples.length,
    wavBase64: encodeWavPcm(pcm),
  };
}

/** Shortens long pauses of a generation result; the result unchanged if there were none. */
export function shortenResultPauses<T extends GenerationResult>(
  result: T,
  settings: PauseTrimSettings,
): { result: T; count: number; seconds: number } {
  const pcm = parseWavPcm(result.wavBase64);
  const shortened = shortenPauses(pcm, settings.longerThan, settings.keep);
  if (shortened.count === 0) return { result, count: 0, seconds: 0 };
  const edited = pcmToResult(shortened.pcm);
  const seconds = frameCount(shortened.pcm) / pcm.sampleRate;
  return { result: { ...result, ...edited, seconds }, count: shortened.count, seconds: shortened.seconds };
}

// ─── Rate, channels and speed ───────────────────────────────────────────────

/** Linear resampling to `rate` Hz (fragments from different engines or files). */
export function resamplePcm(pcm: WavPcm, rate: number): WavPcm {
  if (pcm.sampleRate === rate) return pcm;
  const ch = pcm.channels;
  const inFrames = frameCount(pcm);
  const outFrames = Math.max(1, Math.round((inFrames * rate) / pcm.sampleRate));
  const out = new Int16Array(outFrames * ch);
  const ratio = pcm.sampleRate / rate;
  for (let f = 0; f < outFrames; f++) {
    const pos = f * ratio;
    const i = Math.floor(pos);
    const frac = pos - i;
    const j = Math.min(inFrames - 1, i + 1);
    for (let c = 0; c < ch; c++) {
      const a = pcm.samples[Math.min(inFrames - 1, i) * ch + c];
      const b = pcm.samples[j * ch + c];
      out[f * ch + c] = Math.round(a + (b - a) * frac);
    }
  }
  return { sampleRate: rate, channels: ch, samples: out };
}

/** The same audio with `channels` channels: mixed down to mono, or mono copied to each. */
export function convertChannels(pcm: WavPcm, channels: number): WavPcm {
  if (pcm.channels === channels) return pcm;
  const frames = frameCount(pcm);
  const out = new Int16Array(frames * channels);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let c = 0; c < pcm.channels; c++) sum += pcm.samples[f * pcm.channels + c];
    const mono = Math.round(sum / pcm.channels);
    for (let c = 0; c < channels; c++) {
      out[f * channels + c] = channels === pcm.channels ? pcm.samples[f * pcm.channels + c] : mono;
    }
  }
  return { sampleRate: pcm.sampleRate, channels, samples: out };
}

export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2;

/**
 * Plays the audio `speed` times faster (above 1) or slower (below 1) without
 * changing the pitch of the voice: WSOLA, overlap-adding 40 ms Hann-windowed
 * frames, each taken where it best continues the frame before.
 */
export function timeStretch(pcm: WavPcm, speed: number): WavPcm {
  const rate = Math.min(SPEED_MAX, Math.max(SPEED_MIN, speed));
  if (Math.abs(rate - 1) < 0.005) return pcm;
  const ch = pcm.channels;
  const frames = frameCount(pcm);
  const sr = pcm.sampleRate;
  const frameLen = Math.max(64, Math.round(sr * 0.04) & ~1);
  const synthesisHop = frameLen / 2;
  const analysisHop = synthesisHop * rate;
  const tolerance = Math.round(sr * 0.012);
  if (frames < frameLen * 2) return pcm;

  // Mono, decimated by 4, for the similarity search; refined at full rate.
  const mono = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let c = 0; c < ch; c++) s += pcm.samples[f * ch + c];
    mono[f] = s / ch / 32768;
  }
  const dec = 4;
  const monoDec = new Float32Array(Math.ceil(frames / dec));
  for (let i = 0; i < monoDec.length; i++) monoDec[i] = mono[i * dec];

  const window = new Float32Array(frameLen);
  for (let i = 0; i < frameLen; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frameLen);

  const outFrames = Math.ceil(frames / rate) + frameLen;
  const out = new Float32Array(outFrames * ch);
  const norm = new Float32Array(outFrames);

  const similarity = (data: Float32Array, a: number, b: number, length: number, step: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i += step) sum += data[a + i] * data[b + i];
    return sum;
  };

  let previous = 0;
  for (let k = 0; ; k++) {
    const outPos = k * synthesisHop;
    const ideal = Math.round(k * analysisHop);
    if (ideal + frameLen + tolerance >= frames || outPos + frameLen >= outFrames) break;
    let best = ideal;
    if (k > 0) {
      // Where the previous frame would naturally go on.
      const natural = previous + synthesisHop;
      if (natural + frameLen < frames) {
        const lo = Math.max(0, ideal - tolerance);
        const hi = Math.min(frames - frameLen - 1, ideal + tolerance);
        let bestScore = -Infinity;
        const lenDec = Math.floor(frameLen / dec);
        const natDec = Math.floor(natural / dec);
        for (let p = Math.ceil(lo / dec); p * dec <= hi; p++) {
          if (p + lenDec >= monoDec.length || natDec + lenDec >= monoDec.length) break;
          const score = similarity(monoDec, p, natDec, lenDec, 1);
          if (score > bestScore) {
            bestScore = score;
            best = p * dec;
          }
        }
        // Refine around the coarse best at full rate.
        let refined = best;
        let refinedScore = -Infinity;
        for (let p = Math.max(lo, best - dec); p <= Math.min(hi, best + dec); p++) {
          const score = similarity(mono, p, natural, frameLen, 2);
          if (score > refinedScore) {
            refinedScore = score;
            refined = p;
          }
        }
        best = refined;
      }
    }
    for (let i = 0; i < frameLen; i++) {
      const w = window[i];
      const o = outPos + i;
      norm[o] += w;
      for (let c = 0; c < ch; c++) out[o * ch + c] += (pcm.samples[(best + i) * ch + c] / 32768) * w;
    }
    previous = best;
  }

  // The length the speed asks for; the last frame fades where the window ends.
  const length = Math.min(outFrames, Math.round(frames / rate));
  const samples = new Int16Array(length * ch);
  for (let f = 0; f < length; f++) {
    const n = norm[f] > 1e-3 ? norm[f] : 1;
    for (let c = 0; c < ch; c++) {
      const v = out[f * ch + c] / n;
      samples[f * ch + c] = Math.max(-32768, Math.min(32767, Math.round(v * 32768)));
    }
  }
  return { sampleRate: sr, channels: ch, samples };
}

/**
 * The voice `semitones` higher (above 0) or lower, and `tempo` times faster, in one
 * pass: stretched by tempo/ratio without changing pitch, then resampled by the ratio,
 * which moves the pitch and brings the length back. Small shifts (±3 semitones)
 * sound natural; the formants move with the pitch.
 */
export function shiftPitchAndTempo(pcm: WavPcm, semitones: number, tempo: number): WavPcm {
  const ratio = Math.pow(2, semitones / 12);
  const stretched = timeStretch(pcm, Math.min(SPEED_MAX, Math.max(SPEED_MIN, tempo / ratio)));
  if (Math.abs(ratio - 1) < 0.001) return stretched;
  return resamplePcm({ ...stretched, sampleRate: Math.round(pcm.sampleRate * ratio) }, pcm.sampleRate);
}

/** Silence at the very start and end cut to `head` / `tail` seconds (speech is left whole). */
export function trimEdgeSilence(pcm: WavPcm, head = 0.05, tail = 0.1): WavPcm {
  const frames = frameCount(pcm);
  const pauses = findPauses(pcm, 0.02);
  const cuts: FrameRange[] = [];
  const first = pauses[0];
  if (first && first.start === 0) cuts.push({ start: 0, end: Math.max(0, first.end - Math.round(head * pcm.sampleRate)) });
  const last = pauses[pauses.length - 1];
  if (last && last.end >= frames && last.start > 0) cuts.push({ start: Math.min(frames, last.start + Math.round(tail * pcm.sampleRate)), end: frames });
  const real = cuts.filter((c) => c.end > c.start);
  return real.length > 0 ? removeRanges(pcm, real) : pcm;
}
