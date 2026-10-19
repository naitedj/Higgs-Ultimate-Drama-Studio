// ─────────────────────────────────────────────────────────────────────────────
// Audio editor modal: a waveform with long pauses marked, a selection made by
// dragging, playback, and cutting (delete the selection, keep only the
// selection, shorten all long pauses) with undo. Used for generated audio, scene
// lines and Speaker Gallery references; the caller decides what Save does.
// ─────────────────────────────────────────────────────────────────────────────

import { parseWavPcm } from "./audio";
import {
  cropTo,
  findPauses,
  frameCount,
  pcmToResult,
  removeRanges,
  shortenPauses,
} from "./audioEdit";
import type { FrameRange, PauseTrimSettings } from "./audioEdit";
import { cssVar, el, formatTime } from "./dom";
import { t } from "./i18n";
import type { GenerationResult, WavPcm } from "./types";

export type AudioEditorOptions = {
  title: string;
  wavBase64: string;
  settings: PauseTrimSettings;
  /** Called when the pause thresholds are changed in the editor, to remember them. */
  onSettings?: (settings: PauseTrimSettings) => void;
  onSave: (result: GenerationResult) => Promise<void> | void;
};

type EditorState = {
  options: AudioEditorOptions;
  pcm: WavPcm;
  undo: WavPcm[];
  selection: FrameRange | null;
  cursor: number;
  pauses: FrameRange[];
  viewStart: number;
  viewEnd: number;
  peaks: { key: string; min: Float32Array; max: Float32Array } | null;
  buffer: AudioBuffer | null;
};

let state: EditorState | null = null;
let context: AudioContext | null = null;
let source: AudioBufferSourceNode | null = null;
let playFrom = 0;
let playTo = 0;
let playStartedAt = 0;
let raf = 0;
let toast: (message: string, tone?: "success" | "warning" | "error") => void = () => {};

function frames(): number {
  return state ? frameCount(state.pcm) : 0;
}

function seconds(frame: number): number {
  return state ? frame / state.pcm.sampleRate : 0;
}

function settingsFromInputs(): PauseTrimSettings {
  const longerThan = Math.min(10, Math.max(0.3, parseFloat(el<HTMLInputElement>("#audio-editor-longer").value) || 1));
  const keep = Math.min(longerThan, Math.max(0, parseFloat(el<HTMLInputElement>("#audio-editor-keep").value) || 0));
  return { ...state!.options.settings, longerThan, keep };
}

function recomputePauses(): void {
  if (!state) return;
  state.pauses = findPauses(state.pcm, settingsFromInputs().longerThan);
}

function playing(): boolean {
  return source !== null;
}

function playheadFrame(): number {
  if (!state || !context || !source) return state?.cursor ?? 0;
  return Math.min(playTo, playFrom + (context.currentTime - playStartedAt) * state.pcm.sampleRate);
}

// ─── Drawing ───

function canvasSize(canvas: HTMLCanvasElement): { w: number; h: number } {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width * ratio));
  const h = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w, h };
}

function peaksFor(width: number): { min: Float32Array; max: Float32Array } {
  const s = state!;
  const key = `${s.pcm.samples.length}:${s.undo.length}:${s.viewStart}:${s.viewEnd}:${width}`;
  if (s.peaks && s.peaks.key === key) return s.peaks;
  const min = new Float32Array(width);
  const max = new Float32Array(width);
  const ch = s.pcm.channels;
  const span = s.viewEnd - s.viewStart;
  for (let x = 0; x < width; x++) {
    const a = s.viewStart + Math.floor((x / width) * span);
    const b = Math.max(a + 1, s.viewStart + Math.floor(((x + 1) / width) * span));
    let lo = 0;
    let hi = 0;
    // Long views: sample the column instead of reading every frame.
    const step = Math.max(1, Math.floor((b - a) / 400));
    for (let f = a; f < b; f += step) {
      const v = s.pcm.samples[f * ch] / 32768;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[x] = lo;
    max[x] = hi;
  }
  s.peaks = { key, min, max };
  return s.peaks;
}

function frameToX(frame: number, width: number): number {
  const s = state!;
  return ((frame - s.viewStart) / Math.max(1, s.viewEnd - s.viewStart)) * width;
}

function xToFrame(x: number, width: number): number {
  const s = state!;
  return Math.round(s.viewStart + (x / width) * (s.viewEnd - s.viewStart));
}

function draw(): void {
  if (!state) return;
  const canvas = el<HTMLCanvasElement>("#audio-editor-canvas");
  const { w, h } = canvasSize(canvas);
  const ctx = canvas.getContext("2d")!;
  const accent = cssVar("--accent", "#25b8ab");
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = cssVar("--bg-inner", "#11161b");
  ctx.fillRect(0, 0, w, h);

  // Long pauses.
  ctx.fillStyle = "rgba(216, 85, 111, 0.22)";
  for (const pause of state.pauses) {
    const x0 = frameToX(pause.start, w);
    const x1 = frameToX(pause.end, w);
    if (x1 < 0 || x0 > w) continue;
    ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
  }

  // Waveform.
  const { min, max } = peaksFor(w);
  const mid = h / 2;
  ctx.fillStyle = cssVar("--text-muted", "#7d8a96");
  for (let x = 0; x < w; x++) {
    const top = mid - max[x] * mid * 0.95;
    const bottom = mid - min[x] * mid * 0.95;
    ctx.fillRect(x, top, 1, Math.max(1, bottom - top));
  }

  // Selection.
  if (state.selection) {
    const x0 = frameToX(state.selection.start, w);
    const x1 = frameToX(state.selection.end, w);
    ctx.fillStyle = "rgba(37, 184, 171, 0.25)";
    ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
    ctx.fillStyle = accent;
    ctx.fillRect(x0, 0, 1, h);
    ctx.fillRect(x1, 0, 1, h);
  }

  // Cursor / playhead.
  ctx.fillStyle = playing() ? "#ffffff" : accent;
  ctx.fillRect(frameToX(playheadFrame(), w), 0, Math.max(1, (window.devicePixelRatio || 1) * 1.5), h);
  updateInfo();
}

function updateInfo(): void {
  if (!state) return;
  const total = seconds(frames());
  const parts = [`${t("Length")} ${total.toFixed(1)} ${t("s")}`];
  if (state.selection) {
    const a = seconds(state.selection.start);
    const b = seconds(state.selection.end);
    parts.push(`${t("selected")} ${(b - a).toFixed(2)} ${t("s")} (${a.toFixed(2)}–${b.toFixed(2)})`);
  } else {
    parts.push(`${t("cursor")} ${formatTime(seconds(state.cursor))}.${String(Math.floor((seconds(state.cursor) % 1) * 10))}`);
  }
  parts.push(`${t("long pauses")}: ${state.pauses.length}`);
  el("#audio-editor-info").textContent = parts.join(" · ");
  const hasSelection = Boolean(state.selection);
  el<HTMLButtonElement>("#audio-editor-delete").disabled = !hasSelection;
  el<HTMLButtonElement>("#audio-editor-crop").disabled = !hasSelection;
  el<HTMLButtonElement>("#audio-editor-undo").disabled = state.undo.length === 0;
  el<HTMLButtonElement>("#audio-editor-save").disabled = state.undo.length === 0;
  el("#audio-editor-play").textContent = playing() ? t("⏸ Stop") : state.selection ? t("▶ Play selection") : t("▶ Play");
}

// ─── Playback ───

function stopPlayback(): void {
  if (source) {
    source.onended = null;
    try { source.stop(); } catch { /* already stopped */ }
    source.disconnect();
    if (state) state.cursor = Math.round(playheadFrame());
    source = null;
  }
  cancelAnimationFrame(raf);
  draw();
}

function audioBuffer(): AudioBuffer {
  const s = state!;
  if (s.buffer) return s.buffer;
  context ??= new AudioContext();
  const n = frames();
  const buffer = context.createBuffer(s.pcm.channels, Math.max(1, n), s.pcm.sampleRate);
  for (let c = 0; c < s.pcm.channels; c++) {
    const data = buffer.getChannelData(c);
    for (let f = 0; f < n; f++) data[f] = s.pcm.samples[f * s.pcm.channels + c] / 32768;
  }
  s.buffer = buffer;
  return buffer;
}

function startPlayback(): void {
  if (!state) return;
  stopPlayback();
  const from = state.selection ? state.selection.start : state.cursor >= frames() ? 0 : state.cursor;
  const to = state.selection ? state.selection.end : frames();
  if (to <= from) return;
  context ??= new AudioContext();
  void context.resume();
  source = context.createBufferSource();
  source.buffer = audioBuffer();
  source.connect(context.destination);
  playFrom = from;
  playTo = to;
  playStartedAt = context.currentTime;
  source.onended = () => {
    source = null;
    if (state) state.cursor = state.selection ? state.selection.start : playTo;
    cancelAnimationFrame(raf);
    draw();
  };
  source.start(0, seconds(from), seconds(to - from));
  const loop = () => {
    draw();
    if (playing()) raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

// ─── Editing ───

function apply(next: WavPcm): void {
  if (!state) return;
  stopPlayback();
  state.undo.push(state.pcm);
  state.pcm = next;
  state.buffer = null;
  state.peaks = null;
  state.viewStart = 0;
  state.viewEnd = frames();
  state.cursor = Math.min(state.cursor, frames());
  recomputePauses();
  draw();
}

function deleteSelection(): void {
  if (!state?.selection) return;
  const cut = state.selection;
  state.selection = null;
  state.cursor = cut.start;
  apply(removeRanges(state.pcm, [cut]));
}

function cropSelection(): void {
  if (!state?.selection) return;
  const keep = state.selection;
  state.selection = null;
  state.cursor = 0;
  apply(cropTo(state.pcm, keep));
}

function shortenAll(): void {
  if (!state) return;
  const settings = settingsFromInputs();
  const result = shortenPauses(state.pcm, settings.longerThan, settings.keep);
  if (result.count === 0) {
    toast(t("No pauses that long"), "warning");
    return;
  }
  state.selection = null;
  apply(result.pcm);
  toast(`${t("Pauses shortened")}: ${result.count} (−${result.seconds.toFixed(1)} ${t("s")})`);
}

function undo(): void {
  if (!state || state.undo.length === 0) return;
  stopPlayback();
  state.pcm = state.undo.pop()!;
  state.buffer = null;
  state.peaks = null;
  state.selection = null;
  state.viewStart = 0;
  state.viewEnd = frames();
  state.cursor = Math.min(state.cursor, frames());
  recomputePauses();
  draw();
}

function close(): void {
  stopPlayback();
  state = null;
  el("#audio-editor-modal").classList.add("hidden");
}

async function save(): Promise<void> {
  if (!state) return;
  const button = el<HTMLButtonElement>("#audio-editor-save");
  button.disabled = true;
  try {
    await state.options.onSave(pcmToResult(state.pcm));
    close();
  } catch (e) {
    toast(`${t("Could not save")}: ${e}`, "error");
    button.disabled = false;
  }
}

// ─── Public ───

export function openAudioEditor(options: AudioEditorOptions): void {
  stopPlayback();
  const pcm = parseWavPcm(options.wavBase64);
  state = {
    options,
    pcm,
    undo: [],
    selection: null,
    cursor: 0,
    pauses: [],
    viewStart: 0,
    viewEnd: frameCount(pcm),
    peaks: null,
    buffer: null,
  };
  el("#audio-editor-title").textContent = options.title;
  el<HTMLInputElement>("#audio-editor-longer").value = String(options.settings.longerThan);
  el<HTMLInputElement>("#audio-editor-keep").value = String(options.settings.keep);
  el("#audio-editor-modal").classList.remove("hidden");
  recomputePauses();
  requestAnimationFrame(draw);
}

export function initAudioEditor(showToast: typeof toast): void {
  toast = showToast;
  const canvas = el<HTMLCanvasElement>("#audio-editor-canvas");
  let dragStart: { x: number; frame: number } | null = null;
  const localX = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    return ((event.clientX - rect.left) / rect.width) * canvas.width;
  };
  canvas.addEventListener("mousedown", (event) => {
    if (!state) return;
    const x = localX(event);
    dragStart = { x, frame: Math.max(0, Math.min(frames(), xToFrame(x, canvas.width))) };
  });
  window.addEventListener("mousemove", (event) => {
    if (!state || !dragStart) return;
    const frame = Math.max(0, Math.min(frames(), xToFrame(localX(event), canvas.width)));
    if (Math.abs(localX(event) - dragStart.x) > 3) {
      state.selection = { start: Math.min(dragStart.frame, frame), end: Math.max(dragStart.frame, frame) };
      draw();
    }
  });
  window.addEventListener("mouseup", (event) => {
    if (!state || !dragStart) return;
    const moved = Math.abs(localX(event) - dragStart.x) > 3;
    if (!moved) {
      const frame = dragStart.frame;
      // A click on a long pause selects it; elsewhere it moves the cursor.
      const pause = state.pauses.find((p) => frame >= p.start && frame <= p.end);
      state.selection = pause ? { ...pause } : null;
      state.cursor = pause ? pause.start : frame;
      if (playing()) stopPlayback();
    }
    dragStart = null;
    draw();
  });
  canvas.addEventListener("wheel", (event) => {
    if (!state) return;
    event.preventDefault();
    const total = frames();
    const span = state.viewEnd - state.viewStart;
    if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      const shift = Math.round(span * 0.1 * Math.sign(event.deltaY || event.deltaX));
      const start = Math.max(0, Math.min(total - span, state.viewStart + shift));
      state.viewStart = start;
      state.viewEnd = start + span;
    } else {
      const anchor = xToFrame(localX(event), canvas.width);
      const factor = event.deltaY < 0 ? 0.8 : 1.25;
      const minSpan = Math.round(state.pcm.sampleRate * 0.2);
      const next = Math.max(minSpan, Math.min(total, Math.round(span * factor)));
      const ratio = (anchor - state.viewStart) / Math.max(1, span);
      let start = Math.round(anchor - ratio * next);
      start = Math.max(0, Math.min(total - next, start));
      state.viewStart = start;
      state.viewEnd = start + next;
    }
    draw();
  }, { passive: false });

  el("#audio-editor-play").addEventListener("click", () => (playing() ? stopPlayback() : startPlayback()));
  el("#audio-editor-delete").addEventListener("click", deleteSelection);
  el("#audio-editor-crop").addEventListener("click", cropSelection);
  el("#audio-editor-undo").addEventListener("click", undo);
  el("#audio-editor-shorten").addEventListener("click", shortenAll);
  el("#audio-editor-save").addEventListener("click", () => void save());
  el("#audio-editor-cancel").addEventListener("click", close);
  el("#audio-editor-close").addEventListener("click", close);
  for (const id of ["#audio-editor-longer", "#audio-editor-keep"]) {
    el<HTMLInputElement>(id).addEventListener("change", () => {
      if (!state) return;
      const settings = settingsFromInputs();
      state.options.settings = settings;
      state.options.onSettings?.(settings);
      recomputePauses();
      draw();
    });
  }
  document.addEventListener("keydown", (event) => {
    if (!state) return;
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
    if (event.code === "Space") {
      event.preventDefault();
      if (playing()) stopPlayback();
      else startPlayback();
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteSelection();
    } else if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ") {
      // event.code, not event.key: with the Russian layout the key gives "я".
      event.preventDefault();
      undo();
    }
  });
  window.addEventListener("resize", () => draw());
}
