// ─────────────────────────────────────────────────────────────────────────────
// Subtitles (SRT, WebVTT): parsing cues with their times, and decoding a
// subtitle file that may be UTF-8 or Windows-1251.
// ─────────────────────────────────────────────────────────────────────────────

export type SubtitleCue = {
  /** Seconds from the start of the video. */
  start: number;
  end: number;
  text: string;
};

/** "00:01:02,500", "01:02.500", "1:02:03.25" → seconds; NaN when it is not a time. */
export function parseTimestamp(value: string): number {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(value.trim());
  if (!match) return NaN;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const fraction = match[4] ? Number(match[4].padEnd(3, "0")) / 1000 : 0;
  return hours * 3600 + minutes * 60 + seconds + fraction;
}

/** Seconds → "00:01:02.5" for showing. */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const sec = s.toFixed(1).padStart(4, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${String(m).padStart(2, "0")}:${sec}`;
}

/** Markup inside a cue: <i>, <b>, <font>, <00:00:01.000>, {\an8} and the like. */
function cleanCueText(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cues of an SRT or WebVTT text, in time order; blocks without a time line are skipped. */
export function parseSubtitles(text: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const blocks = text.replace(/\r\n?/g, "\n").replace(/^﻿/, "").split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
    const timeIndex = lines.findIndex((l) => l.includes("-->"));
    if (timeIndex < 0) continue;
    const [left, right] = lines[timeIndex].split("-->");
    const start = parseTimestamp(left);
    // WebVTT settings may follow the end time ("00:05.000 align:start").
    const end = parseTimestamp((right || "").trim().split(/\s+/)[0] || "");
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const body = cleanCueText(lines.slice(timeIndex + 1).join(" "));
    if (!body) continue;
    cues.push({ start, end, text: body });
  }
  return cues.sort((a, b) => a.start - b.start);
}

/** Text of a subtitle file: UTF-8 when it is valid UTF-8, else Windows-1251 (common for Russian). */
export function decodeSubtitleBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1251").decode(bytes);
  }
}
