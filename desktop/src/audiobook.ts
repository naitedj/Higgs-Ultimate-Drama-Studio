// ─────────────────────────────────────────────────────────────────────────────
// Audiobook export: mastering (silence at the ends, room tone, peak ceiling) and
// ID3v2.3 tags for MP3. Loudness itself is brought to the target by the backend
// (normalize_wav, EBU R128) before this.
// ─────────────────────────────────────────────────────────────────────────────

import { frameCount } from "./audioEdit";
import type { WavPcm } from "./types";

export const AUDIOBOOK_EXPORT_STORAGE_KEY = "dramaStudio.audiobookExport";

export type AudiobookFormat = "mp3-128" | "mp3-64" | "wav";

export type AudiobookExport = {
  format: AudiobookFormat;
  /** Bring to −19 LUFS with peaks at most −3 dBFS (common audiobook requirements). */
  standard: boolean;
  /** Very quiet noise instead of digital silence. */
  roomTone: boolean;
  title: string;
  author: string;
  book: string;
  track: string;
};

export const AUDIOBOOK_TARGET_LUFS = -19;
const PEAK_CEILING_DB = -3;
const ROOM_TONE_DB = -62;
const HEAD_SECONDS = 0.5;
const TAIL_SECONDS = 1.0;

export function loadAudiobookExport(): AudiobookExport {
  const defaults: AudiobookExport = { format: "mp3-128", standard: true, roomTone: true, title: "", author: "", book: "", track: "" };
  try {
    const saved = JSON.parse(localStorage.getItem(AUDIOBOOK_EXPORT_STORAGE_KEY) || "{}");
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
}

export function saveAudiobookExport(settings: AudiobookExport): void {
  localStorage.setItem(AUDIOBOOK_EXPORT_STORAGE_KEY, JSON.stringify(settings));
}

/**
 * Silence at the head and tail, room tone under everything (so pauses are not
 * dead digital silence), and the peaks brought under the ceiling.
 */
export function masterAudiobook(pcm: WavPcm, settings: Pick<AudiobookExport, "standard" | "roomTone">): WavPcm {
  const ch = pcm.channels;
  const head = settings.standard ? Math.round(HEAD_SECONDS * pcm.sampleRate) : 0;
  const tail = settings.standard ? Math.round(TAIL_SECONDS * pcm.sampleRate) : 0;
  const frames = frameCount(pcm);
  const total = head + frames + tail;
  const out = new Float32Array(total * ch);
  for (let i = 0; i < frames * ch; i++) out[head * ch + i] = pcm.samples[i];

  if (settings.roomTone) {
    // Soft noise: white noise through a one-pole low-pass, at a fixed quiet level.
    const amplitude = 32768 * Math.pow(10, ROOM_TONE_DB / 20) * 5.5;
    let state = 0;
    let seed = 0x2545f491;
    for (let f = 0; f < total; f++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const white = ((seed >>> 0) / 0xffffffff) * 2 - 1;
      state += 0.15 * (white - state);
      for (let c = 0; c < ch; c++) out[f * ch + c] += state * amplitude;
    }
  }

  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const ceiling = 32767 * Math.pow(10, PEAK_CEILING_DB / 20);
  const gain = settings.standard && peak > ceiling ? ceiling / peak : 1;
  const samples = new Int16Array(out.length);
  for (let i = 0; i < out.length; i++) samples[i] = Math.max(-32768, Math.min(32767, Math.round(out[i] * gain)));
  return { sampleRate: pcm.sampleRate, channels: ch, samples };
}

function utf16Text(text: string): Uint8Array {
  // Encoding byte 1 (UTF-16 with BOM), then BOM FF FE and little-endian code units.
  const bytes = new Uint8Array(3 + text.length * 2);
  bytes[0] = 1;
  bytes[1] = 0xff;
  bytes[2] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes[3 + i * 2] = code & 0xff;
    bytes[4 + i * 2] = code >> 8;
  }
  return bytes;
}

/** An ID3v2.3 tag with the given text frames (TIT2 title, TPE1 artist, TALB album, TRCK, TCON). */
export function id3Tag(frames: Record<string, string>): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const [id, value] of Object.entries(frames)) {
    if (!value.trim()) continue;
    const body = utf16Text(value.trim());
    const header = new Uint8Array(10);
    for (let i = 0; i < 4; i++) header[i] = id.charCodeAt(i);
    const size = body.length;
    header[4] = (size >>> 24) & 0xff;
    header[5] = (size >>> 16) & 0xff;
    header[6] = (size >>> 8) & 0xff;
    header[7] = size & 0xff;
    parts.push(header, body);
  }
  const framesSize = parts.reduce((sum, p) => sum + p.length, 0);
  const tag = new Uint8Array(10 + framesSize);
  tag.set([0x49, 0x44, 0x33, 3, 0, 0], 0);
  // Size as a syncsafe integer (7 bits per byte).
  tag[6] = (framesSize >>> 21) & 0x7f;
  tag[7] = (framesSize >>> 14) & 0x7f;
  tag[8] = (framesSize >>> 7) & 0x7f;
  tag[9] = framesSize & 0x7f;
  let offset = 10;
  for (const part of parts) {
    tag.set(part, offset);
    offset += part.length;
  }
  return tag;
}

/** A file name from the tags: "03. Глава третья". */
export function audiobookFileName(settings: AudiobookExport, fallback: string): string {
  const title = settings.title.trim() || fallback;
  const track = settings.track.trim();
  const name = track ? `${track.padStart(2, "0")}. ${title}` : title;
  return name.replace(/[<>:"/\\|?*]+/g, "_").slice(0, 120);
}

/** A value in an FFMETADATA file: = ; # \ and line breaks escaped. */
function ffmetaValue(value: string): string {
  return value.replace(/[\\=;#\n]/g, (c) => (c === "\n" ? "\\\n" : `\\${c}`));
}

/** FFMETADATA with the book tags and one chapter per entry (times in milliseconds). */
export function m4bMetadata(
  tags: { title: string; author: string },
  chapters: Array<{ title: string; startMs: number; endMs: number }>,
): string {
  const lines = [";FFMETADATA1"];
  if (tags.title) lines.push(`title=${ffmetaValue(tags.title)}`, `album=${ffmetaValue(tags.title)}`);
  if (tags.author) lines.push(`artist=${ffmetaValue(tags.author)}`, `album_artist=${ffmetaValue(tags.author)}`);
  lines.push("genre=Audiobook");
  for (const chapter of chapters) {
    lines.push("[CHAPTER]", "TIMEBASE=1/1000", `START=${Math.round(chapter.startMs)}`, `END=${Math.round(chapter.endMs)}`, `title=${ffmetaValue(chapter.title)}`);
  }
  return `${lines.join("\n")}\n`;
}
