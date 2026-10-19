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
