// ─────────────────────────────────────────────────────────────────────────────
// Waveform panel under a joined track (Chapter, Montage): the wave with long
// pauses marked in red and the playhead of the track's own <audio> player. A
// click seeks, a click on a pause selects it, a drag selects a stretch; the
// selected pause is shortened (or the stretch cut out), all long pauses can be
// shortened at once, with undo. Every edit is handed back to the caller, which
// shows it in the player and keeps it for saving and export.
// ─────────────────────────────────────────────────────────────────────────────

import { parseWavPcm } from "./audio";
import { findPauses, frameCount, pcmToResult, removeRanges, shortenPauses } from "./audioEdit";
import type { FrameRange, PauseTrimSettings } from "./audioEdit";
import { cssVar, formatTime } from "./dom";
import { t } from "./i18n";
import type { GenerationResult, WavPcm } from "./types";

export type WavePanelOptions = {
  /** Where the panel goes: it is put right before the player. */
  audio: HTMLAudioElement;
  /** The pause thresholds (shared with the audio editor). */
  settings: () => PauseTrimSettings;
  /** An edit was made: the caller shows the new audio (and calls `show` with it). */
  onEdit: (result: GenerationResult) => void;
  toast: (message: string, tone?: "success" | "warning" | "error") => void;
};

export type WavePanel = {
  /** The track to show; an edit made here keeps the undo history. */
  show: (result: GenerationResult) => void;
  /** The pause thresholds changed: mark the pauses again. */
  refresh: () => void;
};

export function createWavePanel(options: WavePanelOptions): WavePanel {
  const { audio } = options;
  const root = document.createElement("div");
  root.className = "wave-panel";
  root.innerHTML = `
    <canvas class="wave-panel-canvas"></canvas>
    <div class="wave-panel-row">
      <span class="wave-panel-info"></span>
    </div>
    <div class="wave-panel-row">
      <button class="compact-button" data-action="next" type="button"></button>
      <button class="compact-button" data-action="cut" type="button" disabled></button>
      <button class="compact-button" data-action="shorten" type="button"></button>
      <button class="compact-button" data-action="undo" type="button" disabled></button>
      <span class="wave-panel-hint"></span>
    </div>
  `;
  audio.before(root);
  const canvas = root.querySelector<HTMLCanvasElement>("canvas")!;
  const info = root.querySelector<HTMLElement>(".wave-panel-info")!;
  const button = (action: string) => root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
  button("next").textContent = t("→ Next pause");
  button("shorten").textContent = t("Shorten all pauses");
  button("undo").textContent = t("↶ Undo");
  root.querySelector<HTMLElement>(".wave-panel-hint")!.textContent = t("Click: listen from there · click a red pause: select it · wheel: zoom");

  let pcm: WavPcm | null = null;
  let shownBase64 = "";
  let undo: WavPcm[] = [];
  let pauses: FrameRange[] = [];
  let selection: FrameRange | null = null;
  let viewStart = 0;
  let viewEnd = 0;
  let peaks: { key: string; min: Float32Array; max: Float32Array } | null = null;
  let resumeAt: number | null = null;
  let raf = 0;
  let editing = false;

  const frames = () => (pcm ? frameCount(pcm) : 0);
  const rate = () => pcm?.sampleRate || 1;

  function recompute(): void {
    pauses = pcm ? findPauses(pcm, options.settings().longerThan) : [];
    peaks = null;
  }

  function size(): { w: number; h: number } {
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
    const key = `${viewStart}:${viewEnd}:${width}`;
    if (peaks && peaks.key === key) return peaks;
    const min = new Float32Array(width);
    const max = new Float32Array(width);
    const p = pcm!;
    const span = viewEnd - viewStart;
    for (let x = 0; x < width; x++) {
      const a = viewStart + Math.floor((x / width) * span);
      const b = Math.max(a + 1, viewStart + Math.floor(((x + 1) / width) * span));
      let lo = 0;
      let hi = 0;
      // Long views: sample the column instead of reading every frame.
      const step = Math.max(1, Math.floor((b - a) / 400));
      for (let f = a; f < b; f += step) {
        const v = p.samples[f * p.channels] / 32768;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      min[x] = lo;
      max[x] = hi;
    }
    peaks = { key, min, max };
    return peaks;
  }

  const frameToX = (frame: number, width: number) => ((frame - viewStart) / Math.max(1, viewEnd - viewStart)) * width;
  const xToFrame = (x: number, width: number) => Math.round(viewStart + (x / width) * (viewEnd - viewStart));
  const playhead = () => Math.round(audio.currentTime * rate());

  /** Keeps the playhead in view while playing a zoomed-in track. */
  function follow(): void {
    const span = viewEnd - viewStart;
    if (span >= frames()) return;
    const head = playhead();
    if (head < viewStart || head > viewEnd) {
      viewStart = Math.max(0, Math.min(frames() - span, head - Math.round(span * 0.1)));
      viewEnd = viewStart + span;
    }
  }

  function draw(): void {
    if (!pcm) return;
    const { w, h } = size();
    const ctx = canvas.getContext("2d")!;
    const accent = cssVar("--accent", "#25b8ab");
    ctx.fillStyle = cssVar("--bg-inner", "#11161b");
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(216, 85, 111, 0.30)";
    for (const pause of pauses) {
      const x0 = frameToX(pause.start, w);
      const x1 = frameToX(pause.end, w);
      if (x1 < 0 || x0 > w) continue;
      ctx.fillRect(x0, 0, Math.max(2, x1 - x0), h);
    }
    const { min, max } = peaksFor(w);
    const mid = h / 2;
    ctx.fillStyle = cssVar("--text-muted", "#7d8a96");
    for (let x = 0; x < w; x++) {
      const top = mid - max[x] * mid * 0.95;
      const bottom = mid - min[x] * mid * 0.95;
      ctx.fillRect(x, top, 1, Math.max(1, bottom - top));
    }
    if (selection) {
      const x0 = frameToX(selection.start, w);
      const x1 = frameToX(selection.end, w);
      ctx.fillStyle = "rgba(37, 184, 171, 0.30)";
      ctx.fillRect(x0, 0, Math.max(2, x1 - x0), h);
      ctx.fillStyle = accent;
      ctx.fillRect(x0, 0, 1, h);
      ctx.fillRect(x1, 0, 1, h);
    }
    ctx.fillStyle = audio.paused ? accent : "#ffffff";
    ctx.fillRect(frameToX(playhead(), w), 0, Math.max(1, (window.devicePixelRatio || 1) * 1.5), h);
    updateInfo();
  }

  function selectionIsPause(): boolean {
    return Boolean(selection && pauses.some((p) => p.start === selection!.start && p.end === selection!.end));
  }

  function updateInfo(): void {
    const settings = options.settings();
    const parts = [
      `${t("long pauses")} (> ${settings.longerThan} ${t("s")}): ${pauses.length}`,
    ];
    if (selection) {
      const a = selection.start / rate();
      const b = selection.end / rate();
      parts.push(`${t("selected")} ${(b - a).toFixed(2)} ${t("s")} (${formatTime(a)})`);
    }
    if (viewEnd - viewStart < frames()) parts.push(`${t("view")} ${formatTime(viewStart / rate())}–${formatTime(viewEnd / rate())}`);
    info.textContent = parts.join(" · ");
    const isPause = selectionIsPause();
    button("cut").disabled = !selection;
    button("cut").textContent = isPause || !selection
      ? `${t("✂ Shorten this pause")} (→ ${settings.keep} ${t("s")})`
      : t("✂ Cut the selection");
    button("next").disabled = pauses.length === 0;
    button("shorten").disabled = pauses.length === 0;
    button("undo").disabled = undo.length === 0;
  }

  function loop(): void {
    follow();
    draw();
    if (!audio.paused) raf = requestAnimationFrame(loop);
  }

  /** Applies an edit: kept for undo, handed to the caller, listening goes on near the same place. */
  function commit(next: WavPcm, at: number, keepUndo = true): void {
    if (!pcm) return;
    if (keepUndo) undo.push(pcm);
    pcm = next;
    selection = null;
    viewStart = 0;
    viewEnd = frames();
    recompute();
    resumeAt = Math.max(0, at);
    const result = pcmToResult(next);
    shownBase64 = result.wavBase64;
    editing = true;
    try {
      options.onEdit(result);
    } finally {
      editing = false;
    }
    draw();
  }

  function cut(): void {
    if (!pcm || !selection) return;
    const keep = Math.round(Math.min(options.settings().keep, options.settings().longerThan) * rate());
    let range = selection;
    if (selectionIsPause()) {
      if (selection.start === 0) range = { start: 0, end: Math.max(0, selection.end - Math.round(0.15 * rate())) };
      else if (selection.end >= frames()) range = { start: selection.start + keep, end: frames() };
      else {
        const half = Math.floor(keep / 2);
        range = { start: selection.start + half, end: selection.end - (keep - half) };
      }
    }
    if (range.end <= range.start) {
      options.toast(t("No pauses that long"), "warning");
      return;
    }
    const seconds = (range.end - range.start) / rate();
    commit(removeRanges(pcm, [range]), Math.max(0, selection.start / rate() - 1));
    options.toast(`${t("Cut")}: ${seconds.toFixed(1)} ${t("s")}`);
  }

  function shortenAll(): void {
    if (!pcm) return;
    const settings = options.settings();
    const result = shortenPauses(pcm, settings.longerThan, settings.keep);
    if (result.count === 0) {
      options.toast(t("No pauses that long"), "warning");
      return;
    }
    commit(result.pcm, audio.currentTime);
    options.toast(`${t("Pauses shortened")}: ${result.count} (−${result.seconds.toFixed(1)} ${t("s")})`);
  }

  function undoEdit(): void {
    if (!pcm || undo.length === 0) return;
    commit(undo.pop()!, audio.currentTime, false);
  }

  /** Selects the next long pause after the playhead, zooms to it and plays from a second before. */
  function nextPause(): void {
    if (!pcm || pauses.length === 0) return;
    const from = selection ? selection.end : playhead();
    const pause = pauses.find((p) => p.start > from) ?? pauses[0];
    selection = { ...pause };
    const pad = Math.round(4 * rate());
    const span = Math.min(frames(), pause.end - pause.start + pad * 2);
    viewStart = Math.max(0, Math.min(frames() - span, pause.start - pad));
    viewEnd = viewStart + span;
    audio.currentTime = Math.max(0, pause.start / rate() - 1);
    draw();
  }

  // ─── Mouse ───

  let dragStart: { x: number; frame: number } | null = null;
  const localX = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    return ((event.clientX - rect.left) / rect.width) * canvas.width;
  };
  const clampFrame = (frame: number) => Math.max(0, Math.min(frames(), frame));
  canvas.addEventListener("mousedown", (event) => {
    if (!pcm) return;
    const x = localX(event);
    dragStart = { x, frame: clampFrame(xToFrame(x, canvas.width)) };
  });
  window.addEventListener("mousemove", (event) => {
    if (!pcm || !dragStart) return;
    if (Math.abs(localX(event) - dragStart.x) > 3) {
      const frame = clampFrame(xToFrame(localX(event), canvas.width));
      selection = { start: Math.min(dragStart.frame, frame), end: Math.max(dragStart.frame, frame) };
      draw();
    }
  });
  window.addEventListener("mouseup", (event) => {
    if (!pcm || !dragStart) return;
    if (Math.abs(localX(event) - dragStart.x) <= 3) {
      const frame = dragStart.frame;
      // A click on a long pause selects it and plays from a second before it.
      const pause = pauses.find((p) => frame >= p.start && frame <= p.end);
      selection = pause ? { ...pause } : null;
      audio.currentTime = pause ? Math.max(0, pause.start / rate() - 1) : frame / rate();
    } else if (selection) {
      audio.currentTime = selection.start / rate();
    }
    dragStart = null;
    draw();
  });
  canvas.addEventListener("wheel", (event) => {
    if (!pcm) return;
    event.preventDefault();
    const total = frames();
    const span = viewEnd - viewStart;
    if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      const shift = Math.round(span * 0.1 * Math.sign(event.deltaY || event.deltaX));
      viewStart = Math.max(0, Math.min(total - span, viewStart + shift));
      viewEnd = viewStart + span;
    } else {
      const anchor = xToFrame(localX(event), canvas.width);
      const next = Math.max(Math.round(rate() * 0.5), Math.min(total, Math.round(span * (event.deltaY < 0 ? 0.8 : 1.25))));
      const ratio = (anchor - viewStart) / Math.max(1, span);
      viewStart = Math.max(0, Math.min(total - next, Math.round(anchor - ratio * next)));
      viewEnd = viewStart + next;
    }
    draw();
  }, { passive: false });

  button("next").addEventListener("click", nextPause);
  button("cut").addEventListener("click", cut);
  button("shorten").addEventListener("click", shortenAll);
  button("undo").addEventListener("click", undoEdit);

  audio.addEventListener("play", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  });
  for (const name of ["pause", "seeked", "ended"]) audio.addEventListener(name, () => draw());
  audio.addEventListener("loadedmetadata", () => {
    if (resumeAt !== null) {
      audio.currentTime = Math.min(resumeAt, audio.duration || resumeAt);
      resumeAt = null;
    }
    draw();
  });
  new ResizeObserver(() => draw()).observe(canvas);

  return {
    show(result: GenerationResult) {
      if (result.wavBase64 === shownBase64 && pcm) {
        draw();
        return;
      }
      // A new track from outside (joined again, edited in the editor): history starts over.
      if (!editing) undo = [];
      shownBase64 = result.wavBase64;
      pcm = parseWavPcm(result.wavBase64);
      selection = null;
      viewStart = 0;
      viewEnd = frames();
      recompute();
      requestAnimationFrame(draw);
    },
    refresh() {
      recompute();
      draw();
    },
  };
}
