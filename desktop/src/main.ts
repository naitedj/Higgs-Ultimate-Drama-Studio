import "./styles.css";
import { getLang, setLang, t, translateStaticDom } from "./i18n";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  API_COMMAND_POPOUT_LABEL,
  API_LOG_STORAGE_KEY,
  APP_VERSION,
  CUDA_DOWNLOAD_URL,
  ENGINE_PACKAGE_URL,
  ENGINE_PATH_STORAGE_KEY,
  FIRST_RUN_WIZARD_STORAGE_KEY,
  GITHUB_URL,
  NERUAL_DREMING_URL,
  NEUROPORT_URL,
  HIGGS_MODEL_ASSET_FILES,
  HIGGS_MODEL_PRESETS,
  HIGGS_MODEL_RESOLVE_BASE,
  HIGGS_REFERENCE_MAX_SECONDS,
  HIGGS_RECOMMENDED_MODEL,
  MINIMIZE_TO_TRAY_STORAGE_KEY,
  NVIDIA_DRIVER_URL,
  MODEL_PATH_STORAGE_KEY,
  RELEASES_URL,
  SPEAKER_PERSONA_STORAGE_KEY,
  STREAM_PLAYBACK_STORAGE_KEY,
  VC_REDIST_X64_URL,
  WHISPER_MODEL_PRESETS,
  WHISPER_MODEL_RESOLVE_BASE,
  WHISPER_MODEL_TREE_URL,
  WHISPER_RECOMMENDED_MODEL,
} from "./config";
import {
  base64ToBlobAsync,
  base64ToBytesAsync,
  bytesToBase64,
  concatenateWavResults,
  encodeMp3FromWav,
  parseWavPcm,
} from "./audio";
import { buildApiExample as buildApiExampleSnippet } from "./apiExamples";
import {
  convertChannels,
  shiftPitchAndTempo,
  trimEdgeSilence,
  frameCount,
  loadPauseTrimSettings,
  pcmToResult,
  resamplePcm,
  savePauseTrimSettings,
  shortenResultPauses,
  SPEED_MAX,
  SPEED_MIN,
  timeStretch,
} from "./audioEdit";
import type { PauseTrimSettings } from "./audioEdit";
import { initAudioEditor, openAudioEditor } from "./waveEditor";
import { createWavePanel } from "./wavePanel";
import { initEmotionBuilder, openEmotionBuilder } from "./emotionBuilder";
import type { WavePanel } from "./wavePanel";
import { decodeSubtitleBytes, formatTimestamp, parseSubtitles } from "./subtitles";
import type { SubtitleCue } from "./subtitles";
import { applyDictionary, DICTIONARY_STORAGE_KEY, loadDictionary, saveDictionary } from "./dictionary";
import { AUDIOBOOK_TARGET_LUFS, audiobookFileName, id3Tag, loadAudiobookExport, m4bMetadata, masterAudiobook, saveAudiobookExport } from "./audiobook";
import type { AudiobookExport, AudiobookFormat } from "./audiobook";
import type { DictionaryEntry } from "./dictionary";
import {
  DRAMA_DEFAULT_OPTIONS,
  DRAMA_DEVICE_STORAGE_KEY,
  DRAMA_LIBRARY_PATH_STORAGE_KEY,
  DRAMA_MODEL_PATH_STORAGE_KEY,
  DRAMA_SELECTED_VOICE_STORAGE_KEY,
  DRAMA_MAX_SECONDS_LIMIT,
  DRAMA_MAX_SPEAKERS,
  DRAMA_STEADY_TEMPERATURE,
  DRAMA_STEADY_TOP_P,
  characterLineHint,
  characterStyleHint,
  DRAMA_STYLE_PRESETS,
  loadDramaScene,
  newDramaCharacter,
  parseScene,
  saveDramaScene,
  sceneNameCandidates,
  splitChapter,
  speakerOfLine,
  comparableWords,
  wordCoverage,
  charsPerSecond,
  bookNameCandidates,
  findNarrator,
  markupBookText,
  setScriptLineSpeaker,
  sceneParts,
  mixedSceneParts,
  splitBookText,
  sceneText,
  shortHash,
  dramaOptionsFromRequest,
  dramaRequestOptions,
  getEngineKind,
  insertTagAtCursor,
  loadDramaOptions,
  loadDramaRemarks,
  loadDramaVoiceFiles,
  resetDramaRemarks,
  saveDramaOptions,
  saveDramaRemarks,
  saveDramaVoiceFiles,
  setEngineKind,
  toDramaTag,
  voiceNameFromPath,
} from "./drama";
import type {
  ChapterPiece,
  DramaCharacter,
  DramaOptions,
  DramaRemark,
  DramaScene,
  DramaVoiceFile,
  EngineKind,
  SceneReply,
} from "./drama";
import {
  cssVar,
  el,
  escapeHtml,
  formatBytes,
  formatDuration,
  formatTime,
  nextFrame,
  setProgress,
  setText,
} from "./dom";
import type {
  ApiExampleKind,
  ApiLogEntry,
  ApiLogEvent,
  ApiServerStatus,
  DownloadKind,
  DownloadEnvResult,
  DownloadProgressEvent,
  EngineDependencyDiagnostic,
  EngineDependencyStatus,
  EnvCheck,
  EnvDepKind,
  GenerationAudioChunkEvent,
  GenerationJob,
  GenerationMode,
  GenerationResult,
  HardwareSnapshot,
  HistoryEntry,
  LinePointerDrag,
  LiveStreamState,
  Mode,
  ModelListing,
  ModelStatusEvent,
  MultiLine,
  MultiSpeaker,
  ProgressEvent,
  RefPlayer,
  RefPreviewKind,
  SaveFormat,
  SpeakerPersona,
  StudioJobEvent,
  TranscriptResult,
  TranscriptSegment,
  TtsModelPreset,
  WhisperModelPreset,
  WavPcm,
} from "./types";
async function openExternalUrl(url: string): Promise<void> {
  try {
    await invoke("open_external_url", { url });
  } catch (e) {
    showToast(`Could not open link: ${e}`, "error");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════════════════

let currentMode: Mode = "tts";
let isGenerating = false;
let cloneRefPath: string | null = null;
let finishRefPath: string | null = null;
let clonePersonaId = "";
let finishPersonaId = "";
let cloneRefName = "";
let finishRefName = "";
let selectedGalleryPersonaId = "";
// Очистка голоса (вокал-сепарация референсов перед клонированием). Включена по
// умолчанию — чистый голос даёт лучший клон. Персистится между сессиями.
let voiceCleanEnabled = (localStorage.getItem("higgsAudio.voiceClean") ?? "true") !== "false";
let lastResult: GenerationResult | null = null;
const outputByMode: Partial<Record<Mode, GenerationResult>> = {};
let history: HistoryEntry[] = [];
let activeWork = 0;
let genStartedAt = 0;
let genTimer: number | null = null;
let cancelRequested = false;
let idCounter = 0;
let selectedSaveFormat: SaveFormat = (localStorage.getItem("higgsAudio.saveFormat") as SaveFormat) || "wav";
let currentProgressLabels: string[] = [];
let draggedLineId: string | null = null;
let linePointerDrag: LinePointerDrag | null = null;
let activeGenerationJob: GenerationJob | null = null;
const generationQueue: GenerationJob[] = [];
const externalStudioJobs = new Map<string, StudioJobEvent>();
let generationProgressPrefix = "Elapsed";
let activeDownloadKind: DownloadKind = "model";
let downloadActive = false;
let downloadPaused = false;
let activeDownloadFileLabel = "";
const apiLogs: ApiLogEntry[] = [];
let engineDiagnosticVisible = false;
let setupWizardOpen = false;
type DropzoneHandler = {
  selector: string;
  onFile: (path: string, name: string) => void | Promise<void>;
};
const dropzoneHandlers: DropzoneHandler[] = [];
type PreparedReferenceUpload = {
  path: string;
  fileName: string;
  durationSeconds: number;
  cropped: boolean;
};
let apiRunning = false;
let selectedApiExample: ApiExampleKind = "curl";
let liveStream: LiveStreamState | null = null;

// Settings state
let currentTheme = localStorage.getItem("higgsAudio.theme") || "dark";
let currentAccent = localStorage.getItem("higgsAudio.accent") || "teal";
let currentUiScale = parseInt(localStorage.getItem("higgsAudio.uiScale") ?? "100", 10);
let minimizeToTray = localStorage.getItem(MINIMIZE_TO_TRAY_STORAGE_KEY) === "true";
let streamPlayback = localStorage.getItem(STREAM_PLAYBACK_STORAGE_KEY) === "true";
let engineSupportsStreaming = false;

// Hardware state
let hardwarePollMs = parseInt(localStorage.getItem("higgsAudio.hardwarePollMs") ?? "1000", 10);
const hardwareHistory: HardwareSnapshot[] = [];
const hardwareHistoryLimit = 1200; // ~20 min at 1s/tick
const hardwareGraphPoints = 120;   // visible window width
let hardwareViewOffset = 0;        // 0 = live (right edge), positive = looking back
let hardwareFollowLive = true;     // when true, graph auto-scrolls to newest
let hardwareScrubDrag: { startX: number; startOffset: number } | null = null;
let hardwareHover: { x: number; idx: number } | null = null;

const audioPlayer = el<HTMLAudioElement>("#audio-player");

// Output playback volume (0..1). Applied to the final <audio> element and, for
// the live-stream preview, mixed into the PCM buffer in processLiveStreamAudio.
const OUTPUT_VOLUME_STORAGE_KEY = "higgsAudio.outputVolume";
let outputVolume = (() => {
  const saved = Number(localStorage.getItem(OUTPUT_VOLUME_STORAGE_KEY));
  return Number.isFinite(saved) && saved >= 0 && saved <= 1 ? saved : 1;
})();

let speakerPersonas: SpeakerPersona[] = [];
const multiSpeakers: MultiSpeaker[] = [];
const multiLines: MultiLine[] = [];
const refPlayers: Partial<Record<RefPreviewKind, RefPlayer>> = {};
const speakerSyncTimers = new Map<string, number>();

function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

function isGenerationMode(mode: Mode): mode is GenerationMode {
  return mode === "tts" || mode === "clone" || mode === "finish" || mode === "multi";
}

function cloneMultiSpeaker(speaker: MultiSpeaker): MultiSpeaker {
  return { ...speaker, cachePath: speaker.cachePath || "" };
}

function cloneMultiLine(line: MultiLine): MultiLine {
  return { ...line };
}

// ═══════════════════════════════════════════════════════════════════════════
// Toast
// ═══════════════════════════════════════════════════════════════════════════

let toastTimer: number | null = null;

function showToast(message: string, tone: "success" | "warning" | "error" = "success"): void {
  const toast = el<HTMLDivElement>("#toast");
  toast.textContent = t(message);
  toast.className = "toast";
  if (tone !== "success") toast.classList.add(tone);
  toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("show");
    toastTimer = null;
  }, 3200);
}

let lastEngineDiagnostic: EngineDependencyDiagnostic | null = null;

function dependencyLabel(dep: EngineDependencyStatus): string {
  return `${dep.pattern} · ${dep.category}`;
}

function renderDependencyList(container: HTMLElement, deps: EngineDependencyStatus[], statusClass: "missing" | "detected"): void {
  container.innerHTML = "";
  if (!deps.length) {
    const empty = document.createElement("div");
    empty.className = `engine-diagnostic-item ${statusClass}`;
    empty.innerHTML = `<strong>${statusClass === "missing" ? t("None") : t("Nothing detected yet")}</strong>`;
    container.appendChild(empty);
    return;
  }

  for (const dep of deps) {
    const item = document.createElement("div");
    item.className = `engine-diagnostic-item ${statusClass}`;
    item.innerHTML = `
      <strong>${escapeHtml(dependencyLabel(dep))}</strong>
      ${dep.foundPath ? `<code>${escapeHtml(dep.foundPath)}</code>` : `<span>${escapeHtml(dep.fix)}</span>`}
    `;
    container.appendChild(item);
  }
}

function engineDiagnosticText(diagnostic: EngineDependencyDiagnostic): string {
  const lines = [
    "Higgs Audio v3 Studio Engine Diagnostics",
    "",
    `App version: ${APP_VERSION}`,
    `Platform: ${diagnostic.platform}`,
    `Engine path: ${diagnostic.enginePath || "(none)"}`,
  ];

  if (diagnostic.rawError) {
    lines.push("", "Raw loader error:", diagnostic.rawError);
  }

  lines.push("", "Missing required DLLs:");
  if (diagnostic.missing.length) {
    for (const dep of diagnostic.missing) {
      lines.push(`- ${dep.pattern} (${dep.category})`);
      lines.push(`  Fix: ${dep.fix}`);
    }
  } else {
    lines.push("- none");
  }

  lines.push("", "Detected DLLs:");
  if (diagnostic.detected.length) {
    for (const dep of diagnostic.detected) {
      lines.push(`- ${dep.pattern}: ${dep.foundPath || "found"}`);
    }
  } else {
    lines.push("- none");
  }

  if (diagnostic.optionalMissing.length) {
    lines.push("", "Optional/informational checks not found:");
    for (const dep of diagnostic.optionalMissing) {
      lines.push(`- ${dep.pattern} (${dep.category})`);
    }
  }

  lines.push("", "Search paths checked:");
  for (const dir of diagnostic.searchDirs) lines.push(`- ${dir}`);

  lines.push("", "Repair links:");
  lines.push(`- Higgs engine DLL package: ${ENGINE_PACKAGE_URL}`);
  lines.push(`- NVIDIA driver: ${NVIDIA_DRIVER_URL}`);
  lines.push(`- CUDA Toolkit 13.x: ${CUDA_DOWNLOAD_URL}`);
  lines.push(`- VC++ Redistributable x64: ${VC_REDIST_X64_URL}`);

  return lines.join("\n");
}

function showEngineDiagnosticModal(diagnostic: EngineDependencyDiagnostic): void {
  lastEngineDiagnostic = diagnostic;
  hideSetupWizard();
  engineDiagnosticVisible = true;
  const modal = el<HTMLDivElement>("#engine-diagnostic-modal");
  const missingCount = diagnostic.missing.length;
  setText(
    "#engine-diagnostic-summary",
    missingCount
      ? `The engine DLL was found, but Windows cannot load ${missingCount} required dependency${missingCount === 1 ? "" : "ies"}. Click Download Engine DLLs or install the missing runtime(s), restart the app, then load the engine again.`
      : diagnostic.rawError
        ? "The known dependency check passed, but Windows still rejected the engine DLL. Copy diagnostics and include them in the GitHub issue."
        : "The engine dependency check passed.",
  );
  setText("#engine-diagnostic-subtitle", diagnostic.enginePath || "No engine path");
  renderDependencyList(el("#engine-diagnostic-missing"), diagnostic.missing, "missing");
  renderDependencyList(el("#engine-diagnostic-detected"), diagnostic.detected, "detected");
  el<HTMLPreElement>("#engine-diagnostic-paths").textContent = diagnostic.searchDirs.join("\n");
  modal.classList.remove("hidden");
}

async function diagnoseEngineForPath(libraryPath?: string): Promise<EngineDependencyDiagnostic | null> {
  try {
    return await invoke<EngineDependencyDiagnostic>("diagnose_engine_load", { libraryPath });
  } catch {
    return null;
  }
}

function initEngineDiagnosticModal(): void {
  const modal = el<HTMLDivElement>("#engine-diagnostic-modal");
  const close = () => {
    modal.classList.add("hidden");
    engineDiagnosticVisible = false;
  };
  el("#engine-diagnostic-close").addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  el("#engine-diagnostic-copy").addEventListener("click", () => {
    if (!lastEngineDiagnostic) return;
    void copyText(engineDiagnosticText(lastEngineDiagnostic), "Engine diagnostics");
  });
  // Драйвер DLL-кой не ставится — открываем сайт NVIDIA. CUDA и VC++ качаем
  // прямо из приложения (авто-закачка) вместо отправки к тяжёлым инсталляторам.
  el("#engine-diagnostic-driver").addEventListener("click", () => openExternalUrl(NVIDIA_DRIVER_URL));
  el("#engine-diagnostic-cuda").addEventListener("click", async () => {
    await startEnvDepDownload("cuda");
    const diag = await diagnoseEngineForPath(lastEngineDiagnostic?.enginePath || undefined);
    if (diag) showEngineDiagnosticModal(diag);
  });
  el("#engine-diagnostic-vc").addEventListener("click", async () => {
    await startEnvDepDownload("vcruntime");
    const diag = await diagnoseEngineForPath(lastEngineDiagnostic?.enginePath || undefined);
    if (diag) showEngineDiagnosticModal(diag);
  });
}

function hideSetupWizard(persist = false): void {
  const modal = document.querySelector<HTMLDivElement>("#setup-wizard-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  setupWizardOpen = false;
  if (persist) localStorage.setItem(FIRST_RUN_WIZARD_STORAGE_KEY, "true");
}

function setSetupCheck(
  rowId: string,
  iconId: string,
  detailId: string,
  state: "ready" | "missing" | "optional",
  icon: string,
  detail: string,
): void {
  const row = el<HTMLElement>(rowId);
  row.classList.toggle("ready", state === "ready");
  row.classList.toggle("missing", state === "missing");
  row.classList.toggle("optional", state === "optional");
  setText(iconId, icon);
  setText(detailId, detail);
}

// Последний результат env_check — используется кнопками скачивания системных
// библиотек, чтобы не перезапрашивать перед стартом.
let lastEnvCheck: EnvCheck | null = null;

/// Обновить три строки блока «Системные библиотеки» (CUDA / VC++ / драйвер).
async function refreshSystemLibsState(): Promise<void> {
  let env: EnvCheck | null = null;
  try {
    env = await invoke<EnvCheck>("env_check");
  } catch {
    env = null;
  }
  lastEnvCheck = env;
  const ru = getLang() === "ru";

  // CUDA runtime
  const cudaOk = Boolean(env?.cuda.ok);
  const cudaMb = env?.cuda.downloadMb ?? 0;
  setSetupCheck(
    "#setup-check-cuda",
    "#setup-cuda-icon",
    "#setup-cuda-detail",
    cudaOk ? "ready" : "missing",
    cudaOk ? "✓" : "!",
    cudaOk
      ? (ru ? "Найдены cudart/cublas/cublasLt 13.x." : "Found cudart/cublas/cublasLt 13.x.")
      : (ru
          ? `Не хватает: ${(env?.cuda.missing ?? []).join(", ") || "CUDA runtime DLL"}.`
          : `Missing: ${(env?.cuda.missing ?? []).join(", ") || "CUDA runtime DLLs"}.`),
  );
  const cudaBtn = el<HTMLButtonElement>("#setup-wizard-download-cuda");
  cudaBtn.textContent = cudaOk
    ? (ru ? "Готово" : "Ready")
    : (ru ? `Скачать ~${cudaMb} МБ` : `Download ~${cudaMb} MB`);
  cudaBtn.disabled = cudaOk;

  // VC++ runtime
  const vcOk = Boolean(env?.vcruntime.ok);
  const vcMb = env?.vcruntime.downloadMb ?? 0;
  setSetupCheck(
    "#setup-check-vcruntime",
    "#setup-vcruntime-icon",
    "#setup-vcruntime-detail",
    vcOk ? "ready" : "missing",
    vcOk ? "✓" : "!",
    vcOk
      ? (ru ? "Найдены MSVCP140/VCRUNTIME140/VCOMP140." : "Found MSVCP140/VCRUNTIME140/VCOMP140.")
      : (ru
          ? `Не хватает: ${(env?.vcruntime.missing ?? []).join(", ") || "VC++ runtime DLL"}.`
          : `Missing: ${(env?.vcruntime.missing ?? []).join(", ") || "VC++ runtime DLLs"}.`),
  );
  const vcBtn = el<HTMLButtonElement>("#setup-wizard-download-vcruntime");
  vcBtn.textContent = vcOk
    ? (ru ? "Готово" : "Ready")
    : (ru ? `Скачать ~${vcMb} МБ` : `Download ~${vcMb} MB`);
  vcBtn.disabled = vcOk;

  // Драйвер NVIDIA (скачать DLL-кой нельзя — только открыть сайт)
  const driverOk = Boolean(env?.driver.ok);
  const driverVer = env?.driver.version ?? "";
  setSetupCheck(
    "#setup-check-driver",
    "#setup-driver-icon",
    "#setup-driver-detail",
    driverOk ? "ready" : "missing",
    driverOk ? "✓" : "!",
    driverOk
      ? (ru ? `Установлен${driverVer ? `, версия ${driverVer}` : ""}.` : `Installed${driverVer ? `, version ${driverVer}` : ""}.`)
      : (ru
          ? "Не обнаружен. Установите драйвер NVIDIA — это единственное, что ставится вручную."
          : "Not detected. Install the NVIDIA driver — the one thing you install manually."),
  );
}

async function refreshSetupWizardState(): Promise<void> {
  await refreshSystemLibsState();
  let engineStatus: ModelStatusEvent | null = null;
  try {
    engineStatus = await invoke<ModelStatusEvent>("engine_status");
  } catch {
    engineStatus = null;
  }

  const savedEnginePath = localStorage.getItem(ENGINE_PATH_STORAGE_KEY) || "";
  const bundledEnginePath = await invoke<string | null>("bundled_engine_path").catch(() => null);
  let enginePath = savedEnginePath || bundledEnginePath || "";
  let engineReady = Boolean(engineStatus?.engineLoaded);
  let enginePathValid = Boolean(engineStatus?.engineLoaded);
  let engineDetail = engineStatus?.engineLoaded
    ? t("Loaded and ready")
    : enginePath
      ? `${t("Found:")} ${enginePath}`
      : t("Not found. Download the engine package or browse to audiocpp_engine.dll.");
  if (!engineReady && enginePath) {
    let diagnostic = await diagnoseEngineForPath(enginePath);
    if (!diagnostic && savedEnginePath && bundledEnginePath) {
      localStorage.removeItem(ENGINE_PATH_STORAGE_KEY);
      enginePath = bundledEnginePath;
      diagnostic = await diagnoseEngineForPath(enginePath);
    }
    enginePathValid = Boolean(diagnostic);
    engineReady = Boolean(diagnostic?.ok);
    if (!diagnostic && savedEnginePath) {
      engineDetail = `${t("Saved engine path not found:")} ${savedEnginePath}`;
    } else if (diagnostic?.ok) {
      engineDetail = `${t("Found:")} ${enginePath}`;
    }
    if (diagnostic && !diagnostic.ok) {
      engineDetail = getLang() === "ru"
        ? `Движок найден, но не хватает ${diagnostic.missing.length} системных DLL.`
        : `Found engine, but missing ${diagnostic.missing.length} required runtime DLL${diagnostic.missing.length === 1 ? "" : "s"}.`;
    }
  }
  setSetupCheck(
    "#setup-check-engine",
    "#setup-engine-icon",
    "#setup-engine-detail",
    engineReady ? "ready" : "missing",
    engineReady ? "✓" : "!",
    engineDetail,
  );
  el<HTMLButtonElement>("#setup-wizard-load-engine").disabled = !enginePathValid || Boolean(engineStatus?.engineLoaded);

  let models: ModelListing[] = [];
  try {
    models = await invoke<ModelListing[]>("list_models");
  } catch {
    models = [];
  }
  const modelSelect = el<HTMLSelectElement>("#model-select");
  let selectedModel = modelSelect.value || localStorage.getItem(MODEL_PATH_STORAGE_KEY) || "";
  if (!selectedModel && models.length > 0) {
    const recommended = [...models].sort((a, b) => modelSortRank(a) - modelSortRank(b))[0];
    selectedModel = recommended.path;
    localStorage.setItem(MODEL_PATH_STORAGE_KEY, selectedModel);
    addLocalModelOption(selectedModel, modelDisplayName(recommended));
  }
  const modelReady = Boolean(engineStatus?.modelLoaded || selectedModel || models.length > 0);
  const modelDetail = engineStatus?.modelLoaded
    ? t("Loaded and ready")
    : selectedModel
      ? `${t("Selected:")} ${selectedModel}`
      : models.length > 0
        ? (getLang() === "ru"
            ? `Найдено папок моделей: ${models.length}. Выберите или загрузите.`
            : `${models.length} model folder${models.length === 1 ? "" : "s"} found. Select or load one.`)
        : t("No Higgs model folder found. Download a model folder or browse to one.");
  setSetupCheck(
    "#setup-check-model",
    "#setup-model-icon",
    "#setup-model-detail",
    modelReady ? "ready" : "missing",
    modelReady ? "✓" : "!",
    modelDetail,
  );
  el<HTMLButtonElement>("#setup-wizard-load-model").disabled = !selectedModel || Boolean(engineStatus?.modelLoaded);

  const whisperPath = localStorage.getItem("higgsAudio.whisperModel") || "";
  setSetupCheck(
    "#setup-check-whisper",
    "#setup-whisper-icon",
    "#setup-whisper-detail",
    whisperPath ? "ready" : "optional",
    whisperPath ? "✓" : "i",
    whisperPath ? `${t("Selected:")} ${whisperPath}` : t("Optional. Download only if you want auto-transcription."),
  );

  const readyCount = Number(engineReady) + Number(modelReady);
  setText(
    "#setup-wizard-summary",
    readyCount === 2
      ? t("Core setup found. You can load anything not already loaded, or close this wizard.")
      : t("Some core setup files are missing. Use Browse if you already have them, or Download to fetch them."),
  );
}

async function maybeShowSetupWizard(): Promise<void> {
  const modal = document.querySelector<HTMLDivElement>("#setup-wizard-modal");
  const diagnostic = document.querySelector<HTMLDivElement>("#engine-diagnostic-modal");
  if (!modal) return;
  // The wizard checks Higgs files only; with Drama 3 it would nag about a missing engine.
  if (activeEngine === "drama") return;
  if (localStorage.getItem(FIRST_RUN_WIZARD_STORAGE_KEY) === "true") return;
  if (setupWizardOpen) return;
  if (engineDiagnosticVisible || (diagnostic && !diagnostic.classList.contains("hidden"))) return;
  await refreshSetupWizardState();
  modal.classList.remove("hidden");
  setupWizardOpen = true;
}

function initSetupWizard(): void {
  const modal = el<HTMLDivElement>("#setup-wizard-modal");
  const close = () => hideSetupWizard(true);
  el("#setup-wizard-close").addEventListener("click", close);
  el("#setup-wizard-skip").addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  el("#setup-wizard-refresh").addEventListener("click", () => {
    void refreshSetupWizardState();
  });
  el("#setup-wizard-browse-engine").addEventListener("click", () => {
    void doBrowseEngine().then(() => refreshSetupWizardState());
  });
  el("#setup-wizard-download-engine").addEventListener("click", () => {
    hideSetupWizard(false);
    el<HTMLButtonElement>("#download-engine-btn").click();
  });
  el("#setup-wizard-load-engine").addEventListener("click", () => {
    void doLoadEngine().then(() => refreshSetupWizardState());
  });
  el("#setup-wizard-browse-model").addEventListener("click", () => {
    void doBrowseModel().then(() => refreshSetupWizardState());
  });
  el("#setup-wizard-download-model").addEventListener("click", () => {
    hideSetupWizard(false);
    el<HTMLButtonElement>("#download-trigger").click();
  });
  el("#setup-wizard-load-model").addEventListener("click", () => {
    void doLoadModel().then(() => refreshSetupWizardState());
  });
  el("#setup-wizard-download-whisper").addEventListener("click", () => {
    hideSetupWizard(false);
    el<HTMLButtonElement>("#whisper-download-trigger").click();
  });
  el("#setup-wizard-download-cuda").addEventListener("click", () => {
    void startEnvDepDownload("cuda");
  });
  el("#setup-wizard-download-vcruntime").addEventListener("click", () => {
    void startEnvDepDownload("vcruntime");
  });
  el("#setup-wizard-open-driver").addEventListener("click", () => openExternalUrl(NVIDIA_DRIVER_URL));
  el("#setup-wizard-continue").addEventListener("click", close);
}

/// Скачать недостающие системные DLL класса kind через ту же прогресс-машину
/// (download-progress), что и модели. По завершении — повторный env_check и
/// обновление строк блока «Системные библиотеки».
async function startEnvDepDownload(kind: EnvDepKind): Promise<void> {
  if (downloadActive) {
    showToast("A download is already running. Use Pause, Resume, or Stop.", "warning");
    return;
  }
  const ru = getLang() === "ru";
  const label = kind === "cuda" ? "CUDA runtime" : "VC++ runtime";
  activeDownloadKind = kind;
  downloadActive = true;
  downloadPaused = false;
  const progressContainer = document.querySelector<HTMLElement>("#download-progress-container");
  progressContainer?.classList.remove("hidden");
  setProgress("#download-progress-bar", 0, 1);
  setText("#download-size-text", "0 / 0");
  setText("#download-speed-text", "0 MB/s");
  activeDownloadFileLabel = label;
  updateDownloadIndicator("running");
  try {
    const result = await invoke<DownloadEnvResult>("download_env_deps", { kind });
    if (result.ok) {
      showToast(ru ? `${label}: библиотеки установлены` : `${label}: libraries installed`);
    } else {
      showToast(
        ru
          ? `${label}: не хватает ${result.missing.join(", ")}`
          : `${label}: still missing ${result.missing.join(", ")}`,
        "warning",
      );
    }
  } catch (e) {
    const message = String(e);
    if (message.toLowerCase().includes("cancel")) {
      showToast("Download stopped", "warning");
    } else {
      showToast(`Download failed: ${e}`, "error");
    }
  } finally {
    downloadActive = false;
    downloadPaused = false;
    activeDownloadFileLabel = "";
    updateDownloadIndicator("complete");
    await refreshSystemLibsState();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Settings system
// ═══════════════════════════════════════════════════════════════════════════

function applyTheme(theme: string): void {
  currentTheme = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", currentTheme);
  localStorage.setItem("higgsAudio.theme", currentTheme);
  el<HTMLButtonElement>("#theme-dark").classList.toggle("active", currentTheme === "dark");
  el<HTMLButtonElement>("#theme-light").classList.toggle("active", currentTheme === "light");
  requestAnimationFrame(() => {
    drawHardwareGraph();
    drawWaveform();
    redrawAllRefPreviews();
  });
}

function applyAccent(accent: string): void {
  const allowed = ["teal", "blue", "green", "red", "yellow"];
  currentAccent = allowed.includes(accent) ? accent : "teal";
  document.documentElement.setAttribute("data-accent", currentAccent);
  localStorage.setItem("higgsAudio.accent", currentAccent);
  for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-accent-choice]")) {
    btn.classList.toggle("active", btn.dataset.accentChoice === currentAccent);
  }
  requestAnimationFrame(() => {
    drawHardwareGraph();
    drawWaveform();
    redrawAllRefPreviews();
  });
}

function applyUiScale(percent: number): void {
  currentUiScale = Math.min(115, Math.max(90, percent || 100));
  document.documentElement.style.setProperty("--ui-scale", (currentUiScale / 100).toFixed(2));
  localStorage.setItem("higgsAudio.uiScale", String(currentUiScale));
  el<HTMLInputElement>("#ui-scale").value = String(currentUiScale);
  setText("#ui-scale-label", `${currentUiScale}%`);
  requestAnimationFrame(() => {
    drawHardwareGraph();
    drawWaveform();
  });
}

function applySavedVisualShell(): void {
  const theme = localStorage.getItem("higgsAudio.theme") === "light" ? "light" : "dark";
  const accent = localStorage.getItem("higgsAudio.accent") || "teal";
  const uiScale = parseInt(localStorage.getItem("higgsAudio.uiScale") ?? "100", 10);
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-accent", ["teal", "blue", "green", "red", "yellow"].includes(accent) ? accent : "teal");
  document.documentElement.style.setProperty("--ui-scale", (Math.min(115, Math.max(90, uiScale || 100)) / 100).toFixed(2));
}

let activeTip: HTMLElement | null = null;

function positionTooltip(): void {
  if (!activeTip) return;
  const layer = el<HTMLDivElement>("#tooltip-layer");
  const targetRect = activeTip.getBoundingClientRect();
  const layerRect = layer.getBoundingClientRect();
  const margin = 12;
  const gap = 10;
  const left = Math.min(
    window.innerWidth - layerRect.width - margin,
    Math.max(margin, targetRect.left + targetRect.width / 2 - layerRect.width / 2),
  );
  let top = targetRect.bottom + gap;
  if (top + layerRect.height > window.innerHeight - margin) {
    top = targetRect.top - layerRect.height - gap;
  }
  if (top < margin) top = margin;
  layer.style.left = `${left}px`;
  layer.style.top = `${top}px`;
}

function showTooltip(trigger: HTMLElement): void {
  const text = trigger.dataset.tip?.trim();
  if (!text) return;
  activeTip = trigger;
  const layer = el<HTMLDivElement>("#tooltip-layer");
  layer.textContent = text;
  layer.classList.remove("hidden", "visible");
  requestAnimationFrame(() => {
    positionTooltip();
    layer.classList.add("visible");
  });
}

function hideTooltip(trigger?: HTMLElement): void {
  if (trigger && activeTip !== trigger) return;
  activeTip = null;
  const layer = el<HTMLDivElement>("#tooltip-layer");
  layer.classList.remove("visible");
  layer.classList.add("hidden");
}

function initTooltips(): void {
  document.addEventListener("pointerover", (event) => {
    const trigger = (event.target as Element | null)?.closest<HTMLElement>(".tip[data-tip]");
    if (trigger) showTooltip(trigger);
  });
  document.addEventListener("pointerout", (event) => {
    const trigger = (event.target as Element | null)?.closest<HTMLElement>(".tip[data-tip]");
    if (trigger && !trigger.contains(event.relatedTarget as Node | null)) hideTooltip(trigger);
  });
  document.addEventListener("focusin", (event) => {
    const trigger = (event.target as Element | null)?.closest<HTMLElement>(".tip[data-tip]");
    if (trigger) showTooltip(trigger);
  });
  document.addEventListener("focusout", (event) => {
    const trigger = (event.target as Element | null)?.closest<HTMLElement>(".tip[data-tip]");
    if (trigger) hideTooltip(trigger);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideTooltip();
  });
  document.addEventListener("scroll", () => {
    if (activeTip) positionTooltip();
  }, true);
  window.addEventListener("resize", () => {
    if (activeTip) positionTooltip();
  });
}

function initSettings(): void {
  const button = el<HTMLButtonElement>("#settings-button");
  const popover = el<HTMLDivElement>("#settings-popover");
  const setOpen = (open: boolean) => {
    popover.hidden = !open;
    button.classList.toggle("active", open);
  };
  button.addEventListener("click", (e) => { e.stopPropagation(); setOpen(popover.hidden); });
  const settingsClose = document.querySelector<HTMLElement>("#settings-close");
  if (settingsClose) settingsClose.addEventListener("click", (e) => { e.stopPropagation(); setOpen(false); });
  document.addEventListener("pointerdown", (event) => {
    const target = event.target as Node;
    if (!popover.hidden && !popover.contains(target) && !button.contains(target)) {
      setOpen(false);
    }
  });

  const langRu = el<HTMLButtonElement>("#lang-ru");
  const langEn = el<HTMLButtonElement>("#lang-en");
  langRu.classList.toggle("active", getLang() === "ru");
  langEn.classList.toggle("active", getLang() === "en");
  langRu.addEventListener("click", () => { if (getLang() !== "ru") setLang("ru"); });
  langEn.addEventListener("click", () => { if (getLang() !== "en") setLang("en"); });

  el("#theme-dark").addEventListener("click", () => applyTheme("dark"));
  el("#theme-light").addEventListener("click", () => applyTheme("light"));
  for (const accentBtn of document.querySelectorAll<HTMLButtonElement>("[data-accent-choice]")) {
    accentBtn.addEventListener("click", () => applyAccent(accentBtn.dataset.accentChoice || "teal"));
  }
  el<HTMLInputElement>("#ui-scale").addEventListener("input", (event) => {
    applyUiScale(parseInt((event.target as HTMLInputElement).value, 10));
  });
  const streamToggle = el<HTMLInputElement>("#stream-playback");
  streamToggle.checked = streamPlayback;
  streamToggle.addEventListener("change", () => {
    streamPlayback = streamToggle.checked;
    localStorage.setItem(STREAM_PLAYBACK_STORAGE_KEY, String(streamPlayback));
    if (streamPlayback && !engineSupportsStreaming) {
      showToast("Streaming needs an updated Higgs engine DLL; current DLL falls back to normal generation.", "warning");
    }
  });
  const trayToggle = el<HTMLInputElement>("#minimize-to-tray");
  trayToggle.checked = minimizeToTray;
  trayToggle.addEventListener("change", () => {
    minimizeToTray = trayToggle.checked;
    localStorage.setItem(MINIMIZE_TO_TRAY_STORAGE_KEY, String(minimizeToTray));
    void invoke("set_minimize_to_tray", { enabled: minimizeToTray }).catch((error) => {
      showToast(`Tray setting failed: ${String(error)}`, "error");
    });
  });
  el<HTMLButtonElement>("#quit-app-btn").addEventListener("click", () => {
    clearApiLogsForFreshSession();
    void invoke("quit_app").catch((error) => {
      showToast(`Quit failed: ${String(error)}`, "error");
    });
  });

  applyAccent(currentAccent);
  applyTheme(currentTheme);
  applyUiScale(currentUiScale);
  void invoke("set_minimize_to_tray", { enabled: minimizeToTray }).catch(() => {});
}

function initExternalLinks(): void {
  setText("#version-link", `v${APP_VERSION}`);
  el("#github-link").addEventListener("click", () => openExternalUrl(GITHUB_URL));
  el("#version-link").addEventListener("click", () => openExternalUrl(RELEASES_URL));
  const nerual = document.querySelector<HTMLButtonElement>("#nerual-link");
  if (nerual) nerual.addEventListener("click", () => openExternalUrl(NERUAL_DREMING_URL));
  const neuroport = document.querySelector<HTMLButtonElement>("#neuroport-link");
  if (neuroport) neuroport.addEventListener("click", () => openExternalUrl(NEUROPORT_URL));
}

function ttsPresetUrl(preset: TtsModelPreset): string {
  return `${HIGGS_MODEL_RESOLVE_BASE}/models/${preset.folder}/${preset.filename}`;
}

function ttsPresetPackageFiles(preset: TtsModelPreset): string[] {
  return [preset.filename, ...HIGGS_MODEL_ASSET_FILES];
}

function ttsPresetPackageEntries(preset: TtsModelPreset): Array<{ url: string; destDir: string; filename: string }> {
  return ttsPresetPackageFiles(preset).map((filename) => ({
    url: `${HIGGS_MODEL_RESOLVE_BASE}/models/${preset.folder}/${filename}`,
    destDir: `models/${preset.folder}`,
    filename,
  }));
}

function ttsPresetFromModelDownloadUrl(url: string): TtsModelPreset | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/models\/([^/]+)\/([^/]+)$/);
    if (!match) return null;
    const folder = decodeURIComponent(match[1]);
    const filename = decodeURIComponent(match[2]);
    return HIGGS_MODEL_PRESETS.find((preset) =>
      preset.folder === folder && ttsPresetPackageFiles(preset).includes(filename)) || null;
  } catch {
    return null;
  }
}

function ttsPresetById(id: string | null | undefined): TtsModelPreset {
  return HIGGS_MODEL_PRESETS.find((preset) => preset.id === id) ||
    HIGGS_MODEL_PRESETS.find((preset) => preset.id === HIGGS_RECOMMENDED_MODEL) ||
    HIGGS_MODEL_PRESETS[0];
}

function inferTtsPresetFromModelSelection(): TtsModelPreset {
  const select = el<HTMLSelectElement>("#model-select");
  const selectedText = select.selectedOptions[0]?.textContent || "";
  const value = select.value || "";
  const haystack = `${selectedText} ${value}`.toLowerCase();
  if (haystack.includes("q6_k") || haystack.includes("q6-k")) return ttsPresetById("higgs-q6_k");
  if (haystack.includes("q5_k") || haystack.includes("q5-k")) return ttsPresetById("higgs-q5_k");
  if (haystack.includes("q4_k") || haystack.includes("q4-k")) return ttsPresetById("higgs-q4_k_m");
  if (haystack.includes("bf16")) return ttsPresetById("higgs-bf16");
  if (haystack.includes("q8_0") || haystack.includes("q8")) return ttsPresetById("higgs-q8_0");
  return ttsPresetById(localStorage.getItem("higgsAudio.ttsDownloadPreset") || HIGGS_RECOMMENDED_MODEL);
}

function populateTtsDownloadPresetSelect(): void {
  const select = el<HTMLSelectElement>("#download-model-preset");
  select.innerHTML = "";
  for (const preset of HIGGS_MODEL_PRESETS) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = `${preset.recommended ? "★ " : ""}${preset.label} · ${preset.size}`;
    option.title = ttsPresetUrl(preset);
    select.appendChild(option);
  }
}

function setTtsDownloadPreset(preset: TtsModelPreset, syncUrl = true): void {
  const select = el<HTMLSelectElement>("#download-model-preset");
  select.value = preset.id;
  localStorage.setItem("higgsAudio.ttsDownloadPreset", preset.id);
  if (syncUrl) {
    const input = el<HTMLInputElement>("#download-url-input");
    input.value = ttsPresetUrl(preset);
    input.title = `${preset.label} | ${preset.filename}`;
  }
}

function setWhisperModelPath(path: string): void {
  el<HTMLInputElement>("#whisper-model-path").value = path;
  localStorage.setItem("higgsAudio.whisperModel", path);
}

// Destination folder (under app-root/models) where a preset's ONNX files land.
function whisperPresetDestDir(preset: WhisperModelPreset): string {
  return `models/parakeet/${preset.folder}`;
}

// The files a preset downloads, as {url, filename} pairs. The whole set is
// fetched — a lone encoder without vocab.txt fails to load.
function whisperPresetEntries(preset: WhisperModelPreset): Array<{ url: string; filename: string }> {
  return preset.files.map((filename) => ({
    url: `${WHISPER_MODEL_RESOLVE_BASE}/${filename}`,
    filename,
  }));
}

function selectedWhisperPreset(): WhisperModelPreset {
  const selectedId = el<HTMLSelectElement>("#whisper-model-select").value || WHISPER_RECOMMENDED_MODEL;
  return WHISPER_MODEL_PRESETS.find((preset) => preset.id === selectedId) || WHISPER_MODEL_PRESETS[0];
}

function populateWhisperModelSelect(): void {
  const select = el<HTMLSelectElement>("#whisper-model-select");
  const savedPreset = localStorage.getItem("higgsAudio.whisperPreset") || WHISPER_RECOMMENDED_MODEL;
  select.innerHTML = "";
  for (const preset of WHISPER_MODEL_PRESETS) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = `${preset.recommended ? "★ " : ""}${preset.label} · ${preset.size}`;
    option.title = `${preset.folder}/ (${preset.files.length} files)`;
    select.appendChild(option);
  }
  select.value = WHISPER_MODEL_PRESETS.some((preset) => preset.id === savedPreset) ? savedPreset : WHISPER_RECOMMENDED_MODEL;
}

function initWhisperPanel(): void {
  const whisperInput = el<HTMLInputElement>("#whisper-model-path");
  const whisperSelect = el<HTMLSelectElement>("#whisper-model-select");
  populateWhisperModelSelect();
  whisperInput.value = localStorage.getItem("higgsAudio.whisperModel") || "";
  whisperInput.addEventListener("change", () => setWhisperModelPath(whisperInput.value.trim()));
  whisperSelect.addEventListener("change", () => {
    localStorage.setItem("higgsAudio.whisperPreset", whisperSelect.value);
  });
  el("#whisper-browse-btn").addEventListener("click", async () => {
    // The Parakeet model is now a folder of ONNX files, so pick a directory.
    const selected = await open({ directory: true });
    if (selected) setWhisperModelPath(Array.isArray(selected) ? selected[0] : selected);
  });
  el("#whisper-models-link").addEventListener("click", () => openExternalUrl(WHISPER_MODEL_TREE_URL));
}

// ═══════════════════════════════════════════════════════════════════════════
// Local API page
// ═══════════════════════════════════════════════════════════════════════════

function generateApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function copyText(text: string, label: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  showToast(`${label} copied`);
}

function getApiBaseUrl(): string {
  return el<HTMLInputElement>("#api-base-url").value.trim() || "http://127.0.0.1:7077/v1";
}

function getApiRootUrl(): string {
  return getApiBaseUrl().replace(/\/v1\/?$/, "");
}

function getApiKeyForExample(): string {
  return el<HTMLInputElement>("#api-key").value.trim() || "YOUR_API_KEY";
}

function apiSpeakerPayload(): Array<{ id: string; name: string; refPath: string; refText: string; cachePath: string; normalize: boolean }> {
  return speakerPersonas.map((persona) => ({
    id: persona.id,
    name: persona.name,
    refPath: persona.refPath,
    refText: persona.refText,
    cachePath: persona.cachePath,
    normalize: persona.normalize,
  }));
}

function buildCurrentApiExample(kind: ApiExampleKind): string {
  const firstSpeaker = speakerPersonas[0];
  const speakerVoice = firstSpeaker ? `speaker:${firstSpeaker.id}` : "speaker:YOUR_SPEAKER_ID";
  return buildApiExampleSnippet(kind, {
    base: getApiBaseUrl(),
    root: getApiRootUrl(),
    key: getApiKeyForExample(),
    speakerVoice,
  });
}

function renderApiExample(): void {
  const code = el<HTMLElement>("#api-example-code");
  code.textContent = buildCurrentApiExample(selectedApiExample);
  for (const tab of document.querySelectorAll<HTMLButtonElement>("[data-api-example]")) {
    const active = tab.dataset.apiExample === selectedApiExample;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  }
}

function updateApiBaseUrl(): void {
  const host = el<HTMLInputElement>("#api-host").value.trim() || "127.0.0.1";
  const port = parseInt(el<HTMLInputElement>("#api-port").value, 10) || 7077;
  el<HTMLInputElement>("#api-base-url").value = `http://${host}:${port}/v1`;
  renderApiExample();
}

function setApiVisualStatus(status: "stopped" | "starting" | "running" | "error", text?: string): void {
  const button = el<HTMLButtonElement>("#api-status-button");
  button.classList.remove("stopped", "starting", "running", "error");
  button.classList.add(status);
  button.classList.toggle("hidden", status === "stopped" && currentMode !== "api");
  button.title = text || `API server ${status}`;
  setText("#api-status-text", text || status[0].toUpperCase() + status.slice(1));
  el<HTMLButtonElement>("#api-start-btn").disabled = status === "running" || status === "starting";
  el<HTMLButtonElement>("#api-stop-btn").disabled = status !== "running";
}

function appendApiLog(event: Partial<ApiLogEvent> & { message: string }): void {
  apiLogs.push({
    time: Date.now(),
    level: event.level || "info",
    kind: event.kind || "server",
    method: event.method || "",
    route: event.route || "",
    status: event.status || 0,
    latencyMs: event.latencyMs || 0,
    message: event.message,
    jobId: event.jobId || "",
  });
  while (apiLogs.length > 300) apiLogs.shift();
  persistApiLogs();
  renderApiLogs();
}

function loadApiLogsFromStorage(): void {
  try {
    const parsed = JSON.parse(localStorage.getItem(API_LOG_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return;
    apiLogs.splice(0, apiLogs.length, ...parsed.map((entry) => ({
      time: Number(entry.time || Date.now()),
      level: entry.level === "warn" || entry.level === "error" ? entry.level : "info",
      kind: String(entry.kind || "server"),
      method: String(entry.method || ""),
      route: String(entry.route || ""),
      status: Number(entry.status || 0),
      latencyMs: Number(entry.latencyMs || entry.latency_ms || 0),
      message: String(entry.message || ""),
      jobId: String(entry.jobId || entry.job_id || ""),
    })).filter((entry) => entry.message).slice(-300));
  } catch {
    apiLogs.splice(0, apiLogs.length);
  }
}

function persistApiLogs(): void {
  try {
    localStorage.setItem(API_LOG_STORAGE_KEY, JSON.stringify(apiLogs.slice(-300)));
  } catch {
    // Best-effort cache for the detachable console.
  }
}

function clearApiLogsForFreshSession(): void {
  apiLogs.splice(0, apiLogs.length);
  try {
    localStorage.removeItem(API_LOG_STORAGE_KEY);
  } catch {
    // Best-effort cleanup only.
  }
}

function apiLogVisible(entry: ApiLogEntry, filter: string): boolean {
  if (filter === "all") return true;
  return entry.level === filter || entry.kind === filter;
}

function renderApiLogs(): void {
  const list = document.querySelector<HTMLElement>("#api-command-log");
  if (!list) return;
  const filter = document.querySelector<HTMLSelectElement>("#api-log-filter")?.value || "all";
  const visible = apiLogs.filter((entry) => apiLogVisible(entry, filter));
  setText("#api-log-count", `${apiLogs.length} event${apiLogs.length === 1 ? "" : "s"}`);
  list.innerHTML = "";
  if (visible.length === 0) {
    const empty = document.createElement("div");
    empty.className = "api-log-empty";
    empty.textContent = "No API events";
    list.appendChild(empty);
    return;
  }
  for (const entry of visible.slice(-120)) {
    const row = document.createElement("div");
    row.className = `api-log-row ${entry.level}`;
    const time = new Date(entry.time).toLocaleTimeString([], { hour12: false });
    row.innerHTML = `
      <span class="api-log-time">${time}</span>
      <span class="api-log-method">${escapeHtml(entry.method || entry.kind.toUpperCase())}</span>
      <span class="api-log-status">${entry.status || ""}</span>
      <span class="api-log-route">${escapeHtml(entry.route || "/api")}</span>
      <span>${entry.latencyMs ? `${entry.latencyMs}ms` : ""}</span>
      <span class="api-log-message">${escapeHtml(entry.message)}</span>
    `;
    list.appendChild(row);
  }
  list.scrollTop = list.scrollHeight;
}

function syncApiLogsFromStorage(): void {
  loadApiLogsFromStorage();
  renderApiLogs();
}

async function openApiCommandPopout(): Promise<void> {
  const existing = await WebviewWindow.getByLabel(API_COMMAND_POPOUT_LABEL);
  if (existing) {
    await existing.show();
    await existing.unminimize();
    await existing.setFocus();
    return;
  }
  const url = "index.html?popout=api-command-centre";
  const popout = new WebviewWindow(API_COMMAND_POPOUT_LABEL, {
    url,
    title: "Higgs API Command Centre",
    width: 900,
    height: 640,
    minWidth: 620,
    minHeight: 420,
    resizable: true,
    decorations: true,
  });
  popout.once("tauri://error", (event) => {
    showToast(`Command Centre popout failed: ${String(event.payload)}`, "error");
  });
}

function renderApiCommandPopoutShell(): void {
  document.body.className = "api-popout-body";
  document.body.innerHTML = `
    <main class="api-popout-shell">
      <header class="api-popout-head">
        <div>
          <h1>API Command Centre</h1>
          <span id="api-log-count" class="api-status-text">0 events</span>
        </div>
        <div class="api-actions">
          <select id="api-log-filter" class="select-input compact-select">
            <option value="all">All</option>
            <option value="info">Info</option>
            <option value="warn">Warnings</option>
            <option value="error">Errors</option>
            <option value="request">Requests</option>
            <option value="job">Jobs</option>
          </select>
          <button id="api-copy-log-btn" class="compact-button" type="button">Copy</button>
          <button id="api-clear-log-btn" class="compact-button" type="button">Clear</button>
        </div>
      </header>
      <div id="api-command-log" class="api-command-log api-popout-log" aria-live="polite"></div>
    </main>
  `;
}

async function initApiCommandPopout(): Promise<void> {
  applySavedVisualShell();
  renderApiCommandPopoutShell();
  loadApiLogsFromStorage();
  renderApiLogs();
  el<HTMLSelectElement>("#api-log-filter").addEventListener("change", renderApiLogs);
  el("#api-copy-log-btn").addEventListener("click", () => {
    const text = apiLogs.map((entry) => `[${new Date(entry.time).toISOString()}] ${entry.level.toUpperCase()} ${entry.method || entry.kind} ${entry.status || ""} ${entry.route || "/api"} ${entry.message}`).join("\n");
    void copyText(text, "API log");
  });
  el("#api-clear-log-btn").addEventListener("click", () => {
    apiLogs.splice(0, apiLogs.length);
    persistApiLogs();
    renderApiLogs();
  });
  await listen<ApiLogEvent>("api-log", (event) => {
    appendApiLog(event.payload);
  });
  window.addEventListener("storage", (event) => {
    if (event.key === API_LOG_STORAGE_KEY) syncApiLogsFromStorage();
  });
}

async function refreshApiStatus(): Promise<void> {
  try {
    const status = await invoke<ApiServerStatus>("api_server_status");
    apiRunning = status.running;
    if (status.host) el<HTMLInputElement>("#api-host").value = status.host;
    if (status.port) el<HTMLInputElement>("#api-port").value = String(status.port);
    if (status.baseUrl) el<HTMLInputElement>("#api-base-url").value = status.baseUrl;
    setApiVisualStatus(status.running ? "running" : "stopped", status.running ? "Running" : "Stopped");
  } catch (e) {
    setApiVisualStatus("error", "API status error");
    appendApiLog({ level: "error", kind: "server", message: `Status failed: ${e}` });
  }
}

function initApiPanel(): void {
  loadApiLogsFromStorage();
  const savedKey = localStorage.getItem("higgsAudio.apiKey") || generateApiKey();
  el<HTMLInputElement>("#api-key").value = savedKey;
  localStorage.setItem("higgsAudio.apiKey", savedKey);
  el<HTMLInputElement>("#api-host").value = localStorage.getItem("higgsAudio.apiHost") || "127.0.0.1";
  el<HTMLInputElement>("#api-port").value = localStorage.getItem("higgsAudio.apiPort") || "7077";
  updateApiBaseUrl();
  renderApiLogs();
  renderApiExample();

  el("#api-status-button").addEventListener("click", () => switchMode("api"));
  el("#api-info-btn").addEventListener("click", () => {
    const panel = el<HTMLElement>("#api-docs-panel");
    const hidden = panel.classList.toggle("hidden");
    el<HTMLButtonElement>("#api-info-btn").classList.toggle("active", !hidden);
    renderApiExample();
  });
  for (const tab of document.querySelectorAll<HTMLButtonElement>("[data-api-example]")) {
    tab.addEventListener("click", () => {
      selectedApiExample = (tab.dataset.apiExample || "curl") as ApiExampleKind;
      renderApiExample();
    });
  }
  for (const id of ["#api-host", "#api-port"]) {
    el<HTMLInputElement>(id).addEventListener("input", () => {
      localStorage.setItem("higgsAudio.apiHost", el<HTMLInputElement>("#api-host").value.trim() || "127.0.0.1");
      localStorage.setItem("higgsAudio.apiPort", el<HTMLInputElement>("#api-port").value.trim() || "7077");
      updateApiBaseUrl();
    });
  }
  el<HTMLInputElement>("#api-key").addEventListener("input", () => {
    localStorage.setItem("higgsAudio.apiKey", el<HTMLInputElement>("#api-key").value);
    renderApiExample();
  });
  el<HTMLInputElement>("#api-key").addEventListener("change", () => {
    appendApiLog({ kind: "server", message: "Custom local API key updated" });
  });
  el("#api-key-toggle").addEventListener("click", () => {
    const input = el<HTMLInputElement>("#api-key");
    const button = el<HTMLButtonElement>("#api-key-toggle");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.textContent = show ? "◉" : "👁";
    button.setAttribute("aria-label", show ? "Hide API key" : "Show API key");
    button.title = show ? "Hide API key" : "Show API key";
  });
  el("#api-generate-key-btn").addEventListener("click", () => {
    const key = generateApiKey();
    el<HTMLInputElement>("#api-key").value = key;
    localStorage.setItem("higgsAudio.apiKey", key);
    renderApiExample();
    appendApiLog({ kind: "server", message: "Generated new local API key" });
  });
  el("#api-copy-base-btn").addEventListener("click", () => copyText(el<HTMLInputElement>("#api-base-url").value, "Base URL"));
  el("#api-copy-key-btn").addEventListener("click", () => copyText(el<HTMLInputElement>("#api-key").value, "API key"));
  el("#api-copy-curl-btn").addEventListener("click", () => {
    void copyText(buildCurrentApiExample("curl"), "curl examples");
  });
  el("#api-copy-example-btn").addEventListener("click", () => {
    void copyText(buildCurrentApiExample(selectedApiExample), "API example");
  });
  el("#api-start-btn").addEventListener("click", async () => {
    setApiVisualStatus("starting", "Starting");
    const host = el<HTMLInputElement>("#api-host").value.trim() || "127.0.0.1";
    const port = parseInt(el<HTMLInputElement>("#api-port").value, 10) || 7077;
    const apiKey = el<HTMLInputElement>("#api-key").value.trim() || generateApiKey();
    el<HTMLInputElement>("#api-key").value = apiKey;
    localStorage.setItem("higgsAudio.apiKey", apiKey);
    renderApiExample();
    try {
      for (const persona of speakerPersonas) {
        if (persona.refPath) await ensureSpeakerCachePath(persona);
      }
      const status = await invoke<ApiServerStatus>("api_server_start", {
        config: { host, port, apiKey, speakers: apiSpeakerPayload() },
      });
      apiRunning = true;
      if (status.baseUrl) el<HTMLInputElement>("#api-base-url").value = status.baseUrl;
      renderApiExample();
      setApiVisualStatus("running", "Running");
      appendApiLog({ kind: "server", method: "START", route: "/api", status: 200, message: "API server running" });
    } catch (e) {
      setApiVisualStatus("error", "Start failed");
      appendApiLog({ level: "error", kind: "server", method: "START", route: "/api", status: 500, message: String(e) });
    }
  });
  el("#api-stop-btn").addEventListener("click", async () => {
    try {
      await invoke("api_server_stop");
      apiRunning = false;
      setApiVisualStatus("stopped", "Stopped");
      appendApiLog({ kind: "server", method: "STOP", route: "/api", status: 200, message: "API server stopped" });
    } catch (e) {
      setApiVisualStatus("error", "Stop failed");
      appendApiLog({ level: "error", kind: "server", method: "STOP", route: "/api", status: 500, message: String(e) });
    }
  });
  el<HTMLSelectElement>("#api-log-filter").addEventListener("change", renderApiLogs);
  el("#api-popout-log-btn").addEventListener("click", () => {
    void openApiCommandPopout();
  });
  el("#api-clear-log-btn").addEventListener("click", () => {
    apiLogs.length = 0;
    persistApiLogs();
    renderApiLogs();
  });
  el("#api-copy-log-btn").addEventListener("click", () => {
    const text = apiLogs.map((entry) => {
      const time = new Date(entry.time).toISOString();
      return `${time} ${entry.level.toUpperCase()} ${entry.method || entry.kind} ${entry.route} ${entry.status} ${entry.latencyMs}ms ${entry.message}`;
    }).join("\n");
    void copyText(text, "API log");
  });
  window.addEventListener("storage", (event) => {
    if (event.key === API_LOG_STORAGE_KEY) syncApiLogsFromStorage();
  });
  void refreshApiStatus();
}

// ═══════════════════════════════════════════════════════════════════════════
// Mode switching
// ═══════════════════════════════════════════════════════════════════════════

function switchMode(mode: Mode): void {
  currentMode = mode;
  if (mode === "api") {
    el<HTMLButtonElement>("#api-status-button").classList.remove("hidden");
  } else if (!apiRunning) {
    el<HTMLButtonElement>("#api-status-button").classList.add("hidden");
  }
  for (const tab of document.querySelectorAll<HTMLButtonElement>(".mode-tab")) {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle("active", active);
    tab.classList.toggle("generating", tab.dataset.mode === activeGenerationJob?.mode);
    tab.setAttribute("aria-selected", String(active));
  }
  for (const content of document.querySelectorAll<HTMLElement>(".mode-content")) {
    content.classList.toggle("hidden", content.id !== `mode-${mode}`);
  }
  // Hide generation UI in utility views.
  const isUtility = mode === "history" || mode === "api" || mode === "speakers" || mode === "batch" || mode === "transcript" || mode === "montage" || mode === "chapter" || mode === "voicestudio" || mode === "subtitles" || mode === "video";
  if (mode === "batch") refreshBatchPersonaOptions();
  if (mode === "montage") renderMontageHistorySelect();
  if (mode === "chapter") refreshChapterVoiceOptions();
  if (mode === "voicestudio") renderStudioSources();
  if (mode === "subtitles") refreshSubsVoiceOptions();
  if (mode === "video") void refreshVideoTrack();
  if (mode === "transcript") void refreshTranscriptModelNote();
  if (mode === "transcript" || mode === "clone") void refreshVoiceCleanNote();
  el<HTMLElement>("#advanced-details").classList.toggle("hidden", isUtility || activeEngine === "drama");
  el<HTMLElement>("#drama-options").classList.toggle("hidden", isUtility || activeEngine !== "drama");
  el<HTMLElement>("#action-row").classList.toggle("hidden", isUtility);
  el<HTMLElement>("#progress-section").classList.toggle("hidden", isUtility || !isGenerating || activeGenerationJob?.mode !== mode);
  for (const item of document.querySelectorAll<HTMLElement>(".multi-only-advanced")) {
    item.classList.toggle("hidden", mode !== "multi");
  }
  updateGenerationControls();

  // Show this mode's output if it has one, otherwise hide
  const modeOutput = outputByMode[mode];
  if (modeOutput && !isUtility) {
    lastResult = modeOutput;
    showOutput(modeOutput);
  } else {
    el<HTMLElement>("#output-section").classList.add("hidden");
  }
  if (mode === "speakers") refreshVisibleRefPreview("gallery");
}

function initModeTabs(): void {
  for (const tab of document.querySelectorAll<HTMLButtonElement>(".mode-tab")) {
    tab.addEventListener("click", () => switchMode(tab.dataset.mode as Mode));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Model management
// ═══════════════════════════════════════════════════════════════════════════

function isRecommendedTtsModel(model: ModelListing): boolean {
  return model.name.toLowerCase().includes("q8_0");
}

function addLocalModelOption(path: string, label?: string): void {
  if (!path) return;
  const select = el<HTMLSelectElement>("#model-select");
  for (const opt of select.options) {
    if (opt.value === path) {
      select.value = path;
      return;
    }
  }
  const dirName = label || path.split(/[/\\]/).pop() || path;
  const opt = document.createElement("option");
  opt.value = path;
  opt.textContent = `${dirName} (local)`;
  select.appendChild(opt);
  select.value = path;
}

function modelDisplayName(model: ModelListing): string {
  const name = model.name.toLowerCase();
  if (name.includes("bf16")) return "Higgs Audio v3 BF16";
  if (name.includes("q8_0")) return "Higgs Audio v3 Q8_0";
  if (name.includes("q6_k")) return "Higgs Audio v3 Q6_K";
  if (name.includes("q5_k")) return "Higgs Audio v3 Q5_K";
  if (name.includes("q4_k")) return "Higgs Audio v3 Q4_K_M";
  return model.name;
}

function modelNameFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.includes("bf16")) return "Higgs Audio v3 BF16";
  if (lower.includes("q8_0") || lower.includes("q8-0")) return "Higgs Audio v3 Q8_0";
  if (lower.includes("q6_k") || lower.includes("q6-k")) return "Higgs Audio v3 Q6_K";
  if (lower.includes("q5_k") || lower.includes("q5-k")) return "Higgs Audio v3 Q5_K";
  if (lower.includes("q4_k") || lower.includes("q4-k")) return "Higgs Audio v3 Q4_K_M";
  return path.split(/[/\\]/).filter(Boolean).pop() || "Higgs model";
}

function selectedModelUiName(): string {
  const select = el<HTMLSelectElement>("#model-select");
  const value = select.value;
  const option = select.selectedOptions[0];
  if (value) {
    const inferred = modelNameFromPath(value);
    if (inferred !== "Higgs model" && !inferred.endsWith("model")) return inferred;
  }
  if (option?.textContent) {
    return option.textContent
      .replace(/^★\s*/, "")
      .replace(/\s*·\s*recommended/i, "")
      .replace(/\s*\([^)]*\)\s*$/, "")
      .trim();
  }
  return value ? modelNameFromPath(value) : "Higgs model";
}

function modelSortRank(model: ModelListing): number {
  const name = model.name.toLowerCase();
  if (name.includes("q8_0")) return 0;
  if (name.includes("q6_k")) return 1;
  if (name.includes("q5_k")) return 2;
  if (name.includes("q4_k")) return 3;
  if (name.includes("bf16")) return 4;
  return 10;
}

async function refreshModelList(): Promise<void> {
  try {
    const models = await invoke<ModelListing[]>("list_models");
    const sortedModels = [...models].sort((a, b) => {
      const rank = modelSortRank(a) - modelSortRank(b);
      return rank !== 0 ? rank : a.name.localeCompare(b.name);
    });
    const select = el<HTMLSelectElement>("#model-select");
    const currentVal = select.value || localStorage.getItem(MODEL_PATH_STORAGE_KEY) || "";
    select.innerHTML = '<option value="">Select a model…</option>';
    for (const m of sortedModels) {
      const opt = document.createElement("option");
      const recommended = isRecommendedTtsModel(m);
      const incomplete = m.hasConfig === false;
      opt.value = m.path;
      opt.textContent = `${recommended ? "★ " : ""}${modelDisplayName(m)}${recommended ? " · recommended" : ""} (${m.format}, ${formatBytes(m.sizeBytes)})${incomplete ? " · ⚠ incomplete" : ""}`;
      opt.title = incomplete
        ? `${m.name} — missing config.json / tokenizer files. Re-download the full model folder.`
        : m.name;
      select.appendChild(opt);
    }
    if (currentVal && models.some((m) => m.path === currentVal)) {
      select.value = currentVal;
    } else if (currentVal) {
      addLocalModelOption(currentVal);
    }
    el<HTMLButtonElement>("#load-model-btn").disabled = false;
  } catch (e) {
    showToast(`Failed to list models: ${e}`, "error");
  }
}

async function doLoadEngine(libraryPath?: string): Promise<void> {
  try {
    const savedEnginePath = localStorage.getItem(ENGINE_PATH_STORAGE_KEY) || "";
    const bundled = libraryPath ? null : await invoke<string | null>("bundled_engine_path");
    let libPath = libraryPath || savedEnginePath || bundled || undefined;
    let diagnostic = await diagnoseEngineForPath(libPath);
    if (!libraryPath && savedEnginePath && !diagnostic && bundled) {
      localStorage.removeItem(ENGINE_PATH_STORAGE_KEY);
      libPath = bundled;
      diagnostic = await diagnoseEngineForPath(libPath);
    }
    if (diagnostic && !diagnostic.ok) {
      showEngineDiagnosticModal(diagnostic);
      showToast("Engine dependency missing. Opened repair details.", "error");
      return;
    }
    const result = await invoke<{ success: boolean; version: string; supportsStreaming?: boolean }>("load_engine", {
      libraryPath: libPath,
    });
    if (result.success) {
      if (libPath) localStorage.setItem(ENGINE_PATH_STORAGE_KEY, libPath);
      engineSupportsStreaming = Boolean(result.supportsStreaming);
      setText("#engine-chip", t("Engine loaded"));
      el<HTMLElement>("#engine-chip").classList.add("active");
      showToast(t("Engine loaded"));
      await refreshModelList();
    }
  } catch (e) {
    const savedEnginePath = localStorage.getItem(ENGINE_PATH_STORAGE_KEY) || "";
    const bundled = await invoke<string | null>("bundled_engine_path").catch(() => null);
    const diagnostic = await diagnoseEngineForPath(libraryPath || savedEnginePath || bundled || undefined);
    if (diagnostic) {
      showEngineDiagnosticModal({ ...diagnostic, rawError: String(e) });
    }
    showToast(`Failed to load engine: ${e}`, "error");
  }
}

async function doBrowseEngine(): Promise<string | null> {
  const selected = await open({
    filters: [{ name: "Higgs Engine", extensions: ["dll", "so", "dylib"] }],
  });
  const path = Array.isArray(selected) ? selected[0] : selected;
  if (!path) return null;
  localStorage.setItem(ENGINE_PATH_STORAGE_KEY, path);
  showToast(`Selected engine: ${path.split(/[/\\]/).pop() || path}`);
  return path;
}

async function doLoadModel(): Promise<void> {
  const modelRoot = el<HTMLSelectElement>("#model-select").value;
  if (!modelRoot) {
    showToast("Select a model first", "warning");
    return;
  }
  try {
    el<HTMLButtonElement>("#load-model-btn").disabled = true;
    setText("#model-state", t("Loading…"));
    await unloadDramaToFreeVram();
    const result = await invoke<{ success: boolean; modelInfo: { family: string; displayName: string; weightType: string } }>(
      "load_model",
      {
        request: {
          modelRoot,
          backend: "cuda",
          device: 0,
          threads: 4,
          weightType: null,
          sessionOptions: null,
        },
      },
    );
    if (result.success) {
      const info = result.modelInfo;
      const uiName = selectedModelUiName();
      setText("#model-state", t("Loaded"));
      el("#model-state").classList.add("ok");
      setText("#model-chip", `${uiName} (${info.weightType || "default"})`);
      el("#model-chip").classList.remove("muted");
      el("#model-chip").classList.add("active");
      el<HTMLButtonElement>("#unload-model-btn").disabled = false;
      showToast(`Model loaded: ${uiName}`);
    }
  } catch (e) {
    setText("#model-state", t("Error"));
    showToast(`Failed to load model: ${e}`, "error");
  } finally {
    el<HTMLButtonElement>("#load-model-btn").disabled = false;
  }
}

async function doUnloadModel(): Promise<void> {
  try {
    await invoke("unload_model");
    setText("#model-state", t("Not loaded"));
    el("#model-state").classList.remove("ok");
    setText("#model-chip", t("No model"));
    el("#model-chip").classList.add("muted");
    el("#model-chip").classList.remove("active");
    el<HTMLButtonElement>("#unload-model-btn").disabled = true;
    showToast("Model unloaded");
  } catch (e) {
    showToast(`Failed to unload: ${e}`, "error");
  }
}

function initModelPanel(): void {
  const savedModelPath = localStorage.getItem(MODEL_PATH_STORAGE_KEY) || "";
  if (savedModelPath) addLocalModelOption(savedModelPath);
  el("#load-engine-btn").addEventListener("click", () => {
    void doLoadEngine();
  });
  el("#load-model-btn").addEventListener("click", doLoadModel);
  el("#unload-model-btn").addEventListener("click", doUnloadModel);
  el("#browse-model-btn").addEventListener("click", doBrowseModel);
  el<HTMLSelectElement>("#model-select").addEventListener("change", () => {
    const value = el<HTMLSelectElement>("#model-select").value;
    if (value) localStorage.setItem(MODEL_PATH_STORAGE_KEY, value);
    const popover = document.querySelector<HTMLDivElement>("#download-popover");
    if (!downloadActive && activeDownloadKind === "model" && popover && !popover.hidden) {
      setTtsDownloadPreset(inferTtsPresetFromModelSelection(), true);
    }
  });
}

async function doBrowseModel(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false });
  if (!selected) return null;

  const dirPath = Array.isArray(selected) ? selected[0] : selected;
  const dirName = dirPath.split(/[/\\]/).pop() || dirPath;
  localStorage.setItem(MODEL_PATH_STORAGE_KEY, dirPath);

  // Check for model files
  let hasWeights = false;
  let format = "";
  try {
    const models = await invoke<ModelListing[]>("list_models");
    const found = models.find((m) => m.path === dirPath);
    if (found) {
      hasWeights = true;
      format = found.format;
    }
  } catch {
    // list_models might not cover this dir; check via filesystem
  }

  // Add to dropdown regardless — the load will validate
  const select = el<HTMLSelectElement>("#model-select");
  for (const opt of select.options) {
    if (opt.value === dirPath) {
      select.value = dirPath;
      showToast(`Selected: ${dirName}`);
      return dirPath;
    }
  }
  const opt = document.createElement("option");
  opt.value = dirPath;
  opt.textContent = `${dirName} (local)`;
  select.appendChild(opt);
  select.value = dirPath;
  showToast(`Added local model: ${dirName}`);
  el<HTMLButtonElement>("#load-model-btn").disabled = false;
  return dirPath;
}

// ═══════════════════════════════════════════════════════════════════════════
// Dropzone
// ═══════════════════════════════════════════════════════════════════════════

function setupDropzone(
  dropzoneId: string,
  onFile: (path: string, name: string) => void | Promise<void>,
  onRemove?: () => void,
): void {
  const dz = el<HTMLElement>(dropzoneId);
  dz.dataset.emptyHtml = dz.innerHTML;
  dropzoneHandlers.push({ selector: dropzoneId, onFile });

  const handleFile = async (path: string, name: string) => {
    try {
      await onFile(path, name);
    } catch (e) {
      showToast(`Audio upload failed: ${e}`, "error");
    }
  };

  dz.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    if (target.closest(".dropzone-remove")) {
      event.preventDefault();
      event.stopPropagation();
      onRemove?.();
      return;
    }
    const selected = await open({
      filters: [{ name: "Audio", extensions: ["wav", "mp3", "flac", "m4a", "ogg", "webm"] }],
    });
    if (selected) {
      const name = selected.split(/[/\\]/).pop() || selected;
      await handleFile(selected, name);
    }
  });

  dz.addEventListener("dragover", (e) => {
    e.preventDefault();
    dz.classList.add("drag-over");
  });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag-over"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("drag-over");
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      const path = (file as any).path as string | undefined;
      if (!path) {
        return;
      }
      void handleFile(path, file.name);
    }
  });
}

function setDropzoneFile(dropzoneId: string, name: string): void {
  const dz = el<HTMLElement>(dropzoneId);
  dz.classList.add("has-file");
  dz.innerHTML = `
    <div class="dropzone-file">
      <span class="dropzone-file-icon">🎵</span>
      <span class="dropzone-file-name">${escapeHtml(name)}</span>
      <button class="dropzone-remove" type="button" aria-label="Remove audio">✕</button>
      <span class="dropzone-hint">Drop another audio file to replace it</span>
    </div>`;
}

function clearDropzone(dropzoneId: string): void {
  const dz = el<HTMLElement>(dropzoneId);
  dz.classList.remove("has-file", "drag-over");
  dz.innerHTML = dz.dataset.emptyHtml || "";
}

function clearAllDropzoneHover(): void {
  for (const item of document.querySelectorAll<HTMLElement>(".dropzone.drag-over")) {
    item.classList.remove("drag-over");
  }
}

async function routeDroppedAudioPath(target: HTMLElement | null, path: string): Promise<boolean> {
  const dz = target?.closest<HTMLElement>(".dropzone");
  if (!dz) return false;
  const name = path.split(/[/\\]/).pop() || path;
  const registered = dropzoneHandlers.find((handler) => dz.matches(handler.selector));
  if (registered) {
    await registered.onFile(path, name);
    return true;
  }
  if (dz.closest("#speaker-library")) {
    const speaker = speakerFromElement(dz);
    if (!speaker) return false;
    await setSpeakerAudioFromPath(speaker, path, name);
    return true;
  }
  if (dz.closest("#multi-lines")) {
    const line = lineFromElement(dz);
    if (!line) return false;
    await setLineAudioFromPath(line, path, name);
    return true;
  }
  return false;
}

function elementFromTauriDropPosition(position: { x: number; y: number }): HTMLElement | null {
  const scale = window.devicePixelRatio || 1;
  const attempts = [
    { x: position.x / scale, y: position.y / scale },
    { x: position.x, y: position.y },
  ];
  for (const point of attempts) {
    const target = document.elementFromPoint(point.x, point.y) as HTMLElement | null;
    if (target) return target;
  }
  return null;
}

function initTauriDropzones(): void {
  void getCurrentWebview().onDragDropEvent((event) => {
    const payload = event.payload as any;
    if (payload.type === "leave") {
      clearAllDropzoneHover();
      return;
    }
    if (!payload.position) return;
    const target = elementFromTauriDropPosition(payload.position);
    const dz = target?.closest<HTMLElement>(".dropzone");
    clearAllDropzoneHover();
    if (dz) dz.classList.add("drag-over");
    if (payload.type !== "drop") return;
    clearAllDropzoneHover();
    const firstPath = Array.isArray(payload.paths) ? payload.paths[0] : "";
    if (!firstPath) return;
    void routeDroppedAudioPath(target, firstPath).catch((e) => {
      showToast(`Audio drop failed: ${e}`, "error");
    });
  }).catch((e) => {
    console.warn("Tauri drag/drop unavailable", e);
  });
}

function drawRefPreview(kind: RefPreviewKind): void {
  const player = refPlayers[kind];
  if (!player) return;
  const ctx = player.canvas.getContext("2d");
  if (!ctx) return;
  const rect = player.canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (player.canvas.width !== Math.floor(width * dpr) || player.canvas.height !== Math.floor(height * dpr)) {
    player.canvas.width = Math.floor(width * dpr);
    player.canvas.height = Math.floor(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = cssVar("--bg-field", "#0f1215");
  ctx.fillRect(0, 0, width, height);
  const duration = player.audio.duration || 0;
  const progress = duration > 0 ? Math.min(1, player.audio.currentTime / duration) : 0;
  const accent = cssVar("--accent", "#25b8ab");
  const muted = cssVar("--text-muted", "#9ea8b3");
  if (player.waveformLoading) {
    ctx.fillStyle = muted;
    ctx.font = "12px Consolas, monospace";
    ctx.fillText("Loading waveform...", 10, Math.round(height / 2) + 4);
    return;
  }
  if (player.peaks.length === 0) {
    ctx.strokeStyle = `${muted}88`;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    return;
  }
  const bars = Math.max(28, Math.min(player.peaks.length, Math.floor(width / 6)));
  const gap = 3;
  const barW = Math.max(2, (width - gap * (bars - 1)) / bars);
  for (let i = 0; i < bars; i += 1) {
    const t = i / Math.max(1, bars - 1);
    const peakStart = Math.floor(i * player.peaks.length / bars);
    const peakEnd = Math.max(peakStart + 1, Math.floor((i + 1) * player.peaks.length / bars));
    let peak = 0;
    for (let p = peakStart; p < peakEnd; p++) peak = Math.max(peak, player.peaks[p] || 0);
    const barH = Math.max(2, peak * (height - 6));
    const x = i * (barW + gap);
    ctx.fillStyle = t <= progress ? accent : `${muted}55`;
    ctx.fillRect(x, (height - barH) / 2, barW, barH);
  }
}

async function loadRefWaveform(kind: RefPreviewKind, path: string): Promise<void> {
  const player = refPlayers[kind];
  if (!player) return;
  player.waveformPath = path;
  player.waveformLoading = true;
  player.peaks = [];
  drawRefPreview(kind);
  try {
    const result = await invoke<{ peaks: number[] }>("audio_waveform", { audioPath: path, points: 1400 });
    if (player.waveformPath !== path) return;
    player.peaks = result.peaks || [];
  } catch {
    if (player.waveformPath === path) player.peaks = [];
  } finally {
    if (player.waveformPath === path) {
      player.waveformLoading = false;
      drawRefPreview(kind);
    }
  }
}

function updateRefPlayback(kind: RefPreviewKind): void {
  const player = refPlayers[kind];
  if (!player) return;
  const duration = player.audio.duration || 0;
  const current = player.audio.currentTime || 0;
  player.seek.value = duration > 0 ? String(Math.round((current / duration) * 1000)) : "0";
  player.time.textContent = `${formatDuration(current)} / ${formatDuration(duration)}`;
  player.play.textContent = player.audio.paused ? "▶" : "⏸";
  drawRefPreview(kind);
}

function stopRefLoop(kind: RefPreviewKind): void {
  const player = refPlayers[kind];
  if (player?.raf) {
    cancelAnimationFrame(player.raf);
    player.raf = null;
  }
}

function startRefLoop(kind: RefPreviewKind): void {
  stopRefLoop(kind);
  const tick = () => {
    updateRefPlayback(kind);
    const player = refPlayers[kind];
    if (player && !player.audio.paused && !player.audio.ended) {
      player.raf = requestAnimationFrame(tick);
    }
  };
  refPlayers[kind]!.raf = requestAnimationFrame(tick);
}

function pauseOtherAudio(except?: RefPreviewKind): void {
  if (!audioPlayer.paused) audioPlayer.pause();
  el<HTMLButtonElement>("#play-btn").textContent = "▶";
  for (const kind of ["clone", "finish", "gallery"] as RefPreviewKind[]) {
    if (kind === except) continue;
    const player = refPlayers[kind];
    if (player && !player.audio.paused) {
      player.audio.pause();
      updateRefPlayback(kind);
    }
  }
}

function initRefPlayer(kind: RefPreviewKind): void {
  const player: RefPlayer = {
    audio: new Audio(),
    play: el<HTMLButtonElement>(`#${kind}-ref-play`),
    seek: el<HTMLInputElement>(`#${kind}-ref-seek`),
    time: el<HTMLElement>(`#${kind}-ref-time`),
    canvas: el<HTMLCanvasElement>(`#${kind}-ref-waveform`),
    peaks: [],
    waveformPath: "",
    waveformLoading: false,
    raf: null,
    previewObjectUrl: "",
    previewToken: 0,
  };
  player.audio.preload = "metadata";
  player.play.addEventListener("click", async () => {
    if (!player.audio.src) return;
    if (player.audio.paused) {
      pauseOtherAudio(kind);
      try {
        await player.audio.play();
        startRefLoop(kind);
      } catch {
        stopRefLoop(kind);
        updateRefPlayback(kind);
        showToast("Could not play that audio file", "warning");
      }
    } else {
      player.audio.pause();
      stopRefLoop(kind);
      updateRefPlayback(kind);
    }
  });
  player.seek.addEventListener("input", () => {
    const duration = player.audio.duration || 0;
    if (duration > 0) {
      player.audio.currentTime = (parseInt(player.seek.value, 10) / 1000) * duration;
      updateRefPlayback(kind);
    }
  });
  player.audio.addEventListener("loadedmetadata", () => updateRefPlayback(kind));
  player.audio.addEventListener("timeupdate", () => updateRefPlayback(kind));
  player.audio.addEventListener("ended", () => {
    stopRefLoop(kind);
    updateRefPlayback(kind);
  });
  refPlayers[kind] = player;
  drawRefPreview(kind);
}

function showRefPreview(kind: RefPreviewKind, path: string): void {
  const preview = el<HTMLElement>(`#${kind}-ref-preview`);
  const player = refPlayers[kind];
  if (!player) return;
  preview.classList.remove("hidden");
  player.audio.pause();
  stopRefLoop(kind);
  player.seek.value = "0";
  // Play through the Rust decoder (symphonia handles mp3/flac/m4a/ogg/aac and
  // mislabeled files) so preview works for ANY format the user loaded — the
  // browser <audio> alone fails on a non-WAV container behind a .wav name.
  if (player.previewObjectUrl) {
    URL.revokeObjectURL(player.previewObjectUrl);
    player.previewObjectUrl = "";
  }
  const token = ++player.previewToken;
  void (async () => {
    try {
      const res = await invoke<GenerationResult>("read_audio_as_wav", { audioPath: path });
      if (token !== player.previewToken) return;
      const blob = await base64ToBlobAsync(res.wavBase64, "audio/wav");
      if (token !== player.previewToken) return;
      player.previewObjectUrl = URL.createObjectURL(blob);
      player.audio.src = player.previewObjectUrl;
      player.audio.load();
    } catch {
      // Fallback: raw file via asset protocol (works for real WAV at least).
      if (token !== player.previewToken) return;
      player.audio.src = convertFileSrc(path);
      player.audio.load();
    }
  })();
  void loadRefWaveform(kind, path);
  updateRefPlayback(kind);
}

function refreshVisibleRefPreview(kind: RefPreviewKind): void {
  const player = refPlayers[kind];
  const preview = document.querySelector<HTMLElement>(`#${kind}-ref-preview`);
  if (!player || !preview || preview.classList.contains("hidden") || !player.waveformPath) return;
  requestAnimationFrame(() => {
    drawRefPreview(kind);
    if (player.peaks.length === 0 && !player.waveformLoading) {
      void loadRefWaveform(kind, player.waveformPath);
    }
  });
}

function redrawAllRefPreviews(): void {
  for (const kind of ["clone", "finish", "gallery"] as RefPreviewKind[]) {
    refreshVisibleRefPreview(kind);
  }
}

function hideRefPreview(kind: RefPreviewKind): void {
  const player = refPlayers[kind];
  if (player) {
    player.audio.pause();
    stopRefLoop(kind);
    player.audio.removeAttribute("src");
    player.audio.load();
    player.peaks = [];
    player.waveformPath = "";
    player.waveformLoading = false;
    player.seek.value = "0";
    updateRefPlayback(kind);
  }
  el<HTMLElement>(`#${kind}-ref-preview`).classList.add("hidden");
}

function initDropzones(): void {
  initRefPlayer("clone");
  initRefPlayer("finish");
  initRefPlayer("gallery");

  const clearClone = () => {
    cloneRefPath = null;
    clonePersonaId = "";
    cloneRefName = "";
    clearDropzone("#clone-dropzone");
    hideRefPreview("clone");
  };
  const clearFinish = () => {
    finishRefPath = null;
    finishPersonaId = "";
    finishRefName = "";
    clearDropzone("#finish-dropzone");
    hideRefPreview("finish");
  };
  const clearGallery = () => {
    const persona = selectedGalleryPersona();
    if (!persona) return;
    persona.refPath = "";
    persona.refName = "";
    persona.cachePath = "";
    persona.updatedAt = Date.now();
    saveSpeakerPersonas();
    hideRefPreview("gallery");
  };

  setupDropzone("#clone-dropzone", applyCloneReference, clearClone);
  wireRecordButton("#clone-record-btn", applyCloneReference);
  setupDropzone("#finish-dropzone", applyFinishReference, clearFinish);
  setupDropzone("#speaker-gallery-dropzone", (path, name) => {
    void applyGalleryReference(path, name).catch((e) => showToast(`Reference copy failed: ${e}`, "error"));
  }, clearGallery);

  // Mic recording on every reference spot that offers a voice choice.
  wireRecordButton("#finish-record-btn", applyFinishReference);
  wireRecordButton("#gallery-record-btn", (path, name) =>
    applyGalleryReference(path, name).catch((e) => showToast(`Reference copy failed: ${e}`, "error")));
}

async function setGalleryPhotoFromPath(imagePath: string): Promise<void> {
  let persona = selectedGalleryPersona();
  if (!persona) {
    persona = createBlankPersona();
    speakerPersonas.push(persona);
    selectedGalleryPersonaId = persona.id;
  }
  const stored = await storeSpeakerAsset(persona, imagePath, "image");
  persona.photoPath = stored.path;
  persona.updatedAt = Date.now();
  saveSpeakerPersonas();
}

// ═══════════════════════════════════════════════════════════════════════════
// Auto-transcribe
// ═══════════════════════════════════════════════════════════════════════════

async function doAutoTranscribe(refPath: string | null, textareaId: string): Promise<void> {
  if (!refPath) {
    showToast("Drop an audio file first", "warning");
    return;
  }
  const btn = refPath === cloneRefPath
    ? el<HTMLButtonElement>("#auto-transcribe-btn")
    : el<HTMLButtonElement>("#finish-auto-transcribe-btn");
  if (btn.disabled) return;
  btn.disabled = true;
  btn.classList.add("transcribing");
  try {
    const text = await transcribeAudioText(refPath);
    if (text === null) return;
    const textarea = el<HTMLTextAreaElement>(textareaId);
    textarea.value = text;
    textarea.classList.add("flash");
    setTimeout(() => textarea.classList.remove("flash"), 1000);
  } catch (e) {
    showToast(`Transcription failed: ${e}`, "error");
  } finally {
    btn.disabled = false;
    btn.classList.remove("transcribing");
  }
}

async function transcribeAudioText(refPath: string): Promise<string | null> {
  const whisperModelPath = localStorage.getItem("higgsAudio.whisperModel") || "";
  if (!whisperModelPath) {
    showToast("Download the Parakeet model in Settings first", "warning");
    return null;
  }
  const result = await invoke<{ text: string }>("transcribe_audio", {
    audioPath: refPath,
    whisperModelPath,
    language: null,
  });
  return result.text;
}

async function tryAutoTranscribeSilently(refPath: string): Promise<string> {
  const whisperModelPath = localStorage.getItem("higgsAudio.whisperModel") || "";
  if (!whisperModelPath) return "";
  try {
    const result = await invoke<{ text: string }>("transcribe_audio", {
      audioPath: refPath,
      whisperModelPath,
      language: null,
    });
    return result.text.trim();
  } catch {
    return "";
  }
}

async function pickAudioFile(): Promise<{ path: string; name: string } | null> {
  const selected = await open({
    filters: [{ name: "Audio", extensions: ["wav", "mp3", "flac", "m4a", "ogg", "webm"] }],
  });
  if (!selected) return null;
  const path = Array.isArray(selected) ? selected[0] : selected;
  return { path, name: path.split(/[/\\]/).pop() || path };
}

async function prepareReferenceAudioFile(
  path: string,
  name?: string,
  cleanVoice?: boolean,
): Promise<{ path: string; name: string; cropped: boolean }> {
  const originalName = name || path.split(/[/\\]/).pop() || "reference audio";
  // По умолчанию берём глобальную настройку тумблера; вызывающий может её
  // переопределить (например, реф уже очищен на предыдущем шаге).
  const clean = cleanVoice ?? voiceCleanEnabled;
  const result = await invoke<PreparedReferenceUpload>("prepare_reference_upload", {
    audioPath: path,
    maxSeconds: HIGGS_REFERENCE_MAX_SECONDS,
    cleanVoice: clean,
  });
  if (result.cropped) {
    showToast(`Reference cropped to first ${HIGGS_REFERENCE_MAX_SECONDS} seconds`, "warning");
  }
  return {
    path: result.path,
    name: result.cropped ? `${originalName} (first ${HIGGS_REFERENCE_MAX_SECONDS}s)` : originalName,
    cropped: result.cropped,
  };
}

async function pickReferenceAudioFile(): Promise<{ path: string; name: string; cropped: boolean } | null> {
  const file = await pickAudioFile();
  return file ? prepareReferenceAudioFile(file.path, file.name) : null;
}

// ── Reference appliers (shared by drag-drop, browse and mic recording) ──
async function applyCloneReference(path: string, name: string): Promise<void> {
  const prepared = await prepareReferenceAudioFile(path, name);
  cloneRefPath = prepared.path;
  clonePersonaId = "";
  cloneRefName = prepared.name;
  setDropzoneFile("#clone-dropzone", prepared.name);
  showRefPreview("clone", prepared.path);
}

function applyFinishReference(path: string, name: string): void {
  finishRefPath = path;
  finishPersonaId = "";
  finishRefName = name;
  setDropzoneFile("#finish-dropzone", name);
  showRefPreview("finish", path);
}

/**
 * A dialog with several answers; resolves to the chosen answer's value, or null
 * when it is dismissed (Escape or the backdrop).
 */
function askChoice(
  title: string,
  message: string,
  choices: Array<{ value: string; label: string; primary?: boolean }>,
): Promise<string | null> {
  const modal = el<HTMLElement>("#choice-modal");
  el("#choice-title").textContent = title;
  el("#choice-message").textContent = message;
  const actions = el<HTMLElement>("#choice-actions");
  actions.innerHTML = "";
  return new Promise((resolve) => {
    const finish = (value: string | null) => {
      modal.classList.add("hidden");
      document.removeEventListener("keydown", onKey);
      modal.onclick = null;
      resolve(value);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish(null);
    };
    for (const choice of choices) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `compact-button${choice.primary ? " primary" : ""}`;
      button.textContent = choice.label;
      button.addEventListener("click", () => finish(choice.value));
      actions.appendChild(button);
    }
    modal.onclick = (event) => {
      if (event.target === modal) finish(null);
    };
    document.addEventListener("keydown", onKey);
    modal.classList.remove("hidden");
    actions.querySelector<HTMLButtonElement>(".primary")?.focus();
  });
}

async function applyGalleryReference(path: string, name: string): Promise<void> {
  let persona = selectedGalleryPersona();
  // A card that already has a voice is not overwritten without asking: the new
  // recording would replace its reference.wav and the old voice would be lost.
  if (persona?.refPath) {
    const answer = await askChoice(
      t("This card already has a voice"),
      `${t("The card")} «${persona.name}» ${t("already has a recording. Make a new voice from the new recording, or replace the recording in this card?")}`,
      [
        { value: "cancel", label: t("Cancel") },
        { value: "replace", label: `${t("Replace in")} «${persona.name}»` },
        { value: "new", label: t("New voice"), primary: true },
      ],
    );
    if (answer === "new") {
      persona = createBlankPersona();
      speakerPersonas.push(persona);
      selectedGalleryPersonaId = persona.id;
    } else if (answer === "replace") {
      // The Drama 3 voice was made from the old recording.
      if (persona.dramaVoicePath) persona.dramaVoiceText = "";
    } else {
      renderSpeakerGalleryEditor();
      return;
    }
  }
  if (!persona) {
    persona = createBlankPersona();
    speakerPersonas.push(persona);
    selectedGalleryPersonaId = persona.id;
  }
  const prepared = await prepareReferenceAudioFile(path, name);
  if (!persona.name || /^Speaker \d+$/.test(persona.name)) {
    persona.name = personaNameFromPath(name || path);
  }
  const stored = await storeSpeakerAsset(persona, prepared.path, "audio");
  persona.refPath = stored.path;
  persona.refName = prepared.name || stored.fileName;
  persona.cachePath = "";
  await ensureSpeakerCachePath(persona);
  persona.updatedAt = Date.now();
  saveSpeakerPersonas();
  showRefPreview("gallery", persona.refPath);
}

// Native mic recording (cpal in Rust). Toggle on the button; on stop, hand the
// recorded WAV to `onWav` — the same path the drag-drop/browse flows use, so
// Parakeet auto-transcription runs exactly as for an uploaded reference.
let activeRecordButton: string | null = null;
let recordingSpeakerId: string | null = null;
let selectedMicDevice = localStorage.getItem("higgsAudio.micDevice") || "";
let activeRecMeterFill: HTMLElement | null = null;
let recLevelListenerReady = false;

// Live input-level meter: the Rust recorder emits `rec-level` (peak 0..1).
function setupRecLevelListener(): void {
  if (recLevelListenerReady) return;
  recLevelListenerReady = true;
  void listen<number>("rec-level", (e) => {
    if (activeRecMeterFill) {
      const pct = Math.round(Math.min(1, Math.max(0, e.payload)) * 100);
      activeRecMeterFill.style.width = `${pct}%`;
    }
  });
}

async function populateMicSelects(): Promise<void> {
  let devices: string[] = [];
  try {
    devices = await invoke<string[]>("list_input_devices");
  } catch {
    devices = [];
  }
  if ((!selectedMicDevice || !devices.includes(selectedMicDevice)) && devices.length) {
    selectedMicDevice = devices[0];
  }
  for (const sel of document.querySelectorAll<HTMLSelectElement>(".mic-select")) {
    sel.innerHTML = "";
    for (const d of devices) {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d;
      sel.appendChild(opt);
    }
    sel.value = selectedMicDevice;
    sel.onchange = () => {
      selectedMicDevice = sel.value;
      localStorage.setItem("higgsAudio.micDevice", selectedMicDevice);
      for (const other of document.querySelectorAll<HTMLSelectElement>(".mic-select")) {
        other.value = selectedMicDevice;
      }
    };
  }
}

function startRecMeter(fill: HTMLElement | null): void {
  activeRecMeterFill = fill;
  if (fill) {
    fill.style.width = "0%";
    fill.closest(".rec-meter")?.classList.add("active");
  }
}
function stopRecMeter(): void {
  if (activeRecMeterFill) {
    activeRecMeterFill.style.width = "0%";
    activeRecMeterFill.closest(".rec-meter")?.classList.remove("active");
  }
  activeRecMeterFill = null;
}
function recMeterFillFor(el: HTMLElement): HTMLElement | null {
  return el.closest(".record-row")?.querySelector<HTMLElement>(".rec-meter-fill") || null;
}

function wireRecordButton(
  btnId: string,
  onWav: (path: string, name: string) => void | Promise<void>,
): void {
  const btn = document.querySelector<HTMLButtonElement>(btnId);
  if (!btn) return;
  setupRecLevelListener();
  btn.addEventListener("click", async () => {
    const isRecording = activeRecordButton === btnId;
    if (!isRecording) {
      if (activeRecordButton || recordingSpeakerId) {
        showToast("Already recording — stop it first", "warning");
        return;
      }
      try {
        await invoke("start_recording", { device: selectedMicDevice || null });
        activeRecordButton = btnId;
        btn.textContent = t("⏹ Stop");
        btn.classList.add("recording");
        startRecMeter(recMeterFillFor(btn));
      } catch (e) {
        showToast(`Microphone error: ${e}`, "error");
      }
    } else {
      activeRecordButton = null;
      btn.textContent = t("🎤 Record voice");
      btn.classList.remove("recording");
      stopRecMeter();
      try {
        const wavPath = await invoke<string>("stop_recording");
        await onWav(wavPath, "recording.wav");
      } catch (e) {
        showToast(`Recording failed: ${e}`, "error");
      }
    }
  });
}

async function pickImageFile(): Promise<string | null> {
  const selected = await open({
    filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] }],
  });
  if (!selected) return null;
  return Array.isArray(selected) ? selected[0] : selected;
}

function cleanPersona(raw: any): SpeakerPersona | null {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim() || nextId("persona");
  const name = String(raw.name || "Speaker").trim() || "Speaker";
  const refPath = String(raw.refPath || raw.ref_path || "").trim();
  return {
    id,
    name,
    refPath,
    refName: String(raw.refName || raw.ref_name || (refPath ? refPath.split(/[/\\]/).pop() : "") || ""),
    refText: String(raw.refText || raw.ref_text || ""),
    notes: String(raw.notes || ""),
    photoPath: String(raw.photoPath || raw.photo_path || ""),
    cachePath: String(raw.cachePath || raw.cache_path || ""),
    normalize: Boolean(raw.normalize || raw.normalizeReference || raw.normalize_reference),
    createdAt: Number(raw.createdAt || raw.created_at || Date.now()),
    updatedAt: Number(raw.updatedAt || raw.updated_at || Date.now()),
    dramaVoicePath: String(raw.dramaVoicePath || raw.drama_voice_path || ""),
    dramaVoiceName: String(raw.dramaVoiceName || raw.drama_voice_name || ""),
    dramaVoiceText: String(raw.dramaVoiceText || raw.drama_voice_text || ""),
    extraRefs: (Array.isArray(raw.extraRefs) ? raw.extraRefs : Array.isArray(raw.extra_refs) ? raw.extra_refs : [])
      .filter((r: any) => r && typeof r.path === "string" && r.path)
      .map((r: any) => ({ path: String(r.path), name: String(r.name || r.path.split(/[/\\]/).pop() || ""), text: String(r.text || "") })),
  };
}

function loadSpeakerPersonas(): void {
  try {
    const parsed = JSON.parse(localStorage.getItem(SPEAKER_PERSONA_STORAGE_KEY) || "[]");
    const rawList = Array.isArray(parsed) ? parsed : parsed.speakers;
    speakerPersonas = Array.isArray(rawList)
      ? rawList.map(cleanPersona).filter((item): item is SpeakerPersona => Boolean(item))
      : [];
  } catch {
    speakerPersonas = [];
  }
}

function persistSpeakerPersonas(): void {
  localStorage.setItem(SPEAKER_PERSONA_STORAGE_KEY, JSON.stringify(speakerPersonas));
}

function saveSpeakerPersonas(): void {
  speakerPersonas.sort((a, b) => a.name.localeCompare(b.name));
  persistSpeakerPersonas();
  for (const persona of speakerPersonas) scheduleSpeakerPersonaFolderSync(persona, 80);
  renderSpeakerPersonaUi();
  if (apiRunning) {
    void syncApiSpeakers("Speaker identities refreshed");
  }
}

// ─── Find voices in folders: recordings in speakers/* that the gallery list lost ───

type FoundVoiceFolder = {
  dir: string;
  folder: string;
  referencePath: string;
  referenceBytes: number;
  modified: number;
  transcript: string;
  dramaVoicePath: string;
  manifest: Record<string, any> | null;
};

let foundVoiceFolders: FoundVoiceFolder[] = [];
const foundVoicePlayer = new Audio();
let foundVoicePlaying = -1;

function samePath(a: string, b: string): boolean {
  return a.replace(/\//g, "\\").toLowerCase() === b.replace(/\//g, "\\").toLowerCase();
}

async function findVoicesInFolders(): Promise<void> {
  let all: FoundVoiceFolder[];
  try {
    all = await invoke<FoundVoiceFolder[]>("scan_speaker_folders");
  } catch (e) {
    showToast(`${t("Could not look through the folders")}: ${e}`, "error");
    return;
  }
  const used = speakerPersonas.flatMap((p) => [p.refPath, ...(p.extraRefs || []).map((r) => r.path)]).filter(Boolean);
  // The same recording copied into several folders is shown once.
  const seen = new Set<string>();
  foundVoiceFolders = all
    .filter((f) => !used.some((path) => samePath(path, f.referencePath)))
    .sort((a, b) => b.modified - a.modified)
    .filter((f) => {
      const key = `${f.referenceBytes}:${f.transcript.trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  renderFoundVoices();
  el("#found-voices-modal").classList.remove("hidden");
}

function renderFoundVoices(): void {
  const list = el<HTMLElement>("#found-voices-list");
  el("#found-voices-count").textContent = foundVoiceFolders.length > 0
    ? `${t("Recordings not in the gallery")}: ${foundVoiceFolders.length}`
    : t("All recordings in the folders are in the gallery.");
  list.innerHTML = "";
  foundVoiceFolders.forEach((found, index) => {
    const row = document.createElement("div");
    row.className = "found-voice-row";
    row.dataset.index = String(index);
    const date = found.modified ? new Date(found.modified).toLocaleString() : "";
    row.innerHTML = `
      <div class="found-voice-head">
        <button class="ref-play" data-action="play" type="button">${foundVoicePlaying === index ? "⏸" : "▶"}</button>
        <input class="text-input" data-field="name" type="text" placeholder="${escapeHtml(t("Name"))}" />
        <span class="found-voice-meta"></span>
        <button class="compact-button primary" data-action="restore" type="button">${escapeHtml(t("Restore"))}</button>
      </div>
      <textarea class="text-area" data-field="text" rows="2" placeholder="${escapeHtml(t("The exact words of this recording…"))}"></textarea>
    `;
    const manifestName = String(found.manifest?.name || "").trim();
    row.querySelector<HTMLInputElement>('[data-field="name"]')!.value = manifestName || found.folder.replace(/_persona_.*$/, "");
    row.querySelector<HTMLTextAreaElement>('[data-field="text"]')!.value = found.transcript;
    row.querySelector<HTMLElement>(".found-voice-meta")!.textContent =
      `${t("folder")} ${found.folder}${date ? ` · ${date}` : ""}${found.dramaVoicePath ? ` · ${t("has a Drama 3 voice")}` : ""}`;
    list.appendChild(row);
  });
}

function restoreFoundVoice(index: number): void {
  const found = foundVoiceFolders[index];
  const row = el<HTMLElement>("#found-voices-list").querySelector<HTMLElement>(`.found-voice-row[data-index="${index}"]`);
  if (!found || !row) return;
  const name = row.querySelector<HTMLInputElement>('[data-field="name"]')!.value.trim() || t("Voice");
  const text = row.querySelector<HTMLTextAreaElement>('[data-field="text"]')!.value.trim();
  const manifest = found.manifest || {};
  const now = Date.now();
  const manifestId = String(manifest.id || "");
  const id = manifestId && !speakerPersonas.some((p) => p.id === manifestId) ? manifestId : nextId("persona");
  const persona: SpeakerPersona = {
    id,
    name,
    refPath: found.referencePath,
    refName: "reference.wav",
    refText: text,
    notes: String(manifest.notes || ""),
    photoPath: String(manifest.photoPath || manifest.photo_path || ""),
    cachePath: "",
    normalize: Boolean(manifest.normalize),
    createdAt: Number(manifest.createdAt || manifest.created_at) || now,
    updatedAt: now,
  };
  // The Drama 3 voice stays only if it was made from this very text; otherwise it is marked "remake".
  if (found.dramaVoicePath) {
    persona.dramaVoicePath = found.dramaVoicePath;
    persona.dramaVoiceName = uniqueDramaVoiceName(String(manifest.dramaVoiceName || manifest.drama_voice_name || name));
    persona.dramaVoiceText = String(manifest.dramaVoiceText || manifest.drama_voice_text || "");
  }
  speakerPersonas.push(persona);
  saveSpeakerPersonas();
  foundVoiceFolders.splice(index, 1);
  if (foundVoicePlaying === index) foundVoicePlayer.pause();
  foundVoicePlaying = -1;
  renderFoundVoices();
  showToast(`${t("Voice restored")}: ${name}`);
}

function initFoundVoices(): void {
  el("#speaker-find-btn").addEventListener("click", () => void findVoicesInFolders());
  const close = () => {
    foundVoicePlayer.pause();
    foundVoicePlaying = -1;
    el("#found-voices-modal").classList.add("hidden");
  };
  el("#found-voices-close").addEventListener("click", close);
  el("#found-voices-done").addEventListener("click", close);
  foundVoicePlayer.addEventListener("ended", () => {
    foundVoicePlaying = -1;
    renderFoundVoices();
  });
  el("#found-voices-list").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-action]");
    if (!button) return;
    const index = Number(button.closest<HTMLElement>(".found-voice-row")?.dataset.index);
    if (button.dataset.action === "restore") {
      restoreFoundVoice(index);
    } else if (button.dataset.action === "play") {
      if (foundVoicePlaying === index) {
        foundVoicePlayer.pause();
        foundVoicePlaying = -1;
      } else {
        foundVoicePlayer.src = convertFileSrc(foundVoiceFolders[index].referencePath);
        void foundVoicePlayer.play().catch(() => showToast(t("Could not play the recording"), "error"));
        foundVoicePlaying = index;
      }
      for (const b of el("#found-voices-list").querySelectorAll<HTMLButtonElement>('[data-action="play"]')) {
        b.textContent = Number(b.closest<HTMLElement>(".found-voice-row")?.dataset.index) === foundVoicePlaying ? "⏸" : "▶";
      }
    }
  });
}

async function syncApiSpeakers(message = "Speaker identities synced"): Promise<void> {
  try {
    for (const persona of speakerPersonas) {
      if (persona.refPath) await ensureSpeakerCachePath(persona);
    }
    const status = await invoke<{ running: boolean; speakerCount: number }>("api_update_speakers", {
      speakers: apiSpeakerPayload(),
    });
    if (status.running) {
      appendApiLog({
        kind: "server",
        method: "SYNC",
        route: "/api/speakers",
        status: 200,
        message: `${message}: ${status.speakerCount} saved speaker${status.speakerCount === 1 ? "" : "s"}`,
      });
    }
  } catch (e) {
    appendApiLog({
      level: "error",
      kind: "server",
      method: "SYNC",
      route: "/api/speakers",
      status: 500,
      message: `Speaker sync failed: ${e}`,
    });
  }
}

function findPersona(id: string | null | undefined): SpeakerPersona | undefined {
  if (!id) return undefined;
  return speakerPersonas.find((persona) => persona.id === id);
}

function personaNameFromPath(path: string): string {
  const file = path.split(/[/\\]/).pop() || "Speaker";
  return file.replace(/\.[^.]+$/, "") || "Speaker";
}

function personaOptions(selectedId: string, emptyLabel = "Select saved identity…"): string {
  const options = [`<option value="">${escapeHtml(t(emptyLabel))}</option>`];
  for (const persona of speakerPersonas) {
    options.push(`<option value="${escapeHtml(persona.id)}" ${persona.id === selectedId ? "selected" : ""}>${escapeHtml(persona.name)}</option>`);
  }
  return options.join("");
}

function avatarMarkup(name: string, photoPath = "", extraClass = ""): string {
  if (photoPath) {
    return `<span class="speaker-avatar ${extraClass}"><img src="${escapeHtml(convertFileSrc(photoPath))}" alt="" /></span>`;
  }
  const initial = (name.trim()[0] || "?").toUpperCase();
  return `<span class="speaker-avatar ${extraClass}">${escapeHtml(initial)}</span>`;
}

function setGalleryAvatar(name: string, photoPath = ""): void {
  const avatar = document.querySelector<HTMLElement>("#speaker-gallery-avatar");
  if (!avatar) return;
  avatar.className = "speaker-avatar large";
  if (photoPath) {
    avatar.innerHTML = `<img src="${escapeHtml(convertFileSrc(photoPath))}" alt="" />`;
  } else {
    avatar.textContent = (name.trim()[0] || "?").toUpperCase();
  }
}

function upsertSpeakerPersona(persona: SpeakerPersona): void {
  persona.updatedAt = Date.now();
  if (!persona.createdAt) persona.createdAt = persona.updatedAt;
  const existing = speakerPersonas.findIndex((item) => item.id === persona.id);
  if (existing >= 0) speakerPersonas[existing] = persona;
  else speakerPersonas.push(persona);
  saveSpeakerPersonas();
}

async function storeSpeakerAsset(persona: SpeakerPersona, sourcePath: string, kind: "audio" | "image"): Promise<{ path: string; fileName: string }> {
  return invoke<{ path: string; fileName: string }>("store_speaker_asset", {
    speakerId: persona.id,
    speakerName: persona.name,
    sourcePath,
    assetKind: kind,
  });
}

async function restageSpeakerAssets(persona: SpeakerPersona): Promise<void> {
  if (persona.refPath) {
    const stored = await storeSpeakerAsset(persona, persona.refPath, "audio");
    persona.refPath = stored.path;
    persona.refName = persona.refName || stored.fileName;
    if (!persona.cachePath) await ensureSpeakerCachePath(persona);
  }
  if (persona.photoPath) {
    const stored = await storeSpeakerAsset(persona, persona.photoPath, "image");
    persona.photoPath = stored.path;
  }
}

async function syncSpeakerPersonaFolder(persona: SpeakerPersona): Promise<void> {
  const result = await invoke<{ cachePath?: string }>("write_speaker_metadata", { speaker: persona });
  if (result.cachePath) {
    const current = findPersona(persona.id);
    if (current && !current.cachePath) {
      current.cachePath = result.cachePath;
      persistSpeakerPersonas();
    }
  }
}

async function ensureSpeakerCachePath(persona: SpeakerPersona): Promise<string> {
  if (persona.cachePath) return persona.cachePath;
  const result = await invoke<{ path: string; exists: boolean }>("speaker_cache_path", {
    speakerId: persona.id,
    speakerName: persona.name,
  });
  persona.cachePath = result.path;
  persistSpeakerPersonas();
  scheduleSpeakerPersonaFolderSync(persona, 80);
  return result.path;
}

function scheduleSpeakerPersonaFolderSync(persona: SpeakerPersona, delay = 400): void {
  const existing = speakerSyncTimers.get(persona.id);
  if (existing) window.clearTimeout(existing);
  const snapshot = { ...persona };
  const timer = window.setTimeout(() => {
    speakerSyncTimers.delete(snapshot.id);
    void syncSpeakerPersonaFolder(snapshot).catch((e) => {
      console.warn("Speaker folder sync failed", e);
    });
  }, delay);
  speakerSyncTimers.set(persona.id, timer);
}

function selectedGalleryPersona(): SpeakerPersona | undefined {
  return findPersona(selectedGalleryPersonaId);
}

type VoicePackVoice = { name: string; audioPath: string; text: string };

// Download the standard Nerual Dreming voice pack and add every voice to the
// Speaker Gallery as a persona (reference audio + transcript). Idempotent:
// voices whose name already exists are skipped.
async function importStandardVoicePack(): Promise<void> {
  const btn = document.querySelector<HTMLButtonElement>("#speaker-voicepack-btn");
  if (btn) btn.disabled = true;
  showToast("Downloading standard voice pack…");
  try {
    const voices = await invoke<VoicePackVoice[]>("download_voicepack", { force: false });
    const existing = new Set(speakerPersonas.map((p) => p.name.trim().toLowerCase()));
    let added = 0;
    for (const voice of voices) {
      const key = voice.name.trim().toLowerCase();
      if (!key || existing.has(key)) continue;
      try {
        const persona = createBlankPersona();
        persona.name = voice.name;
        const prepared = await prepareReferenceAudioFile(voice.audioPath, voice.name);
        const stored = await storeSpeakerAsset(persona, prepared.path, "audio");
        persona.refPath = stored.path;
        persona.refName = prepared.name || stored.fileName;
        persona.refText = voice.text;
        persona.cachePath = "";
        persona.updatedAt = Date.now();
        speakerPersonas.push(persona);
        existing.add(key);
        added += 1;
      } catch (e) {
        console.warn(`Voice-pack import failed for ${voice.name}`, e);
      }
    }
    saveSpeakerPersonas();
    renderSpeakerPersonaUi();
    showToast(added > 0 ? `Standard voices added: ${added}` : "Standard voices already imported");
  } catch (e) {
    showToast(`Voice pack failed: ${e}`, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function createBlankPersona(): SpeakerPersona {
  const now = Date.now();
  return {
    id: nextId("persona"),
    name: `Speaker ${speakerPersonas.length + 1}`,
    refPath: "",
    refName: "",
    refText: "",
    notes: "",
    photoPath: "",
    cachePath: "",
    normalize: false,
    createdAt: now,
    updatedAt: now,
  };
}

function renderSpeakerGalleryList(): void {
  const list = document.querySelector<HTMLElement>("#speaker-gallery-list");
  if (!list) return;
  list.innerHTML = "";
  if (speakerPersonas.length === 0) {
    const empty = document.createElement("div");
    empty.className = "speaker-gallery-empty";
    empty.textContent = t("No saved speakers yet");
    list.appendChild(empty);
    return;
  }
  for (const persona of speakerPersonas) {
    const item = document.createElement("button");
    item.className = `speaker-gallery-item ${persona.id === selectedGalleryPersonaId ? "active" : ""}`;
    item.type = "button";
    item.dataset.personaId = persona.id;
    item.innerHTML = `
      ${avatarMarkup(persona.name, persona.photoPath)}
      <span class="speaker-gallery-item-main">
        <strong>${escapeHtml(persona.name)}</strong>
        <span>${persona.refName ? escapeHtml(persona.refName) : "No reference audio"}</span>
      </span>
      ${persona.dramaVoicePath ? `<span class="speaker-drama-badge" title="${escapeHtml(t("Drama 3 voice is ready"))}">Drama 3 ✓</span>` : ""}
    `;
    list.appendChild(item);
  }
  translateStaticDom(list);
}

function renderSpeakerGalleryEditor(): void {
  const editor = document.querySelector<HTMLElement>("#speaker-gallery-editor");
  if (!editor) return;
  if (!selectedGalleryPersonaId && speakerPersonas.length > 0) {
    selectedGalleryPersonaId = speakerPersonas[0].id;
  }
  const persona = selectedGalleryPersona();
  editor.classList.toggle("hidden", !persona);
  if (!persona) {
    hideRefPreview("gallery");
    return;
  }

  el<HTMLInputElement>("#speaker-gallery-name").value = persona.name;
  el<HTMLTextAreaElement>("#speaker-gallery-transcript").value = persona.refText;
  el<HTMLTextAreaElement>("#speaker-gallery-notes").value = persona.notes;
  el<HTMLInputElement>("#speaker-gallery-normalize").checked = persona.normalize;
  setGalleryAvatar(persona.name, persona.photoPath);

  if (persona.refPath) {
    setDropzoneFile("#speaker-gallery-dropzone", persona.refName || persona.refPath.split(/[/\\]/).pop() || persona.name);
    showRefPreview("gallery", persona.refPath);
  } else {
    clearDropzone("#speaker-gallery-dropzone");
    hideRefPreview("gallery");
  }
  el("#speaker-gallery-trim").classList.toggle("hidden", !persona.refPath);
  renderSpeakerExtras(persona);
  renderSpeakerDramaState(persona);
}

function renderSpeakerPersonaUi(): void {
  const countText = `${speakerPersonas.length} ${t("saved")}`;
  const count = document.querySelector<HTMLElement>("#speaker-identity-count");
  if (count) count.textContent = countText;
  refreshBatchPersonaOptions();

  const cloneSelect = document.querySelector<HTMLSelectElement>("#clone-persona-select");
  if (cloneSelect) {
    const current = cloneSelect.value;
    cloneSelect.innerHTML = personaOptions(current);
    cloneSelect.value = findPersona(current) ? current : "";
  }

  const finishSelect = document.querySelector<HTMLSelectElement>("#finish-persona-select");
  if (finishSelect) {
    const current = finishSelect.value;
    finishSelect.innerHTML = personaOptions(current);
    finishSelect.value = findPersona(current) ? current : "";
  }

  renderSpeakerGalleryList();
  renderSpeakerGalleryEditor();
  renderDramaVoiceSelect();
  if (multiSpeakers.length > 0 && document.querySelector("#speaker-library")) renderMultiWorkflow();
  if (document.querySelector("#api-example-code")) renderApiExample();
}

function applyPersonaToClone(personaId: string): void {
  const persona = findPersona(personaId);
  if (!persona) {
    showToast("Select a saved speaker identity first", "warning");
    return;
  }
  clonePersonaId = persona.id;
  void ensureSpeakerCachePath(persona).catch((e) => console.warn("Speaker cache path failed", e));
  el<HTMLTextAreaElement>("#clone-ref-text").value = persona.refText;
  el<HTMLInputElement>("#clone-normalize-ref").checked = persona.normalize;
  if (persona.refPath) {
    cloneRefPath = persona.refPath;
    cloneRefName = persona.refName || persona.refPath.split(/[/\\]/).pop() || persona.name;
    setDropzoneFile("#clone-dropzone", cloneRefName);
    showRefPreview("clone", persona.refPath);
  }
  showToast(`Loaded speaker identity: ${persona.name}`);
}

function applyPersonaToFinish(personaId: string): void {
  const persona = findPersona(personaId);
  if (!persona) {
    showToast("Select a saved speaker identity first", "warning");
    return;
  }
  if (!persona.refPath) {
    showToast("That speaker identity has no reference audio", "warning");
    return;
  }
  finishPersonaId = persona.id;
  void ensureSpeakerCachePath(persona).catch((e) => console.warn("Speaker cache path failed", e));
  finishRefPath = persona.refPath;
  finishRefName = persona.refName || persona.refPath.split(/[/\\]/).pop() || persona.name;
  setDropzoneFile("#finish-dropzone", finishRefName);
  showRefPreview("finish", persona.refPath);
  el<HTMLTextAreaElement>("#finish-transcript").value = persona.refText;
  el<HTMLInputElement>("#finish-normalize-ref").checked = persona.normalize;
  showToast(`Loaded continuation source: ${persona.name}`);
}

function selectedExportPersonas(): SpeakerPersona[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>("#speaker-export-list input[data-export-id]:checked"))
    .map((input) => findPersona(input.dataset.exportId))
    .filter((persona): persona is SpeakerPersona => Boolean(persona));
}

function updateSpeakerExportCount(): void {
  const selected = selectedExportPersonas().length;
  setText("#speaker-export-count", `${selected} selected`);
  el<HTMLButtonElement>("#speaker-export-confirm").disabled = selected === 0;
}

function renderSpeakerExportList(): void {
  const list = el<HTMLElement>("#speaker-export-list");
  list.innerHTML = "";
  for (const persona of speakerPersonas) {
    const label = document.createElement("label");
    label.className = "speaker-export-item";
    label.innerHTML = `
      <input type="checkbox" data-export-id="${escapeHtml(persona.id)}" checked />
      ${avatarMarkup(persona.name, persona.photoPath)}
      <span class="speaker-export-item-main">
        <strong>${escapeHtml(persona.name)}</strong>
        <span>${persona.refName ? escapeHtml(persona.refName) : "No reference audio"}</span>
      </span>
    `;
    list.appendChild(label);
  }
  updateSpeakerExportCount();
}

function openSpeakerExportPicker(): void {
  if (speakerPersonas.length === 0) {
    showToast("No saved speakers to export", "warning");
    return;
  }
  renderSpeakerExportList();
  el<HTMLElement>("#speaker-export-modal").classList.remove("hidden");
}

function closeSpeakerExportPicker(): void {
  el<HTMLElement>("#speaker-export-modal").classList.add("hidden");
}

async function exportSpeakerPersonas(personas: SpeakerPersona[]): Promise<void> {
  if (personas.length === 0) {
    showToast("Choose at least one speaker to export", "warning");
    return;
  }
  const path = await save({
    defaultPath: `higgs-speaker-gallery-v${APP_VERSION}.zip`,
    filters: [{ name: "Speaker Gallery ZIP", extensions: ["zip"] }],
  });
  if (!path) return;
  await invoke("export_speaker_zip", { path, speakers: personas });
  showToast(`Exported ${personas.length} speaker${personas.length === 1 ? "" : "s"}`);
}

function importSpeakerPersonasFromJsonText(text: string): number {
  const parsed = JSON.parse(text);
  const rawList = Array.isArray(parsed) ? parsed : parsed.speakers;
  if (!Array.isArray(rawList)) throw new Error("No speakers array found");
  let imported = 0;
  for (const raw of rawList) {
    const persona = cleanPersona(raw);
    if (!persona) continue;
    const existing = speakerPersonas.findIndex((item) => item.id === persona.id);
    if (existing >= 0) speakerPersonas[existing] = persona;
    else speakerPersonas.push(persona);
    if (!selectedGalleryPersonaId) selectedGalleryPersonaId = persona.id;
    imported += 1;
  }
  saveSpeakerPersonas();
  return imported;
}

async function importSpeakerPersonasFromPath(path: string): Promise<void> {
  let imported = 0;
  if (path.toLowerCase().endsWith(".zip")) {
    const result = await invoke<{ speakers: SpeakerPersona[] }>("import_speaker_zip", { path });
    for (const raw of result.speakers || []) {
      const persona = cleanPersona(raw);
      if (!persona) continue;
      const existing = speakerPersonas.findIndex((item) => item.id === persona.id);
      if (existing >= 0) speakerPersonas[existing] = persona;
      else speakerPersonas.push(persona);
      if (!selectedGalleryPersonaId) selectedGalleryPersonaId = persona.id;
      imported += 1;
    }
    saveSpeakerPersonas();
  } else {
    const text = await invoke<string>("read_text_file", { path });
    imported = importSpeakerPersonasFromJsonText(text);
  }
  showToast(`Imported ${imported} speaker identit${imported === 1 ? "y" : "ies"}`);
}

function deleteSelectedPersona(): void {
  const id = selectedGalleryPersonaId;
  const persona = findPersona(id);
  if (!persona) {
    showToast("Select a speaker identity to delete", "warning");
    return;
  }
  if (!window.confirm(`Delete speaker identity "${persona.name}"?`)) return;
  speakerPersonas = speakerPersonas.filter((item) => item.id !== id);
  for (const speaker of multiSpeakers) {
    if (speaker.personaId === id) speaker.personaId = "";
  }
  selectedGalleryPersonaId = speakerPersonas[0]?.id || "";
  saveSpeakerPersonas();
  showToast("Speaker identity deleted");
}

function initSpeakerPersonas(): void {
  loadSpeakerPersonas();
  selectedGalleryPersonaId = speakerPersonas[0]?.id || "";
  renderSpeakerPersonaUi();

  const openImport = async () => {
    const selected = await open({
      filters: [{ name: "Speaker Gallery", extensions: ["zip", "json"] }],
    });
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (!path) return;
    await importSpeakerPersonasFromPath(path);
  };
  el("#speaker-add-btn").addEventListener("click", () => {
    const persona = createBlankPersona();
    speakerPersonas.push(persona);
    selectedGalleryPersonaId = persona.id;
    saveSpeakerPersonas();
    switchMode("speakers");
  });
  el("#speaker-voicepack-btn").addEventListener("click", () => {
    void importStandardVoicePack();
  });
  el("#speaker-import-btn").addEventListener("click", () => {
    void openImport().catch((e) => showToast(`Import failed: ${e}`, "error"));
  });
  el("#multi-import-identities-btn").addEventListener("click", () => {
    void openImport().catch((e) => showToast(`Import failed: ${e}`, "error"));
  });
  el("#speaker-export-btn").addEventListener("click", () => {
    openSpeakerExportPicker();
  });
  el("#multi-export-identities-btn").addEventListener("click", () => {
    openSpeakerExportPicker();
  });
  el("#speaker-delete-btn").addEventListener("click", deleteSelectedPersona);
  el("#speaker-export-close").addEventListener("click", closeSpeakerExportPicker);
  el("#speaker-export-cancel").addEventListener("click", closeSpeakerExportPicker);
  el("#speaker-export-list").addEventListener("change", updateSpeakerExportCount);
  el("#speaker-export-select-all").addEventListener("click", () => {
    for (const input of document.querySelectorAll<HTMLInputElement>("#speaker-export-list input[data-export-id]")) {
      input.checked = true;
    }
    updateSpeakerExportCount();
  });
  el("#speaker-export-select-none").addEventListener("click", () => {
    for (const input of document.querySelectorAll<HTMLInputElement>("#speaker-export-list input[data-export-id]")) {
      input.checked = false;
    }
    updateSpeakerExportCount();
  });
  el("#speaker-export-confirm").addEventListener("click", () => {
    const selected = selectedExportPersonas();
    void exportSpeakerPersonas(selected)
      .then(closeSpeakerExportPicker)
      .catch((e) => showToast(`Export failed: ${e}`, "error"));
  });

  el("#speaker-gallery-list").addEventListener("click", (event) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>("[data-persona-id]");
    if (!item?.dataset.personaId) return;
    selectedGalleryPersonaId = item.dataset.personaId;
    renderSpeakerPersonaUi();
  });
  el<HTMLInputElement>("#speaker-gallery-name").addEventListener("input", () => {
    const persona = selectedGalleryPersona();
    if (!persona) return;
    persona.name = el<HTMLInputElement>("#speaker-gallery-name").value || "Speaker";
    persona.updatedAt = Date.now();
    persistSpeakerPersonas();
    // The folder follows the name: it is updated on "change" (when typing ends),
    // not per keystroke, which left a folder for every partial name.
    setGalleryAvatar(persona.name, persona.photoPath);
  });
  el<HTMLInputElement>("#speaker-gallery-name").addEventListener("change", () => {
    const persona = selectedGalleryPersona();
    if (!persona) return;
    void restageSpeakerAssets(persona)
      .catch((e) => showToast(`Speaker asset refresh failed: ${e}`, "warning"))
      .finally(() => saveSpeakerPersonas());
  });
  el<HTMLTextAreaElement>("#speaker-gallery-transcript").addEventListener("input", () => {
    const persona = selectedGalleryPersona();
    if (!persona) return;
    persona.refText = el<HTMLTextAreaElement>("#speaker-gallery-transcript").value;
    persona.updatedAt = Date.now();
    persistSpeakerPersonas();
    scheduleSpeakerPersonaFolderSync(persona);
    renderSpeakerDramaState(persona);
  });
  el("#speaker-drama-make-btn").addEventListener("click", () => {
    const persona = selectedGalleryPersona();
    if (persona) void makeDramaVoiceForPersona(persona);
  });
  el<HTMLTextAreaElement>("#speaker-gallery-notes").addEventListener("input", () => {
    const persona = selectedGalleryPersona();
    if (!persona) return;
    persona.notes = el<HTMLTextAreaElement>("#speaker-gallery-notes").value;
    persona.updatedAt = Date.now();
    persistSpeakerPersonas();
    scheduleSpeakerPersonaFolderSync(persona);
  });
  el<HTMLInputElement>("#speaker-gallery-normalize").addEventListener("change", () => {
    const persona = selectedGalleryPersona();
    if (!persona) return;
    persona.normalize = el<HTMLInputElement>("#speaker-gallery-normalize").checked;
    persona.updatedAt = Date.now();
    saveSpeakerPersonas();
  });
  el("#speaker-gallery-photo-btn").addEventListener("click", async () => {
    const persona = selectedGalleryPersona();
    if (!persona) {
      showToast("Create a speaker first", "warning");
      return;
    }
    const imagePath = await pickImageFile();
    if (!imagePath) return;
    await setGalleryPhotoFromPath(imagePath);
  });
  el("#speaker-gallery-photo-delete").addEventListener("click", () => {
    const persona = selectedGalleryPersona();
    if (!persona) return;
    persona.photoPath = "";
    persona.updatedAt = Date.now();
    saveSpeakerPersonas();
  });
  el("#speaker-gallery-auto").addEventListener("click", async () => {
    const persona = selectedGalleryPersona();
    if (!persona?.refPath) {
      showToast("Drop a reference voice first", "warning");
      return;
    }
    const btn = el<HTMLButtonElement>("#speaker-gallery-auto");
    btn.disabled = true;
    btn.classList.add("transcribing");
    try {
      const text = await transcribeAudioText(persona.refPath);
      if (text !== null) {
        persona.refText = text;
        persona.updatedAt = Date.now();
        persistSpeakerPersonas();
        scheduleSpeakerPersonaFolderSync(persona);
        el<HTMLTextAreaElement>("#speaker-gallery-transcript").value = text;
      }
    } finally {
      btn.disabled = false;
      btn.classList.remove("transcribing");
    }
  });
  el<HTMLSelectElement>("#clone-persona-select").addEventListener("change", () => {
    const value = el<HTMLSelectElement>("#clone-persona-select").value;
    if (value) applyPersonaToClone(value);
  });
  el<HTMLSelectElement>("#finish-persona-select").addEventListener("change", () => {
    const value = el<HTMLSelectElement>("#finish-persona-select").value;
    if (value) applyPersonaToFinish(value);
  });
}

function createSpeaker(name?: string): MultiSpeaker {
  const count = multiSpeakers.length + 1;
  return {
    id: nextId("speaker"),
    personaId: "",
    name: name || `Speaker ${count}`,
    refPath: null,
    refName: "",
    refText: "",
    notes: "",
    photoPath: "",
    cachePath: "",
    normalize: false,
    open: true,
  };
}

function createLine(speakerId?: string): MultiLine {
  return {
    id: nextId("line"),
    speakerId: speakerId || multiSpeakers[0]?.id || "",
    text: "",
    overridePath: null,
    overrideName: "",
    overrideText: "",
    open: false,
  };
}

function resetMultiLines(): void {
  multiLines.splice(0, multiLines.length);
  multiLines.push(createLine(multiSpeakers[0]?.id));
  multiLines.push(createLine(multiSpeakers[1]?.id || multiSpeakers[0]?.id));
  renderMultiLines();
}

function ensureMultiDefaults(): void {
  while (multiSpeakers.length < 2) {
    multiSpeakers.push(createSpeaker());
  }
  while (multiLines.length < 2) {
    multiLines.push(createLine(multiSpeakers[multiLines.length]?.id || multiSpeakers[0]?.id));
  }
  const fallbackSpeaker = multiSpeakers[0]?.id || "";
  for (const line of multiLines) {
    if (!multiSpeakers.some((speaker) => speaker.id === line.speakerId)) {
      line.speakerId = fallbackSpeaker;
    }
  }
}

function findMultiSpeakerPreflightIssues(speakers: MultiSpeaker[], lines: MultiLine[]): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const text = line.text.trim();
    if (!text) {
      const message = `Line ${lineNo} needs text`;
      if (!seen.has(message)) {
        seen.add(message);
        issues.push(message);
      }
    }

    const speaker = speakers.find((item) => item.id === line.speakerId);
    if (!speaker) {
      const message = `Line ${lineNo} uses a missing speaker. Pick an existing speaker before generating.`;
      if (!seen.has(message)) {
        seen.add(message);
        issues.push(message);
      }
      return;
    }

    if (!line.overridePath && !speaker.refPath) {
      const speakerName = speaker.name.trim() || `Speaker ${speakers.indexOf(speaker) + 1}`;
      const message = `Line ${lineNo} uses "${speakerName}", but that speaker has no reference voice. Add a reference voice or choose a saved speaker identity.`;
      if (!seen.has(message)) {
        seen.add(message);
        issues.push(message);
      }
    }
  });
  return issues;
}

function assertMultiSpeakerReady(speakers: MultiSpeaker[], lines: MultiLine[]): void {
  const issues = findMultiSpeakerPreflightIssues(speakers, lines);
  if (issues.length > 0) {
    throw new Error(issues.slice(0, 4).join(" "));
  }
}

function multiDropzoneMarkup(fileName: string, emptyText: string): string {
  if (fileName) {
    return `
      <div class="dropzone-file">
        <span class="dropzone-file-icon">🎵</span>
        <span class="dropzone-file-name">${escapeHtml(fileName)}</span>
        <button class="dropzone-remove" type="button" data-action="clear-audio" aria-label="Remove audio">✕</button>
        <span class="dropzone-hint">Drop another audio file to replace it</span>
      </div>`;
  }
  return `
    <div class="dropzone-empty">
      <p>⤒ ${emptyText}</p>
      <p class="dropzone-hint">mp3 · wav · flac · m4a</p>
    </div>`;
}

function speakerOptions(selectedId: string): string {
  return multiSpeakers
    .map((speaker) => `<option value="${speaker.id}" ${speaker.id === selectedId ? "selected" : ""}>${escapeHtml(speaker.name)}</option>`)
    .join("");
}

function renderMultiSpeakers(): void {
  ensureMultiDefaults();
  const list = el<HTMLElement>("#speaker-library");
  list.innerHTML = "";
  for (const speaker of multiSpeakers) {
    const card = document.createElement("article");
    card.className = "speaker-card";
    card.dataset.speakerId = speaker.id;
    card.innerHTML = `
      <div class="speaker-card-head">
        ${avatarMarkup(speaker.name, speaker.photoPath)}
        <input class="text-input speaker-name-input" data-field="speaker-name" value="${escapeHtml(speaker.name)}" />
        <button class="compact-button" data-action="auto-speaker" type="button">✦ Auto-transcribe</button>
        <button class="icon-button speaker-toggle" data-action="toggle-speaker" type="button" aria-label="${speaker.open ? "Collapse speaker" : "Expand speaker"}">${speaker.open ? "▴" : "▾"}</button>
        <button class="compact-button" data-action="remove-speaker" type="button" ${multiSpeakers.length <= 2 ? "disabled" : ""}>−</button>
      </div>
      <div class="speaker-card-body ${speaker.open ? "" : "hidden"}">
        <div class="identity-select-row compact">
          <select class="select-input" data-field="speaker-persona">${personaOptions(speaker.personaId, "Use saved identity…")}</select>
        </div>
        <div class="dropzone mini-dropzone ${speaker.refName ? "has-file" : ""}" data-action="pick-speaker-audio">
          ${multiDropzoneMarkup(speaker.refName, "Drop reference voice, or click to browse")}
        </div>
        <div class="record-row">
          <button class="compact-button ${recordingSpeakerId === speaker.id ? "recording" : ""}" data-action="record-speaker" type="button">${recordingSpeakerId === speaker.id ? t("⏹ Stop") : t("🎤 Record voice")}</button>
          <span class="rec-meter ${recordingSpeakerId === speaker.id ? "active" : ""}"><span class="rec-meter-fill"></span></span>
        </div>
        <label class="field-label transcript-label">Reference transcript</label>
        <textarea class="text-area" data-field="speaker-transcript" rows="2" placeholder="Optional. Auto-filled with Parakeet when available.">${escapeHtml(speaker.refText)}</textarea>
        <label class="inline-toggle reference-normalize-toggle">
          <span>Normalize reference</span>
          <span class="toggle-switch"><input type="checkbox" data-field="speaker-normalize" ${speaker.normalize ? "checked" : ""} /><span class="toggle-slider"></span></span>
        </label>
        <label class="field-label transcript-label">Source / consent notes</label>
        <textarea class="text-area" data-field="speaker-notes" rows="2" placeholder="Optional notes for this identity">${escapeHtml(speaker.notes)}</textarea>
      </div>`;
    list.appendChild(card);
  }
  translateStaticDom(list);
}

function renderMultiLines(): void {
  ensureMultiDefaults();
  const list = el<HTMLElement>("#multi-lines");
  list.innerHTML = "";
  multiLines.forEach((line, index) => {
    const item = document.createElement("article");
    item.className = "dialogue-line";
    item.dataset.lineId = line.id;
    item.innerHTML = `
      <div class="line-main">
        <span class="line-grip" role="button" tabindex="0" aria-label="Drag line">⋮⋮</span>
        <span class="line-number">${index + 1}</span>
        <select class="select-input speaker-select" data-field="line-speaker">${speakerOptions(line.speakerId)}</select>
        <button class="compact-button" data-action="toggle-line-ref" type="button">${line.open ? "Hide reference" : "Reference"}</button>
        <button class="compact-button" data-action="remove-line" type="button" ${multiLines.length <= 2 ? "disabled" : ""}>−</button>
      </div>
      <textarea class="text-area line-text" data-field="line-text" rows="3" placeholder="Text to speak for this line...">${escapeHtml(line.text)}</textarea>
      <div class="line-reference ${line.open ? "" : "hidden"}">
        <div class="dropzone mini-dropzone ${line.overrideName ? "has-file" : ""}" data-action="pick-line-audio">
          ${multiDropzoneMarkup(line.overrideName, "Optional line-specific reference voice")}
        </div>
        <div class="label-row">
          <label class="field-label">Reference transcript override</label>
          <button class="link-button" data-action="auto-line" type="button">✦ Auto-transcribe</button>
        </div>
        <textarea class="text-area" data-field="line-transcript" rows="2" placeholder="Leave blank to use the selected speaker transcript.">${escapeHtml(line.overrideText)}</textarea>
      </div>`;
    list.appendChild(item);
  });
  translateStaticDom(list);
}

function renderMultiWorkflow(): void {
  renderMultiSpeakers();
  renderMultiLines();
}

function updateSpeakerTagsFromInput(): void {
  const names = el<HTMLInputElement>("#speaker-tags-input").value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  while (names.length < 2) names.push(`Speaker ${names.length + 1}`);
  while (multiSpeakers.length < names.length) multiSpeakers.push(createSpeaker());
  while (multiSpeakers.length > Math.max(2, names.length)) {
    const removed = multiSpeakers.pop();
    if (removed) {
      for (const line of multiLines) {
        if (line.speakerId === removed.id) line.speakerId = multiSpeakers[0]?.id || "";
      }
    }
  }
  names.forEach((name, index) => {
    multiSpeakers[index].name = name;
  });
  renderMultiWorkflow();
}

function speakerFromElement(target: HTMLElement): MultiSpeaker | undefined {
  const card = target.closest<HTMLElement>("[data-speaker-id]");
  return card ? multiSpeakers.find((speaker) => speaker.id === card.dataset.speakerId) : undefined;
}

function lineFromElement(target: HTMLElement): MultiLine | undefined {
  const lineEl = target.closest<HTMLElement>("[data-line-id]");
  return lineEl ? multiLines.find((line) => line.id === lineEl.dataset.lineId) : undefined;
}

function clearLineDragStyles(lineList = el<HTMLElement>("#multi-lines")): void {
  for (const item of lineList.querySelectorAll(".dialogue-line")) {
    item.classList.remove("dragging", "drag-target");
  }
}

function lineElementFromPoint(clientX: number, clientY: number): HTMLElement | null {
  return (document.elementFromPoint(clientX, clientY) as HTMLElement | null)?.closest<HTMLElement>(".dialogue-line") ?? null;
}

function scrollMultiModeDuringDrag(clientY: number): void {
  const mode = el<HTMLElement>("#mode-multi");
  const rect = mode.getBoundingClientRect();
  const edge = 42;
  if (clientY < rect.top + edge) mode.scrollTop -= 18;
  else if (clientY > rect.bottom - edge) mode.scrollTop += 18;
}

async function setSpeakerAudioFromPath(speaker: MultiSpeaker, path: string, name?: string): Promise<void> {
  const prepared = await prepareReferenceAudioFile(path, name);
  speaker.personaId = "";
  speaker.refPath = prepared.path;
  speaker.refName = prepared.name;
  speaker.cachePath = "";
  renderMultiSpeakers();
}

async function setSpeakerAudioFromDrop(speaker: MultiSpeaker, files: FileList | null): Promise<void> {
  const file = files?.[0];
  if (!file) return;
  const path = (file as any).path as string | undefined;
  if (!path) {
    return;
  }
  await setSpeakerAudioFromPath(speaker, path, file.name);
}

function applyPersonaToMultiSpeaker(speaker: MultiSpeaker, personaId: string): void {
  const persona = findPersona(personaId);
  if (!persona) {
    showToast("Select a saved speaker identity first", "warning");
    return;
  }
  speaker.personaId = persona.id;
  speaker.name = persona.name;
  speaker.refPath = persona.refPath || null;
  speaker.refName = persona.refName || (persona.refPath ? persona.refPath.split(/[/\\]/).pop() || persona.name : "");
  speaker.refText = persona.refText;
  speaker.notes = persona.notes;
  speaker.photoPath = persona.photoPath;
  speaker.cachePath = persona.cachePath;
  speaker.normalize = persona.normalize;
  void ensureSpeakerCachePath(persona).then((path) => {
    speaker.cachePath = path;
  }).catch((e) => console.warn("Speaker cache path failed", e));
  renderMultiWorkflow();
  showToast(`Loaded speaker identity: ${persona.name}`);
}

async function savePersonaFromMultiSpeaker(speaker: MultiSpeaker): Promise<void> {
  if (!speaker.refPath) {
    showToast("Drop a reference voice before saving this identity", "warning");
    return;
  }
  const existing = findPersona(speaker.personaId);
  const persona: SpeakerPersona = {
    id: existing?.id || nextId("persona"),
    name: speaker.name.trim() || existing?.name || personaNameFromPath(speaker.refPath),
    refPath: speaker.refPath,
    refName: speaker.refName || speaker.refPath.split(/[/\\]/).pop() || speaker.name,
    refText: speaker.refText.trim(),
    notes: speaker.notes.trim(),
    photoPath: speaker.photoPath || existing?.photoPath || "",
    cachePath: existing?.cachePath || speaker.cachePath || "",
    normalize: speaker.normalize,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  const storedAudio = await storeSpeakerAsset(persona, speaker.refPath, "audio");
  persona.refPath = storedAudio.path;
  persona.refName = speaker.refName || storedAudio.fileName;
  if (!persona.cachePath) await ensureSpeakerCachePath(persona);
  if (speaker.photoPath) {
    const storedPhoto = await storeSpeakerAsset(persona, speaker.photoPath, "image");
    persona.photoPath = storedPhoto.path;
  }
  upsertSpeakerPersona(persona);
  speaker.personaId = persona.id;
  speaker.refPath = persona.refPath;
  speaker.refName = persona.refName;
  speaker.photoPath = persona.photoPath;
  speaker.cachePath = persona.cachePath;
  renderMultiWorkflow();
  showToast(`Saved speaker identity: ${persona.name}`);
}

async function setLineAudioFromPath(line: MultiLine, path: string, name?: string): Promise<void> {
  const prepared = await prepareReferenceAudioFile(path, name);
  line.overridePath = prepared.path;
  line.overrideName = prepared.name;
  renderMultiLines();
}

async function setLineAudioFromDrop(line: MultiLine, files: FileList | null): Promise<void> {
  const file = files?.[0];
  if (!file) return;
  const path = (file as any).path as string | undefined;
  if (!path) {
    return;
  }
  await setLineAudioFromPath(line, path, file.name);
}

function applyTaggedScriptImport(): void {
  const script = el<HTMLTextAreaElement>("#multi-script-input").value;
  const rows = script.split(/\r?\n/);
  const parsed: { tag: string; text: string }[] = [];
  for (const raw of rows) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^\[([^\]]+)\]\s*(.+)$/);
    if (match) {
      parsed.push({ tag: match[1].trim(), text: match[2].trim() });
    } else if (parsed.length > 0) {
      parsed[parsed.length - 1].text = `${parsed[parsed.length - 1].text}\n${line}`;
    }
  }
  if (parsed.length === 0) {
    showToast("Use lines like [Speaker1] text to import a script", "warning");
    return;
  }

  const unresolvedTags: string[] = [];
  for (const row of parsed) {
    let speaker = multiSpeakers.find((item) => item.name.toLowerCase() === row.tag.toLowerCase());
    if (!speaker) {
      speaker = createSpeaker(row.tag);
      const persona = speakerPersonas.find((item) => item.name.toLowerCase() === row.tag.toLowerCase());
      if (persona) {
        speaker.personaId = persona.id;
        speaker.refPath = persona.refPath || null;
        speaker.refName = persona.refName;
        speaker.refText = persona.refText;
        speaker.notes = persona.notes;
        speaker.photoPath = persona.photoPath;
        speaker.cachePath = persona.cachePath;
        speaker.normalize = persona.normalize;
        void ensureSpeakerCachePath(persona).then((path) => {
          if (speaker) speaker.cachePath = path;
        }).catch((e) => console.warn("Speaker cache path failed", e));
      } else if (!unresolvedTags.some((tag) => tag.toLowerCase() === row.tag.toLowerCase())) {
        unresolvedTags.push(row.tag);
      }
      multiSpeakers.push(speaker);
    }
  }
  while (multiSpeakers.length < 2) multiSpeakers.push(createSpeaker());

  multiLines.splice(0, multiLines.length);
  for (const row of parsed) {
    const speaker = multiSpeakers.find((item) => item.name.toLowerCase() === row.tag.toLowerCase()) || multiSpeakers[0];
    const line = createLine(speaker.id);
    line.text = row.text;
    multiLines.push(line);
  }
  while (multiLines.length < 2) multiLines.push(createLine(multiSpeakers[multiLines.length]?.id || multiSpeakers[0]?.id));
  renderMultiWorkflow();
  if (unresolvedTags.length > 0) {
    showToast(`Imported ${parsed.length} lines. Add reference voices for: ${unresolvedTags.join(", ")}`, "warning");
  } else {
    showToast(`Imported ${parsed.length} tagged script line${parsed.length === 1 ? "" : "s"}`);
  }
}

function reorderMultiLine(targetLineId: string, clientY: number): void {
  if (!draggedLineId || draggedLineId === targetLineId) return;
  const from = multiLines.findIndex((line) => line.id === draggedLineId);
  const to = multiLines.findIndex((line) => line.id === targetLineId);
  if (from < 0 || to < 0) return;
  const targetEl = document.querySelector<HTMLElement>(`[data-line-id="${targetLineId}"]`);
  const rect = targetEl?.getBoundingClientRect();
  const insertAfter = rect ? clientY > rect.top + rect.height / 2 : false;
  const [line] = multiLines.splice(from, 1);
  let nextIndex = to;
  if (from < to) nextIndex -= 1;
  if (insertAfter) nextIndex += 1;
  multiLines.splice(Math.max(0, Math.min(multiLines.length, nextIndex)), 0, line);
  renderMultiLines();
}

function moveDraggedLineToEnd(): void {
  if (!draggedLineId) return;
  const from = multiLines.findIndex((line) => line.id === draggedLineId);
  if (from < 0 || from === multiLines.length - 1) return;
  const [line] = multiLines.splice(from, 1);
  multiLines.push(line);
  renderMultiLines();
}

function initMultiSpeakerWorkflow(): void {
  ensureMultiDefaults();
  renderMultiWorkflow();

  el("#apply-speaker-tags").addEventListener("click", updateSpeakerTagsFromInput);
  el("#add-speaker-btn").addEventListener("click", () => {
    multiSpeakers.push(createSpeaker());
    renderMultiWorkflow();
  });
  el("#add-line-btn").addEventListener("click", () => {
    multiLines.push(createLine(multiSpeakers[0]?.id));
    renderMultiLines();
  });
  el("#clear-lines-btn").addEventListener("click", resetMultiLines);
  el("#multi-script-import-btn").addEventListener("click", applyTaggedScriptImport);

  const speakerList = el<HTMLElement>("#speaker-library");
  speakerList.addEventListener("input", (event) => {
    const target = event.target as HTMLElement;
    const speaker = speakerFromElement(target);
    if (!speaker) return;
    if ((target as HTMLInputElement).dataset.field === "speaker-name") {
      speaker.name = (target as HTMLInputElement).value || "Speaker";
      renderMultiLines();
    } else if ((target as HTMLTextAreaElement).dataset.field === "speaker-transcript") {
      speaker.refText = (target as HTMLTextAreaElement).value;
    } else if ((target as HTMLTextAreaElement).dataset.field === "speaker-notes") {
      speaker.notes = (target as HTMLTextAreaElement).value;
    }
  });
  speakerList.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const speaker = speakerFromElement(target);
    if (speaker && target.dataset.field === "speaker-persona") {
      speaker.personaId = target.value;
      if (target.value) applyPersonaToMultiSpeaker(speaker, target.value);
    } else if (speaker && target.dataset.field === "speaker-normalize") {
      speaker.normalize = (target as HTMLInputElement).checked;
    }
  });
  speakerList.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const action = target.dataset.action || target.closest<HTMLElement>("[data-action]")?.dataset.action;
    const speaker = speakerFromElement(target);
    if (!speaker || !action) return;
    if (action === "toggle-speaker") {
      speaker.open = !speaker.open;
      renderMultiSpeakers();
    } else if (action === "remove-speaker" && multiSpeakers.length > 2) {
      const idx = multiSpeakers.findIndex((item) => item.id === speaker.id);
      multiSpeakers.splice(idx, 1);
      for (const line of multiLines) {
        if (line.speakerId === speaker.id) line.speakerId = multiSpeakers[0]?.id || "";
      }
      renderMultiWorkflow();
    } else if (action === "pick-speaker-audio") {
      const file = await pickReferenceAudioFile();
      if (file) {
        speaker.refPath = file.path;
        speaker.refName = file.name;
        speaker.personaId = "";
        speaker.cachePath = "";
        renderMultiSpeakers();
      }
    } else if (action === "record-speaker") {
      if (recordingSpeakerId === speaker.id) {
        recordingSpeakerId = null;
        stopRecMeter();
        try {
          const wav = await invoke<string>("stop_recording");
          const prepared = await prepareReferenceAudioFile(wav, "recording.wav");
          speaker.refPath = prepared.path;
          speaker.refName = prepared.name;
          speaker.personaId = "";
          speaker.cachePath = "";
        } catch (e) {
          showToast(`Recording failed: ${e}`, "error");
        }
        renderMultiSpeakers();
      } else if (recordingSpeakerId || activeRecordButton) {
        showToast("Already recording — stop it first", "warning");
      } else {
        try {
          setupRecLevelListener();
          await invoke("start_recording", { device: selectedMicDevice || null });
          recordingSpeakerId = speaker.id;
          renderMultiSpeakers();
          startRecMeter(
            document.querySelector<HTMLElement>(
              `.speaker-card[data-speaker-id="${speaker.id}"] .rec-meter-fill`,
            ),
          );
        } catch (e) {
          showToast(`Microphone error: ${e}`, "error");
        }
      }
    } else if (action === "clear-audio") {
      speaker.refPath = null;
      speaker.refName = "";
      renderMultiSpeakers();
    } else if (action === "auto-speaker") {
      if (!speaker.refPath) {
        showToast("Drop a reference voice first", "warning");
        return;
      }
      target.classList.add("transcribing");
      const text = await transcribeAudioText(speaker.refPath);
      target.classList.remove("transcribing");
      if (text !== null) {
        speaker.refText = text;
        renderMultiSpeakers();
      }
    }
  });
  speakerList.addEventListener("dragover", (event) => {
    const dz = (event.target as HTMLElement).closest<HTMLElement>(".dropzone");
    if (!dz) return;
    event.preventDefault();
    dz.classList.add("drag-over");
  });
  speakerList.addEventListener("dragleave", (event) => {
    (event.target as HTMLElement).closest<HTMLElement>(".dropzone")?.classList.remove("drag-over");
  });
  speakerList.addEventListener("drop", async (event) => {
    const target = event.target as HTMLElement;
    const dz = target.closest<HTMLElement>(".dropzone");
    const speaker = speakerFromElement(target);
    if (!dz || !speaker) return;
    event.preventDefault();
    dz.classList.remove("drag-over");
    await setSpeakerAudioFromDrop(speaker, event.dataTransfer?.files || null);
  });

  const lineList = el<HTMLElement>("#multi-lines");
  lineList.addEventListener("input", (event) => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const line = lineFromElement(target);
    if (!line) return;
    if (target.dataset.field === "line-text") line.text = target.value;
    else if (target.dataset.field === "line-transcript") line.overrideText = target.value;
    else if (target.dataset.field === "line-speaker") line.speakerId = target.value;
  });
  lineList.addEventListener("change", (event) => {
    const target = event.target as HTMLSelectElement;
    const line = lineFromElement(target);
    if (line && target.dataset.field === "line-speaker") line.speakerId = target.value;
  });
  lineList.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const action = target.dataset.action || target.closest<HTMLElement>("[data-action]")?.dataset.action;
    const line = lineFromElement(target);
    if (!line || !action) return;
    if (action === "toggle-line-ref") {
      line.open = !line.open;
      renderMultiLines();
    } else if (action === "remove-line" && multiLines.length > 2) {
      const idx = multiLines.findIndex((item) => item.id === line.id);
      multiLines.splice(idx, 1);
      renderMultiLines();
    } else if (action === "pick-line-audio") {
      const file = await pickReferenceAudioFile();
      if (file) {
        line.overridePath = file.path;
        line.overrideName = file.name;
        renderMultiLines();
      }
    } else if (action === "clear-audio") {
      line.overridePath = null;
      line.overrideName = "";
      renderMultiLines();
    } else if (action === "auto-line") {
      const path = line.overridePath || multiSpeakers.find((speaker) => speaker.id === line.speakerId)?.refPath;
      if (!path) {
        showToast("Drop a reference voice first", "warning");
        return;
      }
      target.classList.add("transcribing");
      const text = await transcribeAudioText(path);
      target.classList.remove("transcribing");
      if (text !== null) {
        line.overrideText = text;
        line.open = true;
        renderMultiLines();
      }
    }
  });
  lineList.addEventListener("pointerdown", (event) => {
    const grip = (event.target as HTMLElement).closest<HTMLElement>(".line-grip");
    const line = grip ? lineFromElement(grip) : undefined;
    if (!grip || !line || event.button !== 0) return;
    event.preventDefault();
    linePointerDrag = { id: line.id, pointerId: event.pointerId, grip, active: false };
    draggedLineId = line.id;
    grip.setPointerCapture(event.pointerId);
    grip.closest(".dialogue-line")?.classList.add("dragging");
  });
  const handleLinePointerMove = (event: PointerEvent) => {
    if (!linePointerDrag || linePointerDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    linePointerDrag.active = true;
    scrollMultiModeDuringDrag(event.clientY);
    const item = lineElementFromPoint(event.clientX, event.clientY);
    clearLineDragStyles(lineList);
    lineList.querySelector<HTMLElement>(`[data-line-id="${linePointerDrag.id}"]`)?.classList.add("dragging");
    if (item?.dataset.lineId && item.dataset.lineId !== linePointerDrag.id) item.classList.add("drag-target");
  };
  const finishLinePointerDrag = (event: PointerEvent) => {
    if (!linePointerDrag || linePointerDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const activeDrag = linePointerDrag;
    const item = lineElementFromPoint(event.clientX, event.clientY);
    const listRect = lineList.getBoundingClientRect();
    const inList =
      event.clientX >= listRect.left &&
      event.clientX <= listRect.right &&
      event.clientY >= listRect.top &&
      event.clientY <= listRect.bottom;
    if (activeDrag.active) {
      if (item?.dataset.lineId && item.dataset.lineId !== activeDrag.id) reorderMultiLine(item.dataset.lineId, event.clientY);
      else if (!item && inList) moveDraggedLineToEnd();
    }
    try {
      activeDrag.grip.releasePointerCapture(activeDrag.pointerId);
    } catch {
      // Pointer capture may already be released if the browser cancels the gesture.
    }
    linePointerDrag = null;
    draggedLineId = null;
    clearLineDragStyles(lineList);
  };
  window.addEventListener("pointermove", handleLinePointerMove);
  window.addEventListener("pointerup", finishLinePointerDrag);
  window.addEventListener("pointercancel", finishLinePointerDrag);
  lineList.addEventListener("dragstart", (event) => {
    const grip = (event.target as HTMLElement).closest<HTMLElement>(".line-grip");
    const line = grip ? lineFromElement(grip) : undefined;
    if (!line || !grip) {
      event.preventDefault();
      return;
    }
    draggedLineId = line.id;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", line.id);
      event.dataTransfer.setDragImage(grip, 10, 10);
    }
    grip.closest(".dialogue-line")?.classList.add("dragging");
  });
  lineList.addEventListener("dragover", (event) => {
    if (!draggedLineId || (event.target as HTMLElement).closest(".line-reference .dropzone")) return;
    const item = (event.target as HTMLElement).closest<HTMLElement>(".dialogue-line");
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    clearLineDragStyles(lineList);
    lineList.querySelector<HTMLElement>(`[data-line-id="${draggedLineId}"]`)?.classList.add("dragging");
    item?.classList.add("drag-target");
  });
  lineList.addEventListener("dragleave", (event) => {
    (event.target as HTMLElement).closest<HTMLElement>(".dialogue-line")?.classList.remove("drag-target");
  });
  lineList.addEventListener("drop", (event) => {
    if (!draggedLineId || (event.target as HTMLElement).closest(".line-reference .dropzone")) return;
    const item = (event.target as HTMLElement).closest<HTMLElement>(".dialogue-line");
    event.preventDefault();
    event.stopPropagation();
    if (item?.dataset.lineId) reorderMultiLine(item.dataset.lineId, event.clientY);
    else moveDraggedLineToEnd();
  });
  lineList.addEventListener("dragend", () => {
    draggedLineId = null;
    clearLineDragStyles(lineList);
  });
  lineList.addEventListener("dragover", (event) => {
    if (draggedLineId) return;
    const dz = (event.target as HTMLElement).closest<HTMLElement>(".line-reference .dropzone");
    if (!dz) return;
    event.preventDefault();
    dz.classList.add("drag-over");
  });
  lineList.addEventListener("drop", async (event) => {
    if (draggedLineId) return;
    const target = event.target as HTMLElement;
    const dz = target.closest<HTMLElement>(".line-reference .dropzone");
    const line = lineFromElement(target);
    if (!dz || !line) return;
    event.preventDefault();
    dz.classList.remove("drag-over");
    await setLineAudioFromDrop(line, event.dataTransfer?.files || null);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Advanced options
// ═══════════════════════════════════════════════════════════════════════════

function initAdvancedOptions(): void {
  const sliders: [string, string, (v: number) => string][] = [
    ["#opt-temperature", "#val-temperature", (v) => v.toFixed(2)],
    ["#opt-top-k", "#val-top-k", (v) => String(Math.round(v))],
    ["#opt-top-p", "#val-top-p", (v) => v.toFixed(2)],
    ["#opt-pause", "#val-pause", (v) => v.toFixed(2)],
    ["#opt-speaker-pause", "#val-speaker-pause", (v) => v.toFixed(2)],
  ];
  for (const [inputId, valueId, fmt] of sliders) {
    const input = el<HTMLInputElement>(inputId);
    const update = () => setText(valueId, fmt(parseFloat(input.value)));
    input.addEventListener("input", update);
    update();
  }

  // Longform chunking toggle — show/hide chunk size + pause fields
  const chunkToggle = el<HTMLInputElement>("#opt-chunk-enabled");
  const updateChunkFields = () => {
    const enabled = chunkToggle.checked;
    el<HTMLInputElement>("#opt-chunk-size").disabled = !enabled;
    el<HTMLInputElement>("#opt-pause").disabled = !enabled;
    el<HTMLElement>("#chunk-size-row").classList.toggle("disabled-row", !enabled);
    el<HTMLElement>("#pause-row").classList.toggle("disabled-row", !enabled);
    el<HTMLElement>("#val-pause").style.opacity = enabled ? "1" : "0.4";
  };
  chunkToggle.addEventListener("change", updateChunkFields);
  updateChunkFields();

  el("#seed-randomize").addEventListener("click", () => {
    el<HTMLInputElement>("#opt-seed").value = String(Math.floor(Math.random() * 2147483647));
  });
}

function gatherOptions(): Record<string, number | string | boolean> {
  const temp = parseFloat(el<HTMLInputElement>("#opt-temperature").value);
  const topK = parseInt(el<HTMLInputElement>("#opt-top-k").value, 10);
  const topP = parseFloat(el<HTMLInputElement>("#opt-top-p").value);
  let seed = parseInt(el<HTMLInputElement>("#opt-seed").value, 10);
  const seedMode = el<HTMLSelectElement>("#opt-seed-mode").value;
  const maxTokens = parseInt(el<HTMLInputElement>("#opt-max-tokens").value, 10);
  const chunkEnabled = el<HTMLInputElement>("#opt-chunk-enabled").checked;
  const chunkSize = parseInt(el<HTMLInputElement>("#opt-chunk-size").value, 10);
  const pause = parseFloat(el<HTMLInputElement>("#opt-pause").value);
  const speakerPause = parseFloat(el<HTMLInputElement>("#opt-speaker-pause").value);

  // Apply seed mode
  if (seedMode === "random") {
    seed = Math.floor(Math.random() * 2147483647);
    el<HTMLInputElement>("#opt-seed").value = String(seed);
  }

  const opts: Record<string, number | string | boolean> = {
    temperature: temp,
    top_k: topK,
    top_p: topP,
    seed,
    max_tokens: maxTokens,
    stream_playback: streamPlayback,
  };

  if (chunkEnabled) {
    opts.text_chunk_size = chunkSize;
    opts.pause_between_chunks = pause;
  }

  if (currentMode === "multi") {
    opts.pause_between_speakers = speakerPause;
  }

  return opts;
}

function deliveryControlPrefix(): string {
  const emotion = el<HTMLSelectElement>("#opt-emotion").value;
  const style = el<HTMLSelectElement>("#opt-style").value;
  const speed = el<HTMLSelectElement>("#opt-speed").value;
  const pitch = el<HTMLSelectElement>("#opt-pitch").value;
  const expressive = el<HTMLSelectElement>("#opt-expressive").value;
  const parts: string[] = [];
  if (emotion) parts.push(`<|emotion:${emotion}|>`);
  if (style) parts.push(`<|style:${style}|>`);
  for (const prosody of [speed, pitch, expressive]) {
    if (prosody) parts.push(`<|prosody:${prosody}|>`);
  }
  return parts.join("");
}

function applyDeliveryControls(text: string): string {
  return `${deliveryControlPrefix()}${text}`;
}

function advanceSeedAfterGeneration(): void {
  const seedMode = el<HTMLSelectElement>("#opt-seed-mode").value;
  const seedEl = el<HTMLInputElement>("#opt-seed");
  const cur = parseInt(seedEl.value, 10) || 0;
  if (seedMode === "increment") {
    seedEl.value = String(cur + 1);
  } else if (seedMode === "decrement") {
    seedEl.value = String(cur - 1);
  } else if (seedMode === "random") {
    seedEl.value = String(Math.floor(Math.random() * 2147483647));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Generate / Cancel
// ═══════════════════════════════════════════════════════════════════════════

function modeLabel(mode: GenerationMode): string {
  if (mode === "tts") return "TTS";
  if (mode === "clone") return "Voice Clone";
  if (mode === "finish") return "Continue Speech";
  return "Multi Speaker";
}

function updateGeneratingTabs(): void {
  for (const tab of document.querySelectorAll<HTMLButtonElement>(".mode-tab")) {
    tab.classList.toggle("generating", tab.dataset.mode === activeGenerationJob?.mode);
  }
}

function updateGenerationControls(): void {
  const modeCanGenerate = isGenerationMode(currentMode);
  const isUtility = currentMode === "history" || currentMode === "api" || currentMode === "speakers" || currentMode === "batch";
  const generateBtn = el<HTMLButtonElement>("#generate-btn");
  const queueBtn = el<HTMLButtonElement>("#queue-btn");
  const cancelBtn = el<HTMLButtonElement>("#cancel-btn");
  el<HTMLElement>("#action-row").classList.toggle("hidden", isUtility || !modeCanGenerate);
  generateBtn.classList.toggle("hidden", isGenerating || !modeCanGenerate);
  queueBtn.classList.toggle("hidden", !isGenerating || !modeCanGenerate);
  cancelBtn.classList.toggle("hidden", !isGenerating || activeGenerationJob?.mode !== currentMode);
  el<HTMLElement>("#progress-section").classList.toggle(
    "hidden",
    isUtility || !isGenerating || activeGenerationJob?.mode !== currentMode,
  );
  updateGeneratingTabs();
}

function isLiveStudioJob(job: StudioJobEvent): boolean {
  return job.status === "queued" || job.status === "generating";
}

function externalWorkflowLabel(workflow: string): string {
  if (workflow === "tts") return "TTS";
  if (workflow === "voice_clone") return "Voice Clone";
  if (workflow === "finish") return "Continue Speech";
  if (workflow === "multi") return "Multi Speaker";
  return workflow || "API";
}

function renderQueuePanel(): void {
  const panel = el<HTMLElement>("#queue-panel");
  const externalJobs = Array.from(externalStudioJobs.values()).filter(isLiveStudioJob);
  const externalActive = externalJobs.find((job) => job.status === "generating") || null;
  const externalQueuedCount = externalJobs.filter((job) => job.status === "queued").length;
  const waitingCount = generationQueue.length + externalQueuedCount;
  const hasItems = Boolean(activeGenerationJob) || generationQueue.length > 0 || externalJobs.length > 0;
  panel.classList.toggle("hidden", !hasItems);
  setText("#queue-status", activeGenerationJob || externalActive
    ? `${waitingCount} queued`
    : waitingCount > 0
      ? `${waitingCount} waiting`
      : "Idle");
  const active = el<HTMLElement>("#queue-active");
  if (activeGenerationJob) {
    active.textContent = `Generating: ${modeLabel(activeGenerationJob.mode)} - ${activeGenerationJob.label}`;
  } else if (externalActive) {
    active.textContent = `API: ${externalWorkflowLabel(externalActive.workflow)} - ${externalActive.label || externalActive.phase}`;
  } else {
    active.textContent = "Nothing generating";
  }
  const list = el<HTMLElement>("#queue-list");
  list.innerHTML = "";
  if (generationQueue.length === 0 && externalJobs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "queue-empty";
    empty.textContent = t("No queued generations");
    list.appendChild(empty);
  } else {
    generationQueue.forEach((job, index) => {
      const item = document.createElement("div");
      item.className = "queue-item";
      item.dataset.queueId = job.id;
      item.innerHTML = `
        <span class="queue-number">${index + 1}</span>
        <span class="queue-main">
          <strong>${escapeHtml(modeLabel(job.mode))}</strong>
          <span>${escapeHtml(job.label)}</span>
        </span>
        <span class="queue-actions">
          <button class="compact-button" data-queue-action="edit" type="button">Edit</button>
          <button class="compact-button danger" data-queue-action="remove" type="button">Delete</button>
        </span>
      `;
      list.appendChild(item);
    });
    externalJobs.forEach((job) => {
      const progress = job.total && job.total > 1 && typeof job.current === "number"
        ? `${job.current}/${job.total}`
        : job.phase || job.status;
      const item = document.createElement("div");
      item.className = `queue-item external ${job.status}`;
      item.innerHTML = `
        <span class="queue-number">API</span>
        <span class="queue-main">
          <strong>${escapeHtml(externalWorkflowLabel(job.workflow))}</strong>
          <span>${escapeHtml(job.label || job.message || "API request")}</span>
        </span>
        <span class="queue-actions">
          <span class="queue-pill">${escapeHtml(progress)}</span>
        </span>
      `;
      list.appendChild(item);
    });
  }
  translateStaticDom(list);
  el<HTMLButtonElement>("#queue-clear-btn").disabled = generationQueue.length === 0;
}

function jobLabel(job: GenerationJob): string {
  const payload = job.payload;
  if (payload.kind === "tts") return payload.text.slice(0, 48) || "Plain TTS";
  if (payload.kind === "clone") return payload.text.slice(0, 48) || payload.refName || "Voice clone";
  if (payload.kind === "finish") return payload.text.slice(0, 48) || payload.refName || "Continue speech";
  if (payload.kind === "scene") return payload.script.replace(/\s+/g, " ").trim().slice(0, 48) || "Scene";
  return payload.lines.map((line) => line.text.trim()).filter(Boolean).join(" / ").slice(0, 48) || "Multi speaker";
}

function captureCurrentGenerationJob(overrideText?: string): GenerationJob {
  if (!isGenerationMode(currentMode)) {
    throw new Error("This tab cannot generate audio");
  }
  if (activeEngine === "drama") return captureDramaGenerationJob(overrideText);
  const options = gatherOptions();
  const deliveryPrefix = deliveryControlPrefix();
  let payload: GenerationJob["payload"];
  if (currentMode === "tts") {
    const text = (overrideText ?? el<HTMLTextAreaElement>("#tts-text").value).trim();
    if (!text) throw new Error("Please enter text to speak");
    payload = { kind: "tts", text };
  } else if (currentMode === "clone") {
    const text = (overrideText ?? el<HTMLTextAreaElement>("#clone-text").value).trim();
    if (!text) throw new Error("Please enter text to speak");
    if (!cloneRefPath) throw new Error("Please provide a reference voice");
    payload = {
      kind: "clone",
      text,
      refPath: cloneRefPath,
      refName: cloneRefName,
      refText: el<HTMLTextAreaElement>("#clone-ref-text").value.trim() || undefined,
      normalize: el<HTMLInputElement>("#clone-normalize-ref").checked,
      personaId: clonePersonaId,
    };
  } else if (currentMode === "finish") {
    if (!finishRefPath) throw new Error("Please provide audio to continue");
    const text = el<HTMLTextAreaElement>("#finish-text").value.trim();
    if (!text) throw new Error("Continuation text is required");
    payload = {
      kind: "finish",
      text,
      refPath: finishRefPath,
      refName: finishRefName,
      transcript: el<HTMLTextAreaElement>("#finish-transcript").value.trim(),
      normalize: el<HTMLInputElement>("#finish-normalize-ref").checked,
      includeSource: el<HTMLInputElement>("#finish-include-source").checked,
      personaId: finishPersonaId,
    };
  } else {
    ensureMultiDefaults();
    assertMultiSpeakerReady(multiSpeakers, multiLines);
    payload = {
      kind: "multi",
      speakers: multiSpeakers.map(cloneMultiSpeaker),
      lines: multiLines.map(cloneMultiLine),
    };
  }
  const job: GenerationJob = {
    id: nextId("queue"),
    mode: currentMode,
    label: "",
    createdAt: Date.now(),
    options,
    deliveryPrefix,
    payload,
  };
  job.label = jobLabel(job);
  return job;
}

function enqueueCurrentGenerationJob(): void {
  try {
    const job = captureCurrentGenerationJob();
    generationQueue.push(job);
    renderQueuePanel();
    updateGenerationControls();
    showToast(`Queued: ${job.label}`);
  } catch (e) {
    showToast(String(e), "warning");
  }
}

function applyOptionsToUi(options: Record<string, number | string | boolean>): void {
  const setValue = (selector: string, value: unknown) => {
    const input = document.querySelector<HTMLInputElement>(selector);
    if (!input || value === undefined) return;
    input.value = String(value);
    input.dispatchEvent(new Event("input"));
  };
  setValue("#opt-temperature", options.temperature);
  setValue("#opt-top-k", options.top_k);
  setValue("#opt-top-p", options.top_p);
  setValue("#opt-seed", options.seed);
  setValue("#opt-max-tokens", options.max_tokens);
  const chunk = Boolean(options.text_chunk_size || options.pause_between_chunks);
  el<HTMLInputElement>("#opt-chunk-enabled").checked = chunk;
  el<HTMLInputElement>("#opt-chunk-enabled").dispatchEvent(new Event("change"));
  setValue("#opt-chunk-size", options.text_chunk_size);
  setValue("#opt-pause", options.pause_between_chunks);
  setValue("#opt-speaker-pause", options.pause_between_speakers);
}

function loadQueuedJobForEdit(job: GenerationJob): void {
  if ((job.engine || "higgs") !== activeEngine) applyEngineKind(job.engine || "higgs");
  switchMode(job.mode);
  if (job.engine === "drama") {
    applyDramaOptionsToUi(dramaOptionsFromRequest(job.options));
    if (job.dramaVoice) selectDramaVoice(job.dramaVoice);
  } else {
    applyOptionsToUi(job.options);
  }
  const payload = job.payload;
  if (payload.kind === "tts") {
    el<HTMLTextAreaElement>("#tts-text").value = payload.text;
  } else if (payload.kind === "clone") {
    el<HTMLTextAreaElement>("#clone-text").value = payload.text;
    cloneRefPath = payload.refPath;
    clonePersonaId = payload.personaId || "";
    cloneRefName = payload.refName;
    setDropzoneFile("#clone-dropzone", payload.refName || payload.refPath.split(/[/\\]/).pop() || "reference");
    showRefPreview("clone", payload.refPath);
    el<HTMLTextAreaElement>("#clone-ref-text").value = payload.refText || "";
    el<HTMLInputElement>("#clone-normalize-ref").checked = payload.normalize;
  } else if (payload.kind === "finish") {
    el<HTMLTextAreaElement>("#finish-text").value = payload.text;
    finishRefPath = payload.refPath;
    finishPersonaId = payload.personaId || "";
    finishRefName = payload.refName;
    setDropzoneFile("#finish-dropzone", payload.refName || payload.refPath.split(/[/\\]/).pop() || "reference");
    showRefPreview("finish", payload.refPath);
    el<HTMLTextAreaElement>("#finish-transcript").value = payload.transcript;
    el<HTMLInputElement>("#finish-normalize-ref").checked = payload.normalize;
    el<HTMLInputElement>("#finish-include-source").checked = payload.includeSource;
  } else if (payload.kind === "scene") {
    dramaScene = {
      characters: payload.characters.map((c) => ({ ...c })),
      script: payload.script,
      mode: payload.sceneMode,
      pause: payload.pause,
      level: payload.level ?? true,
      check: payload.check ?? true,
      retries: payload.retries ?? 2,
    };
    saveDramaScene(dramaScene);
    renderDramaScene();
  } else {
    multiSpeakers.splice(0, multiSpeakers.length, ...payload.speakers.map(cloneMultiSpeaker));
    multiLines.splice(0, multiLines.length, ...payload.lines.map(cloneMultiLine));
    renderMultiWorkflow();
  }
  showToast("Loaded queued item for editing");
}

function removeQueuedJob(id: string): GenerationJob | null {
  const index = generationQueue.findIndex((job) => job.id === id);
  if (index < 0) return null;
  const [job] = generationQueue.splice(index, 1);
  renderQueuePanel();
  updateGenerationControls();
  return job;
}

function renderGenerationSteps(labels: string[], activeIndex = 0, completedThrough = -1): void {
  currentProgressLabels = labels;
  const steps = el<HTMLElement>("#gen-progress-steps");
  steps.innerHTML = "";
  labels.forEach((label, index) => {
    const item = document.createElement("span");
    item.className = "progress-step";
    if (index <= completedThrough) item.classList.add("complete");
    if (index === activeIndex) item.classList.add("active");
    item.textContent = label;
    steps.appendChild(item);
  });
}

function updateGenerationStep(activeIndex: number, completedThrough = activeIndex - 1): void {
  if (currentProgressLabels.length === 0) return;
  renderGenerationSteps(currentProgressLabels, activeIndex, completedThrough);
}

function generationStepForPhase(phase: string): number {
  const p = phase.toLowerCase();
  if (p.includes("output") || p.includes("save") || p.includes("complete") || p.includes("done")) return 4;
  if (p.includes("decode") || p.includes("audio") || p.includes("process")) return 3;
  if (p.includes("generate") || p.includes("sample") || p.includes("token")) return 2;
  if (p.includes("reference") || p.includes("voice") || p.includes("load")) return 1;
  return 0;
}

function generationElapsedLabel(prefix = "Elapsed"): string {
  const elapsed = genStartedAt > 0 ? ((performance.now() - genStartedAt) / 1000).toFixed(1) : "0.0";
  return `${prefix} ${elapsed}s`;
}

function setGenerationElapsedLabel(prefix = generationProgressPrefix): void {
  generationProgressPrefix = prefix;
  setText("#gen-progress-text", generationElapsedLabel(prefix));
}

function beginGeneration(job: GenerationJob): void {
  isGenerating = true;
  cancelRequested = false;
  activeGenerationJob = job;
  generationProgressPrefix = "Elapsed";
  genStartedAt = performance.now();
  el<HTMLElement>("#output-section").classList.toggle("hidden", !streamPlayback);
  if (streamPlayback) startLiveStreamPreview();
  if (genTimer) clearInterval(genTimer);
  genTimer = window.setInterval(() => {
    if (!isGenerating || !activeGenerationJob) return;
    setGenerationElapsedLabel(generationProgressPrefix);
  }, 350);
  const cancelBtn = el<HTMLButtonElement>("#cancel-btn");
  cancelBtn.disabled = false;
  cancelBtn.textContent = "⏹ Cancel";
  updateGenerationControls();
  if (!streamPlayback) el<HTMLElement>("#output-section").classList.add("hidden");
  const bar = el<HTMLElement>("#gen-progress-bar");
  bar.classList.add("indeterminate");
  bar.style.width = "";
  renderGenerationSteps([]);
  setGenerationElapsedLabel();
  renderQueuePanel();
}

function finishGeneration(success: boolean, message: string, tone?: "success" | "warning" | "error"): void {
  isGenerating = false;
  if (!success || !liveStream) stopLiveStreamPreview();
  if (genTimer) {
    clearInterval(genTimer);
    genTimer = null;
  }
  const cancelBtn = el<HTMLButtonElement>("#cancel-btn");
  cancelBtn.disabled = false;
  cancelBtn.textContent = "⏹ Cancel";
  const bar = el<HTMLElement>("#gen-progress-bar");
  bar.classList.remove("indeterminate");
  if (success) {
    setProgress("#gen-progress-bar", 1, 1);
    renderGenerationSteps([]);
    setGenerationElapsedLabel("Complete in");
  }
  el<HTMLElement>("#progress-section").classList.add("hidden");
  activeGenerationJob = null;
  updateGenerationControls();
  renderQueuePanel();
  // Scene lines' Redo buttons wait for the generation to end.
  if (sceneLines.length > 0) renderSceneLineResults();
  if (message) showToast(message, tone || (success ? "success" : "error"));
}

async function resolveMultiLineReference(
  line: MultiLine,
  speakers: MultiSpeaker[],
  lines: MultiLine[],
): Promise<{ refPath: string; refText?: string; speakerName: string; normalize: boolean; cachePath?: string }> {
  const speaker = speakers.find((item) => item.id === line.speakerId);
  const refPath = line.overridePath || speaker?.refPath || "";
  if (!refPath) {
    throw new Error(`Line ${lines.indexOf(line) + 1} needs a reference voice`);
  }

  let refText = (line.overrideText || speaker?.refText || "").trim();
  if (!refText) {
    const text = await tryAutoTranscribeSilently(refPath);
    if (text) {
      refText = text;
      if (line.overridePath) line.overrideText = text;
      else if (speaker) speaker.refText = text;
    }
  }
  let cachePath = "";
  if (!line.overridePath && speaker?.personaId) {
    const persona = findPersona(speaker.personaId);
    if (persona) {
      cachePath = await ensureSpeakerCachePath(persona);
      speaker.cachePath = cachePath;
    } else {
      cachePath = speaker.cachePath || "";
    }
  } else if (!line.overridePath) {
    cachePath = speaker?.cachePath || "";
  }

  return {
    refPath,
    refText: refText || undefined,
    speakerName: speaker?.name || "Speaker",
    normalize: speaker?.normalize || false,
    cachePath: cachePath || undefined,
  };
}

// Level-match a clip to a common loudness (EBU R128, ~-20 LUFS) so segments
// built from references of different volume sound consistent when concatenated.
async function normalizeResultLoudness(result: GenerationResult, targetLufs = -20): Promise<GenerationResult> {
  try {
    const wavBase64 = await invoke<string>("normalize_wav", { wavBase64: result.wavBase64, targetLufs });
    return { ...result, wavBase64 };
  } catch (e) {
    console.warn("Loudness normalize failed", e);
    return result;
  }
}

async function generateMultiSpeakerJob(job: GenerationJob & { payload: { kind: "multi"; speakers: MultiSpeaker[]; lines: MultiLine[] } }): Promise<GenerationResult> {
  const options = job.options;
  const lines = job.payload.lines;
  const speakers = job.payload.speakers;
  const speakerPause = typeof options.pause_between_speakers === "number" ? options.pause_between_speakers : 0.15;
  const lineOptions = { ...options };
  delete lineOptions.pause_between_speakers;
  assertMultiSpeakerReady(speakers, lines);

  renderGenerationSteps([]);

  const outputs: GenerationResult[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    setProgress("#gen-progress-bar", i, lines.length);
    const resolved = await resolveMultiLineReference(line, speakers, lines);
    setGenerationElapsedLabel(`Line ${i + 1}/${lines.length} ·`);
    const perLineOptions: Record<string, number | string | boolean> = { ...lineOptions, normalize_reference: resolved.normalize };
    if (resolved.cachePath) perLineOptions.reference_cache_path = resolved.cachePath;
    const result = await invoke<GenerationResult>("generate_voice_clone", {
      request: {
        text: `${job.deliveryPrefix}${line.text.trim()}`,
        refAudioPath: resolved.refPath,
        refText: resolved.refText,
        options: perLineOptions,
      },
    });
    outputs.push(result);
    setProgress("#gen-progress-bar", i + 1, lines.length);
  }
  // Level-match every speaker segment to a common loudness before joining.
  const leveled = await Promise.all(outputs.map((r) => normalizeResultLoudness(r)));
  return concatenateWavResults(leveled, speakerPause);
}

async function generateJobAudio(job: GenerationJob): Promise<GenerationResult> {
  if (job.engine === "drama") return generateDramaJob(job);
  const payload = job.payload;
  if (payload.kind === "tts") {
    return invoke<GenerationResult>("generate_tts", {
      request: { text: `${job.deliveryPrefix}${payload.text}`, options: job.options },
    });
  }
  if (payload.kind === "clone") {
    const options: Record<string, number | string | boolean> = { ...job.options, normalize_reference: payload.normalize };
    if (payload.personaId) {
      const persona = findPersona(payload.personaId);
      if (persona) options.reference_cache_path = await ensureSpeakerCachePath(persona);
    }
    return invoke<GenerationResult>("generate_voice_clone", {
      request: {
        text: `${job.deliveryPrefix}${payload.text}`,
        refAudioPath: payload.refPath,
        refText: payload.refText,
        options,
      },
    });
  }
  if (payload.kind === "finish") {
    const options: Record<string, number | string | boolean> = {
      ...job.options,
      reference_text: payload.transcript,
      normalize_reference: payload.normalize,
    };
    if (payload.personaId) {
      const persona = findPersona(payload.personaId);
      if (persona) options.reference_cache_path = await ensureSpeakerCachePath(persona);
    }
    let result = await invoke<GenerationResult>("generate_finish_sentence", {
      request: {
        audioPath: payload.refPath,
        continuationText: `${job.deliveryPrefix}${payload.text}`,
        options,
      },
    });
    if (payload.includeSource) {
      setGenerationElapsedLabel();
      const source = await invoke<GenerationResult>("read_audio_as_wav", {
        audioPath: payload.refPath,
        targetSampleRate: result.sampleRate,
      });
      // Match the continuation's loudness to the source clip so the join is seamless.
      const [nsrc, nres] = await Promise.all([
        normalizeResultLoudness(source),
        normalizeResultLoudness(result),
      ]);
      result = concatenateWavResults([nsrc, nres]);
    }
    return result;
  }
  return generateMultiSpeakerJob(job as GenerationJob & { payload: { kind: "multi"; speakers: MultiSpeaker[]; lines: MultiLine[] } });
}

async function runGenerationJob(job: GenerationJob): Promise<void> {
  let startNext = true;
  try {
    beginGeneration(job);
    const result = await generateJobAudio(job);
    if (cancelRequested) {
      cancelRequested = false;
      finishGeneration(false, "Generation cancelled", "warning");
      return;
    }
    setGenerationElapsedLabel();
    lastResult = result;
    // A Drama 3 TTS take can be locked as a voice: keep what it says.
    lastResultSpokenText = job.engine === "drama" && job.payload.kind === "tts" ? job.payload.text : null;
    showOutput(result, job.mode);
    setGenerationElapsedLabel();
    addHistory(job.mode, job.label || "Untitled", result);
    finishGeneration(true, "Generation complete");
    if (job.engine !== "drama") advanceSeedAfterGeneration();
  } catch (e) {
    const message = String(e);
    if (cancelRequested || message.toLowerCase().includes("cancel")) {
      cancelRequested = false;
      finishGeneration(false, "Generation cancelled", "warning");
    } else {
      startNext = false;
      finishGeneration(false, `Generation failed: ${e}`);
    }
  } finally {
    renderQueuePanel();
    updateGenerationControls();
    if (startNext && generationQueue.length > 0) {
      const next = generationQueue.shift()!;
      renderQueuePanel();
      void runGenerationJob(next);
    }
  }
}

// Make sure the engine + a model are loaded before generating. Auto-loads
// whatever is already available so the user doesn't have to click Load Engine /
// Load Model by hand. Returns false only if something is genuinely missing
// (no valid engine, or no model selected/downloaded).
async function ensureLoadedForGeneration(): Promise<boolean> {
  if (activeEngine === "drama") return ensureDramaLoaded();
  let status = await invoke<ModelStatusEvent>("engine_status").catch(() => null);

  // Engine — auto-load if present; if the DLL isn't downloaded at all, open the
  // engine downloader.
  if (!status?.engineLoaded) {
    const bundled = await invoke<string | null>("bundled_engine_path").catch(() => null);
    const savedEngine = localStorage.getItem(ENGINE_PATH_STORAGE_KEY) || "";
    if (!bundled && !savedEngine) {
      showToast(t("Download the engine first — opening downloader"), "warning");
      el<HTMLButtonElement>("#download-engine-btn").click();
      return false;
    }
    showToast(t("Loading engine…"));
    await doLoadEngine();
    status = await invoke<ModelStatusEvent>("engine_status").catch(() => null);
    if (!status?.engineLoaded) return false; // doLoadEngine already surfaced why
  }

  // Model — auto-select+load a downloaded one; if none is downloaded, open the
  // model downloader.
  if (!status?.modelLoaded) {
    const modelSel = el<HTMLSelectElement>("#model-select");
    if (!modelSel.value) {
      const saved = localStorage.getItem(MODEL_PATH_STORAGE_KEY) || "";
      if (saved) {
        addLocalModelOption(saved);
        modelSel.value = saved;
      }
    }
    if (!modelSel.value) {
      const models = await invoke<ModelListing[]>("list_models").catch(() => [] as ModelListing[]);
      const usable = models.filter((m) => m.hasConfig !== false);
      if (usable.length === 0) {
        showToast(t("Download a model first — opening downloader"), "warning");
        el<HTMLButtonElement>("#download-trigger").click();
        return false;
      }
      modelSel.value = usable[0].path;
    }
    showToast(t("Loading model…"));
    await doLoadModel();
    status = await invoke<ModelStatusEvent>("engine_status").catch(() => null);
    if (!status?.modelLoaded) return false;
  }
  return true;
}

// On startup, silently load the engine + last-used model if everything needed
// is already present, so the app is ready to generate right away.
async function autoStartupLoad(): Promise<void> {
  // Drama 3 takes ~21 GB of video memory: it loads on the first generation or by the
  // Load button, not at startup.
  if (activeEngine === "drama") return;
  try {
    const status = await invoke<ModelStatusEvent>("engine_status").catch(() => null);
    if (status?.engineLoaded && status?.modelLoaded) return;

    if (!status?.engineLoaded) {
      const bundled = await invoke<string | null>("bundled_engine_path").catch(() => null);
      const enginePath = localStorage.getItem(ENGINE_PATH_STORAGE_KEY) || bundled;
      if (!enginePath) return;
      const diag = await diagnoseEngineForPath(enginePath);
      if (diag && !diag.ok) return; // missing CUDA/runtime — let the user fix it, no spam
      await doLoadEngine();
    }

    const modelSel = el<HTMLSelectElement>("#model-select");
    if (!modelSel.value) {
      const savedModel = localStorage.getItem(MODEL_PATH_STORAGE_KEY) || "";
      if (savedModel && Array.from(modelSel.options).some((o) => o.value === savedModel)) {
        modelSel.value = savedModel;
      }
    }
    const nowLoaded = await invoke<ModelStatusEvent>("engine_status").catch(() => null);
    if (modelSel.value && !nowLoaded?.modelLoaded) {
      await doLoadModel();
    }
  } catch {
    // Silent: the user can still load manually.
  }
}

async function doGenerate(): Promise<void> {
  if (isGenerating) {
    enqueueCurrentGenerationJob();
    return;
  }
  try {
    if (!(await ensureLoadedForGeneration())) return;
    const job = captureCurrentGenerationJob();
    await runGenerationJob(job);
  } catch (e) {
    showToast(String(e), "warning");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Drama 3 engine (speech.cpp): engine switch, model panel, voices, options and
// remark buttons. The backend is src-tauri/src/speech_engine.rs (drama_* commands).
// ═══════════════════════════════════════════════════════════════════════════

type DramaVoiceInfo = { name: string; language: string; gender: string; description: string };
type DramaModelInfo = {
  name: string;
  weightType: string;
  sampleRate: number;
  voices: DramaVoiceInfo[];
  device?: string | null;
  threads: number;
  expertsOnCpu: boolean;
  weightBytes: number;
};
type DramaDevice = { index: number; name: string; description: string; kind: string; totalBytes: number; freeBytes: number };
type DramaStatus = {
  phase?: string;
  libraryLoaded: boolean;
  libraryPath?: string;
  version?: string;
  modelLoaded: boolean;
  modelPath?: string | null;
  modelInfo?: DramaModelInfo | null;
  generating: boolean;
};
type DramaGenerationResult = GenerationResult & { seed: number; stop: string; seconds: number };

let activeEngine: EngineKind = getEngineKind();
let dramaStatus: DramaStatus = { libraryLoaded: false, modelLoaded: false, generating: false };
let dramaDevices: DramaDevice[] = [];
let dramaLoading = false;
let dramaVoiceFiles = loadDramaVoiceFiles();

/** Tabs that only the Higgs engine can do so far. */
const HIGGS_ONLY_MODES: Mode[] = ["clone", "finish", "batch"];

function applyEngineKind(kind: EngineKind): void {
  activeEngine = kind;
  setEngineKind(kind);
  const drama = kind === "drama";
  el("#engine-pick-drama").classList.toggle("active", drama);
  el("#engine-pick-higgs").classList.toggle("active", !drama);
  el("#drama-panel").classList.toggle("hidden", !drama);
  el("#model-panel").classList.toggle("hidden", drama);
  for (const item of document.querySelectorAll<HTMLElement>(".drama-only")) {
    item.classList.toggle("hidden", !drama);
  }
  for (const item of document.querySelectorAll<HTMLElement>(".higgs-only")) {
    item.classList.toggle("hidden", drama);
  }
  for (const tab of document.querySelectorAll<HTMLButtonElement>(".mode-tab")) {
    if (HIGGS_ONLY_MODES.includes(tab.dataset.mode as Mode)) tab.classList.toggle("hidden", drama);
  }
  const unavailable = drama ? HIGGS_ONLY_MODES.includes(currentMode) : currentMode === "chapter" || currentMode === "voicestudio" || currentMode === "subtitles" || currentMode === "video";
  switchMode(unavailable ? "tts" : currentMode);
  if (drama) renderDramaChips();
  else void refreshHiggsChips();
}

async function refreshHiggsChips(): Promise<void> {
  const status = await invoke<ModelStatusEvent>("engine_status").catch(() => null);
  const engineLoaded = Boolean(status?.engineLoaded);
  const modelLoaded = Boolean(status?.modelLoaded);
  setText("#engine-chip", engineLoaded ? t("Engine loaded") : t("Engine unloaded"));
  el("#engine-chip").classList.toggle("active", engineLoaded);
  setText("#model-chip", modelLoaded ? selectedModelUiName() : t("No model"));
  el("#model-chip").classList.toggle("muted", !modelLoaded);
  el("#model-chip").classList.toggle("active", modelLoaded);
}

function renderDramaChips(): void {
  const s = dramaStatus;
  setText("#engine-chip", s.libraryLoaded ? `speech.cpp ${s.version || ""}`.trim() : t("Engine unloaded"));
  el("#engine-chip").classList.toggle("active", s.libraryLoaded);
  const info = s.modelLoaded ? s.modelInfo : null;
  setText("#model-chip", info ? `Drama 3 (${info.weightType})` : t("No model"));
  el("#model-chip").classList.toggle("muted", !info);
  el("#model-chip").classList.toggle("active", Boolean(info));
}

function gigabytes(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} ${t("GB")}`;
}

function renderDramaStatus(): void {
  const s = dramaStatus;
  const info = s.modelLoaded ? s.modelInfo : null;
  const state = el<HTMLElement>("#drama-state");
  setText("#drama-state", dramaLoading ? t("Loading…") : info ? t("Loaded") : t("Not loaded"));
  state.classList.toggle("ok", Boolean(info) && !dramaLoading);
  el<HTMLButtonElement>("#drama-load-btn").disabled = dramaLoading;
  el<HTMLButtonElement>("#drama-unload-btn").disabled = dramaLoading || !info;

  const detail = el<HTMLElement>("#drama-detail");
  const lines: string[] = [];
  let warn = false;
  if (dramaLoading) {
    lines.push(t("Loading the model into video memory, about half a minute…"));
  } else if (info) {
    const device = dramaDevices.find((d) => d.name === info.device);
    lines.push(`${t("Device")}: ${device ? device.description : info.device || "—"}`);
    if (device && device.kind !== "cpu") {
      lines.push(`${t("Video memory free")}: ${gigabytes(device.freeBytes)} ${t("of")} ${gigabytes(device.totalBytes)}`);
    }
    if (info.expertsOnCpu) {
      warn = true;
      lines.push(`${t("Part of the model runs on the CPU")} (${info.threads} ${t("threads")}): ${t("generation is slower. Close programs that use the GPU and reload the model.")}`);
    } else if (device && device.kind !== "cpu") {
      lines.push(t("The whole model is in video memory."));
    }
  } else if (s.libraryLoaded) {
    lines.push(`speech.cpp ${s.version || ""}: ${t("ready. The model loads on the first generation or with the Load button.")}`);
  }
  detail.textContent = lines.join("\n");
  detail.classList.toggle("warn", warn);
  renderDramaVoiceSelect();
  if (activeEngine === "drama") renderDramaChips();
}

function renderDramaDeviceSelect(): void {
  const select = el<HTMLSelectElement>("#drama-device");
  const saved = localStorage.getItem(DRAMA_DEVICE_STORAGE_KEY) || "auto";
  select.innerHTML = "";
  const auto = document.createElement("option");
  auto.value = "auto";
  auto.textContent = t("Auto (first GPU)");
  select.appendChild(auto);
  for (const device of dramaDevices) {
    const option = document.createElement("option");
    option.value = device.name;
    const memory = device.kind === "cpu" ? "" : ` · ${gigabytes(device.freeBytes)} ${t("free")}`;
    option.textContent = `${device.name}: ${device.description}${memory}`;
    select.appendChild(option);
  }
  select.value = Array.from(select.options).some((o) => o.value === saved) ? saved : "auto";
}

async function refreshDramaDevices(): Promise<void> {
  if (!dramaStatus.libraryLoaded) return;
  dramaDevices = await invoke<DramaDevice[]>("drama_devices").catch(() => dramaDevices);
  renderDramaDeviceSelect();
}

async function refreshDramaStatus(): Promise<void> {
  dramaStatus = await invoke<DramaStatus>("drama_status").catch(() => dramaStatus);
  renderDramaStatus();
}

/** Every voice file the model should have: added by hand, and made in the Speaker Gallery. */
function dramaVoiceSources(): DramaVoiceFile[] {
  const fromGallery = speakerPersonas
    .filter((p) => p.dramaVoicePath)
    .map((p) => ({ name: p.dramaVoiceName || p.name, path: p.dramaVoicePath! }));
  return [...dramaVoiceFiles, ...fromGallery];
}

function dramaVoiceNames(): string[] {
  const names = dramaStatus.modelLoaded && dramaStatus.modelInfo
    ? dramaStatus.modelInfo.voices.map((v) => v.name)
    : dramaVoiceSources().map((v) => v.name);
  return Array.from(new Set(["none", ...names]));
}

/** A voice name no other voice (in the model, saved, or in the gallery) has taken. */
function uniqueDramaVoiceName(base: string, except?: SpeakerPersona): string {
  const taken = new Set([
    "none",
    ...(dramaStatus.modelInfo?.voices.map((v) => v.name) || []),
    ...dramaVoiceFiles.map((v) => v.name),
    ...speakerPersonas.filter((p) => p !== except && p.dramaVoicePath).map((p) => p.dramaVoiceName || p.name),
  ]);
  const clean = base.trim() || "voice";
  let name = clean;
  for (let i = 2; taken.has(name); i++) name = `${clean}_${i}`;
  return name;
}

/** What a persona's Drama 3 voice is made of: every transcript and extra recording. */
function personaDramaSignature(persona: SpeakerPersona): string {
  const extras = (persona.extraRefs || []).map((r) => `\n${r.path}\u0001${r.text.trim()}`).join("");
  return `${persona.refText.trim()}${extras}`;
}

// ─── More recordings of one voice ───

const speakerExtraPlayer = new Audio();
let speakerExtraPlayerUrl = "";
let speakerExtraPlaying = -1;

function renderSpeakerExtras(persona: SpeakerPersona): void {
  const list = el<HTMLElement>("#speaker-extra-list");
  list.innerHTML = "";
  (persona.extraRefs || []).forEach((ref, index) => {
    const row = document.createElement("div");
    row.className = "speaker-extra-row";
    row.dataset.index = String(index);
    row.innerHTML = `
      <div class="speaker-extra-head">
        <button class="ref-play" data-action="play" type="button" aria-label="${escapeHtml(t("Play"))}">${speakerExtraPlaying === index ? "⏸" : "▶"}</button>
        <span class="speaker-extra-name"></span>
        <button class="link-button" data-action="transcribe" type="button">${escapeHtml(t("✦ Auto-transcribe"))}</button>
        <button class="icon-button danger" data-action="remove" type="button" title="${escapeHtml(t("Delete"))}">✕</button>
      </div>
      <textarea class="text-area" data-field="text" rows="2" placeholder="${escapeHtml(t("The exact words of this recording…"))}"></textarea>
    `;
    row.querySelector<HTMLElement>(".speaker-extra-name")!.textContent = `${index + 2}. ${ref.name}`;
    row.querySelector<HTMLTextAreaElement>('[data-field="text"]')!.value = ref.text;
    list.appendChild(row);
  });
}

function changedSpeakerExtras(persona: SpeakerPersona): void {
  persona.updatedAt = Date.now();
  persistSpeakerPersonas();
  scheduleSpeakerPersonaFolderSync(persona);
  renderSpeakerDramaState(persona);
}

/** Adds recordings to the selected voice: `paths`, or the files picked in a dialog. */
async function addSpeakerExtraRecordings(given?: string[]): Promise<void> {
  const persona = selectedGalleryPersona();
  if (!persona) return;
  if (!persona.refPath) {
    showToast(t("Add the main recording first"), "warning");
    return;
  }
  let paths = given ?? [];
  if (!given) {
    const selected = await open({
      multiple: true,
      filters: [{ name: "Audio", extensions: ["wav", "mp3", "flac", "m4a", "ogg", "aac", "opus"] }],
    });
    paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
  }
  for (const path of paths) {
    try {
      // Same preparation as the main recording: WAV, cleaned if that is on, at most 30 s.
      const prepared = await prepareReferenceAudioFile(path, path.split(/[/\\]/).pop());
      const stored = await invoke<{ path: string; fileName: string }>("store_speaker_extra_asset", {
        speakerId: persona.id,
        speakerName: persona.name,
        sourcePath: prepared.path,
      });
      persona.extraRefs = [...(persona.extraRefs || []), { path: stored.path, name: prepared.name, text: "" }];
      changedSpeakerExtras(persona);
      renderSpeakerExtras(persona);
      const text = await tryAutoTranscribeSilently(stored.path);
      const ref = persona.extraRefs.find((r) => r.path === stored.path);
      if (ref && text && !ref.text) {
        ref.text = text;
        changedSpeakerExtras(persona);
        renderSpeakerExtras(persona);
      }
    } catch (e) {
      showToast(`${t("Could not add the recording")}: ${e}`, "error");
    }
  }
}

function initSpeakerExtras(): void {
  el("#speaker-extra-add").addEventListener("click", () => void addSpeakerExtraRecordings());
  const list = el<HTMLElement>("#speaker-extra-list");
  list.addEventListener("input", (event) => {
    const area = event.target as HTMLTextAreaElement;
    const persona = selectedGalleryPersona();
    const ref = persona?.extraRefs?.[Number(area.closest<HTMLElement>(".speaker-extra-row")?.dataset.index)];
    if (!persona || !ref) return;
    ref.text = area.value;
    changedSpeakerExtras(persona);
  });
  list.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-action]");
    const persona = selectedGalleryPersona();
    if (!button || !persona?.extraRefs) return;
    const index = Number(button.closest<HTMLElement>(".speaker-extra-row")?.dataset.index);
    const ref = persona.extraRefs[index];
    if (!ref) return;
    if (button.dataset.action === "remove") {
      persona.extraRefs.splice(index, 1);
      speakerExtraPlayer.pause();
      speakerExtraPlaying = -1;
      changedSpeakerExtras(persona);
      renderSpeakerExtras(persona);
    } else if (button.dataset.action === "transcribe") {
      button.disabled = true;
      try {
        const text = await transcribeAudioText(ref.path);
        if (text) {
          ref.text = text.trim();
          changedSpeakerExtras(persona);
          renderSpeakerExtras(persona);
        }
      } catch (e) {
        showToast(`${t("Transcription failed")}: ${e}`, "error");
      } finally {
        button.disabled = false;
      }
    } else if (button.dataset.action === "play") {
      speakerExtraPlayer.pause();
      if (speakerExtraPlaying === index) {
        speakerExtraPlaying = -1;
        renderSpeakerExtras(persona);
        return;
      }
      try {
        const audio = await invoke<GenerationResult>("read_audio_as_wav", { audioPath: ref.path });
        if (speakerExtraPlayerUrl) URL.revokeObjectURL(speakerExtraPlayerUrl);
        speakerExtraPlayerUrl = URL.createObjectURL(await base64ToBlobAsync(audio.wavBase64, "audio/wav"));
        speakerExtraPlayer.src = speakerExtraPlayerUrl;
        speakerExtraPlaying = index;
        speakerExtraPlayer.onended = () => {
          speakerExtraPlaying = -1;
          const current = selectedGalleryPersona();
          if (current) renderSpeakerExtras(current);
        };
        renderSpeakerExtras(persona);
        await speakerExtraPlayer.play();
      } catch (e) {
        speakerExtraPlaying = -1;
        showToast(`${t("Could not read the recording")}: ${e}`, "error");
      }
    }
  });
}

// ─── Mixing two voices and locking a take as a voice ───

/** Text of the take last shown as the result (Drama 3 TTS); null when unknown. */
let lastResultSpokenText: string | null = null;

/** The words of a Drama 3 text: speaker tags and [directions] removed. */
function spokenWords(text: string): string {
  return text.replace(/<\|[^|]*\|>/g, " ").replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
}

/** A dialog with one line of input; resolves to the text, or null when cancelled. */
function askText(title: string, message: string, value: string): Promise<string | null> {
  const modal = el<HTMLElement>("#text-prompt-modal");
  const input = el<HTMLInputElement>("#text-prompt-input");
  el("#text-prompt-title").textContent = title;
  el("#text-prompt-message").textContent = message;
  input.value = value;
  return new Promise((resolve) => {
    const finish = (result: string | null) => {
      modal.classList.add("hidden");
      el("#text-prompt-ok").removeEventListener("click", ok);
      el("#text-prompt-cancel").removeEventListener("click", cancel);
      input.removeEventListener("keydown", onKey);
      resolve(result);
    };
    const ok = () => finish(input.value.trim() || null);
    const cancel = () => finish(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter") ok();
      if (event.key === "Escape") cancel();
    };
    el("#text-prompt-ok").addEventListener("click", ok);
    el("#text-prompt-cancel").addEventListener("click", cancel);
    input.addEventListener("keydown", onKey);
    modal.classList.remove("hidden");
    input.focus();
    input.select();
  });
}

/**
 * Turns a generated take into a Speaker Gallery voice with its Drama 3 voice file:
 * the take is the reference, its words (recognised by Parakeet when it is there,
 * else the text without directions) the transcript. Returns the new card, or null.
 */
async function lockVoiceFromTake(result: GenerationResult, text: string, defaultName: string): Promise<SpeakerPersona | null> {
  const name = await askText(t("🔒 Lock voice"), t("The take becomes a voice in the Speaker Gallery. Its name:"), defaultName);
  if (!name) return null;
  const persona = createBlankPersona();
  persona.name = name;
  try {
    const folder = await invoke<{ path: string }>("speaker_drama_voice_path", { speakerId: persona.id, speakerName: name });
    const takePath = folder.path.replace(/[^\\/]+$/, "take.wav");
    await invoke("save_binary_file", { path: takePath, base64Data: result.wavBase64 });
    // At most 30 s, as any reference; no voice cleaning: a generated take is clean.
    const prepared = await prepareReferenceAudioFile(takePath, "take.wav", false);
    const stored = await storeSpeakerAsset(persona, prepared.path, "audio");
    persona.refPath = stored.path;
    persona.refName = t("Locked take");
    const heard = await tryAutoTranscribeSilently(stored.path);
    persona.refText = heard || spokenWords(text);
    if (!heard && prepared.cropped) {
      showToast(t("The take was longer than 30 s and was cut: check the transcript in the Speaker Gallery"), "warning");
    }
    persona.notes = `${t("Locked from a take")}: ${spokenWords(text).slice(0, 120)}`;
    speakerPersonas.push(persona);
    saveSpeakerPersonas();
    await makeDramaVoiceForPersona(persona);
    return persona.dramaVoicePath ? persona : null;
  } catch (e) {
    showToast(`${t("Could not lock the voice")}: ${e}`, "error");
    return null;
  }
}

function mixablePersonas(): SpeakerPersona[] {
  return speakerPersonas.filter((p) => p.refPath && p.refText.trim());
}

/** A persona's recordings that have a transcript: the main one, then the extra ones. */
function personaRecordings(persona: SpeakerPersona): Array<{ path: string; name: string; text: string }> {
  return [
    { path: persona.refPath, name: persona.refName || "reference", text: persona.refText },
    ...(persona.extraRefs || []),
  ].filter((r) => r.path && r.text.trim());
}

let mixNameEdited = false;

function renderMixCounts(): void {
  for (const side of ["a", "b"]) {
    const persona = findPersona(el<HTMLSelectElement>(`#mix-${side}`).value);
    const count = el<HTMLSelectElement>(`#mix-${side}-count`);
    const n = persona ? personaRecordings(persona).length : 0;
    const current = Number(count.value) || 1;
    count.innerHTML = Array.from({ length: Math.max(1, n) }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("");
    count.value = String(Math.min(current, Math.max(1, n)));
  }
  if (!mixNameEdited) {
    const a = findPersona(el<HTMLSelectElement>("#mix-a").value)?.name || "";
    const b = findPersona(el<HTMLSelectElement>("#mix-b").value)?.name || "";
    el<HTMLInputElement>("#mix-name").value = a && b ? `${a} + ${b}` : "";
  }
}

function openMixModal(): void {
  const personas = mixablePersonas();
  if (personas.length < 2) {
    showToast(t("Mixing needs two voices with a recording and its transcript"), "warning");
    return;
  }
  const options = personas.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  el("#mix-a").innerHTML = options;
  el("#mix-b").innerHTML = options;
  const selected = selectedGalleryPersona();
  const first = selected && personas.includes(selected) ? selected : personas[0];
  el<HTMLSelectElement>("#mix-a").value = first.id;
  el<HTMLSelectElement>("#mix-b").value = (personas.find((p) => p !== first) || personas[1]).id;
  mixNameEdited = false;
  renderMixCounts();
  el("#mix-modal").classList.remove("hidden");
}

function closeMixModal(): void {
  el("#mix-modal").classList.add("hidden");
}

async function createVoiceMix(): Promise<void> {
  const a = findPersona(el<HTMLSelectElement>("#mix-a").value);
  const b = findPersona(el<HTMLSelectElement>("#mix-b").value);
  const name = el<HTMLInputElement>("#mix-name").value.trim();
  if (!a || !b || a === b) {
    showToast(t("Choose two different voices"), "warning");
    return;
  }
  if (!name) {
    showToast(t("Give the new voice a name"), "warning");
    return;
  }
  const fromA = personaRecordings(a).slice(0, Number(el<HTMLSelectElement>("#mix-a-count").value) || 1);
  const fromB = personaRecordings(b).slice(0, Number(el<HTMLSelectElement>("#mix-b-count").value) || 1);
  // Alternate the two voices so neither comes all first.
  const recordings: Array<{ path: string; name: string; text: string }> = [];
  for (let i = 0; i < Math.max(fromA.length, fromB.length); i++) {
    if (fromA[i]) recordings.push({ ...fromA[i], name: `${a.name}: ${fromA[i].name}` });
    if (fromB[i]) recordings.push({ ...fromB[i], name: `${b.name}: ${fromB[i].name}` });
  }
  const button = el<HTMLButtonElement>("#mix-create");
  button.disabled = true;
  const persona = createBlankPersona();
  persona.name = name;
  try {
    const main = await storeSpeakerAsset(persona, recordings[0].path, "audio");
    persona.refPath = main.path;
    persona.refName = recordings[0].name;
    persona.refText = recordings[0].text.trim();
    persona.extraRefs = [];
    for (const recording of recordings.slice(1)) {
      const stored = await invoke<{ path: string }>("store_speaker_extra_asset", {
        speakerId: persona.id,
        speakerName: persona.name,
        sourcePath: recording.path,
      });
      persona.extraRefs.push({ path: stored.path, name: recording.name, text: recording.text.trim() });
    }
    persona.notes = `${t("Mix of voices")}: ${a.name} (${fromA.length}) + ${b.name} (${fromB.length})`;
    speakerPersonas.push(persona);
    selectedGalleryPersonaId = persona.id;
    saveSpeakerPersonas();
    closeMixModal();
    await makeDramaVoiceForPersona(persona);
  } catch (e) {
    showToast(`${t("Could not create the mix")}: ${e}`, "error");
  } finally {
    button.disabled = false;
  }
}

function initVoiceMixAndLock(): void {
  el("#speaker-mix-btn").addEventListener("click", openMixModal);
  el("#mix-close").addEventListener("click", closeMixModal);
  el("#mix-cancel").addEventListener("click", closeMixModal);
  el("#mix-create").addEventListener("click", () => void createVoiceMix());
  el("#mix-a").addEventListener("change", renderMixCounts);
  el("#mix-b").addEventListener("change", renderMixCounts);
  el("#mix-name").addEventListener("input", () => { mixNameEdited = true; });

  el("#output-lock-voice-btn").addEventListener("click", async () => {
    const result = lastResult;
    const text = lastResultSpokenText;
    if (!result || !text) {
      showToast(t("Lock works for a TTS take, or for a scene line in “Line by line” mode (🔒 at the line)"), "warning");
      return;
    }
    const persona = await lockVoiceFromTake(result, text, `${t("Voice")} ${speakerPersonas.length + 1}`);
    if (persona) selectDramaVoice(persona.dramaVoiceName || persona.name);
  });
}

async function lockSceneLineVoice(index: number): Promise<void> {
  const line = sceneLines[index];
  if (!line) return;
  const character = sceneLinesCharacters[line.reply.character];
  const persona = await lockVoiceFromTake(line.result, line.reply.text, character?.name || `${t("Voice")} ${speakerPersonas.length + 1}`);
  if (!persona || !character) return;
  // The character keeps this voice from now on.
  const target = dramaScene.characters.find((c) => c.id === character.id);
  if (target) {
    target.voice = persona.dramaVoiceName || persona.name;
    persistDramaScene();
    renderSceneCharacters();
    showToast(`${t("Voice locked and given to")} ${target.name}: ${target.voice}`);
  }
}

function renderSpeakerDramaState(persona: SpeakerPersona): void {
  const state = el<HTMLElement>("#speaker-drama-state");
  const button = el<HTMLButtonElement>("#speaker-drama-make-btn");
  const ready = Boolean(persona.dramaVoicePath);
  const stale = ready && (persona.dramaVoiceText || "").trim() !== personaDramaSignature(persona).trim();
  const making = dramaVoiceMaking === persona.id;
  setText("#speaker-drama-state", making
    ? t("Creating…")
    : !ready ? t("Not created") : stale ? t("Transcript changed: recreate") : t("Ready"));
  state.classList.toggle("ok", ready && !stale && !making);
  state.classList.toggle("warn", stale && !making);
  button.disabled = Boolean(dramaVoiceMaking);
  button.textContent = making
    ? t("Creating the voice, about 1–2 minutes…")
    : ready ? t("Recreate Drama 3 voice") : t("Create Drama 3 voice");
}

let dramaVoiceMaking = "";

/** Makes the persona's Drama 3 voice file (reference + transcript) and adds it to the loaded model. */
async function makeDramaVoiceForPersona(persona: SpeakerPersona): Promise<void> {
  if (dramaVoiceMaking) return;
  const transcript = persona.refText.trim();
  if (!persona.refPath) {
    showToast(t("Add the reference audio first"), "warning");
    return;
  }
  if (!transcript) {
    showToast(t("Drama 3 needs the exact transcript of the reference: type it or use Auto-transcribe"), "warning");
    return;
  }
  const extras = persona.extraRefs || [];
  const missing = extras.findIndex((r) => !r.text.trim());
  if (missing >= 0) {
    showToast(`${t("Recording")} ${missing + 2} (${extras[missing].name}): ${t("needs its exact transcript, or delete it")}`, "warning");
    return;
  }
  dramaVoiceMaking = persona.id;
  renderSpeakerDramaState(persona);
  try {
    if (!dramaStatus.libraryLoaded) {
      const { libraryPath } = dramaPathsFromInputs();
      dramaStatus = await invoke<DramaStatus>("drama_load_library", { libraryPath: libraryPath || null });
    }
    const modelPath = dramaStatus.modelPath || dramaPathsFromInputs().modelPath;
    const target = await invoke<{ path: string }>("speaker_drama_voice_path", {
      speakerId: persona.id,
      speakerName: persona.name,
    });
    // The model cannot drop a voice, so a recreated voice gets a fresh name if the old one is in it.
    const name = uniqueDramaVoiceName(persona.name, persona);
    if (!/[.!?…»"]$/.test(transcript)) {
      showToast(t("The transcript does not end with a full stop: the reference should end at the end of a sentence"), "warning");
    }
    const result = await invoke<{ path: string }>("drama_voice_make", {
      request: {
        references: [
          { path: persona.refPath, transcript },
          ...extras.map((r) => ({ path: r.path, transcript: r.text.trim() })),
        ],
        voices: [],
        outPath: target.path,
        modelPath: modelPath || null,
      },
      addAs: dramaStatus.modelLoaded ? name : null,
    });
    persona.dramaVoicePath = result.path;
    persona.dramaVoiceName = name;
    persona.dramaVoiceText = personaDramaSignature(persona);
    persona.updatedAt = Date.now();
    await refreshDramaStatus();
    showToast(dramaStatus.modelLoaded
      ? `${t("Drama 3 voice created and added")}: ${name}`
      : `${t("Drama 3 voice created; it will be added when the model loads")}: ${name}`);
  } catch (e) {
    showToast(`${t("Could not create the Drama 3 voice")}: ${e}`, "error");
  } finally {
    dramaVoiceMaking = "";
    saveSpeakerPersonas();
  }
}

function renderDramaVoiceSelect(): void {
  const select = el<HTMLSelectElement>("#drama-voice");
  // The saved choice wins: while the model loads, its voices are not added yet, and the
  // select would otherwise fall back to "none" and forget the choice.
  const current = localStorage.getItem(DRAMA_SELECTED_VOICE_STORAGE_KEY) || select.value || "none";
  select.innerHTML = "";
  for (const name of dramaVoiceNames()) {
    // Shared voices of scenes are for the scene tab, not for a single voice.
    if (isHiddenVoice(name)) continue;
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name === "none" ? t("none (the model chooses)") : name;
    select.appendChild(option);
  }
  select.value = Array.from(select.options).some((o) => o.value === current) ? current : "none";
  el<HTMLButtonElement>("#drama-voice-remove-btn").disabled = !dramaVoiceFiles.some((v) => v.name === select.value);
  refreshChapterVoiceOptions();
  refreshSubsVoiceOptions();
  // The Multi Speaker characters choose from the same voices.
  refreshSceneVoiceOptions();
}

function selectDramaVoice(name: string): void {
  localStorage.setItem(DRAMA_SELECTED_VOICE_STORAGE_KEY, name);
  renderDramaVoiceSelect();
  el<HTMLSelectElement>("#drama-voice").value = name;
}

async function unloadHiggsToFreeVram(): Promise<void> {
  const status = await invoke<ModelStatusEvent>("engine_status").catch(() => null);
  if (!status?.modelLoaded) return;
  await invoke("unload_model");
  showToast(t("Higgs model unloaded to free video memory"));
}

async function unloadDramaToFreeVram(): Promise<void> {
  const status = await invoke<DramaStatus>("drama_status").catch(() => null);
  if (!status?.modelLoaded) return;
  await invoke("drama_unload_model");
  showToast(t("Drama 3 model unloaded to free video memory"));
}

/** Adds the saved voice files that the loaded model does not have yet. */
async function addSavedDramaVoices(): Promise<void> {
  const have = new Set(dramaStatus.modelInfo?.voices.map((v) => v.name) || []);
  for (const voice of dramaVoiceSources()) {
    if (have.has(voice.name)) continue;
    try {
      await invoke("drama_voice_add", { name: voice.name, path: voice.path });
    } catch (e) {
      showToast(`${t("Could not add voice")} ${voice.name}: ${e}`, "warning");
    }
  }
  await refreshDramaStatus();
}

function dramaPathsFromInputs(): { libraryPath: string; modelPath: string; device: string } {
  return {
    libraryPath: el<HTMLInputElement>("#drama-library-path").value.trim(),
    modelPath: el<HTMLInputElement>("#drama-model-path").value.trim(),
    device: el<HTMLSelectElement>("#drama-device").value || "auto",
  };
}

/** Video memory the model needs above its weights (work buffers, the voice). */
const DRAMA_VRAM_MARGIN = 1.2 * 1024 ** 3;

/**
 * Before loading: when another program (ComfyUI, a game, a video) holds the video
 * memory, the model will not fit and part of it will run on the CPU, several times
 * slower. Says so and asks whether to load anyway. True = go on.
 */
async function confirmDramaVram(modelPath: string, device: string): Promise<boolean> {
  if (device === "cpu") return true;
  try {
    if (!dramaStatus.libraryLoaded) {
      dramaStatus = await invoke<DramaStatus>("drama_load_library", { libraryPath: dramaPathsFromInputs().libraryPath || null });
    }
    const [info, devices] = await Promise.all([
      invoke<DramaModelInfo>("drama_model_file_info", { modelPath: modelPath || dramaStatus.modelPath || "" }),
      invoke<DramaDevice[]>("drama_devices"),
    ]);
    const gpu = device === "auto" || device === "gpu"
      ? devices.find((d) => d.kind === "gpu") ?? devices.find((d) => d.kind !== "cpu")
      : devices.find((d) => d.name === device);
    if (!gpu || gpu.kind === "cpu" || !info.weightBytes) return true;
    const need = info.weightBytes + DRAMA_VRAM_MARGIN;
    if (gpu.freeBytes >= need) return true;
    // Only worth asking when the card could hold the model if it were free.
    if (gpu.totalBytes < need) return true;
    const answer = await askChoice(
      t("Not enough free video memory"),
      `${t("Free")}: ${gigabytes(gpu.freeBytes)} ${t("of")} ${gigabytes(gpu.totalBytes)}, ${t("the model needs about")} ${gigabytes(need)}. ` +
        t("Another program holds the video memory (for example ComfyUI, a second Drama Studio, a game or a video). If you load now, part of the model will run on the CPU: voicing will be several times slower and the program may even crash. Close that program and press Load again."),
      [
        { value: "cancel", label: t("Cancel") },
        { value: "load", label: t("Load anyway (slow)"), primary: true },
      ],
    );
    return answer === "load";
  } catch (e) {
    // The check is a help: when it cannot be made, loading goes on as before.
    console.warn("video memory check:", e);
    return true;
  }
}

async function doLoadDrama(): Promise<boolean> {
  if (dramaLoading) return false;
  const { libraryPath, modelPath, device } = dramaPathsFromInputs();
  await unloadHiggsToFreeVram().catch(() => {});
  if (!(await confirmDramaVram(modelPath, device))) return false;
  dramaLoading = true;
  renderDramaStatus();
  try {
    const result = await invoke<{ modelInfo: DramaModelInfo; devices: DramaDevice[] }>("drama_load_model", {
      request: { libraryPath: libraryPath || null, modelPath: modelPath || null, device },
    });
    dramaDevices = result.devices;
    renderDramaDeviceSelect();
    dramaStatus = await invoke<DramaStatus>("drama_status");
    if (dramaStatus.libraryPath) {
      el<HTMLInputElement>("#drama-library-path").value = dramaStatus.libraryPath;
      localStorage.setItem(DRAMA_LIBRARY_PATH_STORAGE_KEY, dramaStatus.libraryPath);
    }
    if (dramaStatus.modelPath) {
      el<HTMLInputElement>("#drama-model-path").value = dramaStatus.modelPath;
      localStorage.setItem(DRAMA_MODEL_PATH_STORAGE_KEY, dramaStatus.modelPath);
    }
    await addSavedDramaVoices();
    if (result.modelInfo.expertsOnCpu) {
      showToast(t("Drama 3 loaded, but part of the model runs on the CPU: generation will be slower."), "warning");
    } else {
      showToast(t("Drama 3 loaded"));
    }
    return true;
  } catch (e) {
    showToast(`${t("Failed to load Drama 3")}: ${e}`, "error");
    return false;
  } finally {
    dramaLoading = false;
    await refreshDramaStatus();
  }
}

async function doUnloadDrama(): Promise<void> {
  try {
    await invoke("drama_unload_model");
    await refreshDramaStatus();
    await refreshDramaDevices();
    renderDramaStatus();
    showToast("Model unloaded");
  } catch (e) {
    showToast(`Failed to unload: ${e}`, "error");
  }
}

async function ensureDramaLoaded(): Promise<boolean> {
  await refreshDramaStatus();
  if (dramaStatus.modelLoaded) return true;
  showToast(t("Loading the Drama 3 model…"));
  return doLoadDrama();
}

async function doAddDramaVoiceFile(): Promise<void> {
  const selected = await open({ filters: [{ name: "Drama 3 voice", extensions: ["gguf"] }] });
  const path = Array.isArray(selected) ? selected[0] : selected;
  if (!path) return;
  const existing = dramaVoiceFiles.find((v) => v.path === path);
  if (existing) {
    selectDramaVoice(existing.name);
    return;
  }
  const name = uniqueDramaVoiceName(voiceNameFromPath(path));
  if (dramaStatus.modelLoaded) {
    try {
      await invoke("drama_voice_add", { name, path });
    } catch (e) {
      showToast(`${t("Could not add voice")} ${name}: ${e}`, "error");
      return;
    }
    await refreshDramaStatus();
  }
  dramaVoiceFiles.push({ name, path });
  saveDramaVoiceFiles(dramaVoiceFiles);
  selectDramaVoice(name);
  showToast(dramaStatus.modelLoaded
    ? `${t("Voice added")}: ${name}`
    : `${t("Voice saved, it will be added when the model loads")}: ${name}`);
}

function removeSelectedDramaVoice(): void {
  const name = el<HTMLSelectElement>("#drama-voice").value;
  if (!dramaVoiceFiles.some((v) => v.name === name)) return;
  dramaVoiceFiles = dramaVoiceFiles.filter((v) => v.name !== name);
  saveDramaVoiceFiles(dramaVoiceFiles);
  selectDramaVoice("none");
  // speech.cpp cannot remove a voice from a loaded model: it goes on the next load.
  showToast(dramaStatus.modelLoaded
    ? `${t("Voice removed from the list; it leaves the model on the next load")}: ${name}`
    : `${t("Voice removed")}: ${name}`);
}

// ─── Options ───

const DRAMA_SLIDERS: Array<{ input: string; value: string; format: (v: number) => string }> = [
  { input: "#drama-top-k", value: "#drama-val-top-k", format: (v) => String(Math.round(v)) },
  { input: "#drama-top-p", value: "#drama-val-top-p", format: (v) => v.toFixed(2) },
  { input: "#drama-temperature", value: "#drama-val-temperature", format: (v) => v.toFixed(2) },
  { input: "#drama-max-seconds", value: "#drama-val-max-seconds", format: (v) => v.toFixed(1) },
];

function readDramaOptionsFromUi(): DramaOptions {
  return {
    seed: el<HTMLInputElement>("#drama-seed").value.trim(),
    topK: parseInt(el<HTMLInputElement>("#drama-top-k").value, 10),
    topP: parseFloat(el<HTMLInputElement>("#drama-top-p").value),
    temperature: parseFloat(el<HTMLInputElement>("#drama-temperature").value),
    maxSeconds: parseFloat(el<HTMLInputElement>("#drama-max-seconds").value),
    expertsOnCpu: el<HTMLInputElement>("#drama-experts-on-cpu").checked,
  };
}

function updateDramaSliderLabels(): void {
  for (const slider of DRAMA_SLIDERS) {
    el<HTMLElement>(slider.value).textContent = slider.format(parseFloat(el<HTMLInputElement>(slider.input).value));
  }
}

function applyDramaOptionsToUi(options: DramaOptions): void {
  el<HTMLInputElement>("#drama-seed").value = options.seed;
  el<HTMLInputElement>("#drama-top-k").value = String(options.topK);
  el<HTMLInputElement>("#drama-top-p").value = String(options.topP);
  el<HTMLInputElement>("#drama-temperature").value = String(options.temperature);
  el<HTMLInputElement>("#drama-max-seconds").value = String(options.maxSeconds);
  el<HTMLInputElement>("#drama-experts-on-cpu").checked = options.expertsOnCpu;
  updateDramaSliderLabels();
  saveDramaOptions(options);
}

function setDramaLastSeed(seed: number): void {
  el<HTMLElement>("#drama-last-seed").textContent = String(seed);
  el<HTMLButtonElement>("#drama-seed-keep").disabled = false;
}

let dramaRemarks: DramaRemark[] = loadDramaRemarks();

/** The text box a remark panel (.drama-remarks with data-target) inserts into. */
function remarksTarget(container: HTMLElement): HTMLTextAreaElement {
  return el<HTMLTextAreaElement>(container.dataset.target || "#tts-text");
}

function insertCustomDramaTag(container: HTMLElement): void {
  const input = container.querySelector<HTMLInputElement>(".custom-tag-input")!;
  const tag = toDramaTag(input.value);
  if (!tag) {
    showToast(t("Type a direction first, e.g. tired, hoarse voice"), "warning");
    input.focus();
    return;
  }
  insertTagAtCursor(remarksTarget(container), tag);
  input.value = "";
}

/** Builds a remark panel once: the buttons bar and the own-tag row. */
function initRemarksPanel(container: HTMLElement): void {
  container.innerHTML = `
    <div class="remark-bar" aria-label="${escapeHtml(t("Remarks"))}"></div>
    <div class="custom-tag-row">
      <input class="text-input custom-tag-input" type="text" spellcheck="false"
        placeholder="${escapeHtml(t("Your own direction in English, e.g. tired, hoarse voice"))}" />
      <button class="compact-button custom-tag-insert" type="button" title="${escapeHtml(t("Insert it in square brackets at the cursor"))}">${escapeHtml(t("Insert [ ]"))}</button>
      <button class="compact-button emotions-open-btn" type="button" title="${escapeHtml(t("Build a direction from emotions in Russian"))}">${escapeHtml(t("🎭 Emotions"))}</button>
      <button class="compact-button remarks-edit-btn" type="button">${escapeHtml(t("✎ Edit buttons"))}</button>
    </div>
  `;
  const insert = container.querySelector<HTMLButtonElement>(".custom-tag-insert")!;
  // Keep the text box's cursor: a mousedown on the button would take the focus away.
  insert.addEventListener("mousedown", (event) => event.preventDefault());
  insert.addEventListener("click", () => insertCustomDramaTag(container));
  container.querySelector<HTMLInputElement>(".custom-tag-input")!.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      insertCustomDramaTag(container);
    }
  });
  container.querySelector(".remarks-edit-btn")!.addEventListener("click", openRemarksEditor);
  const emotions = container.querySelector<HTMLButtonElement>(".emotions-open-btn")!;
  emotions.addEventListener("mousedown", (event) => event.preventDefault());
  emotions.addEventListener("click", () => openEmotionBuilder({ kind: "text", textarea: remarksTarget(container) }));
}

function renderRemarksEditor(): void {
  const list = el<HTMLElement>("#remarks-editor-list");
  list.innerHTML = "";
  dramaRemarks.forEach((remark, index) => {
    const row = document.createElement("div");
    row.className = "remarks-editor-row";
    row.dataset.index = String(index);
    row.innerHTML = `
      <input class="text-input" data-field="label" type="text" placeholder="${escapeHtml(t("Label"))}" />
      <input class="text-input" data-field="tag" type="text" spellcheck="false" placeholder="[tired, hoarse voice]" />
      <span class="remarks-editor-actions">
        <button class="icon-button" data-action="up" type="button" title="${escapeHtml(t("Move up"))}" ${index === 0 ? "disabled" : ""}>↑</button>
        <button class="icon-button" data-action="down" type="button" title="${escapeHtml(t("Move down"))}" ${index === dramaRemarks.length - 1 ? "disabled" : ""}>↓</button>
        <button class="icon-button danger" data-action="remove" type="button" title="${escapeHtml(t("Delete"))}">✕</button>
      </span>
    `;
    // Values set as properties, not markup, so any text the user typed is safe.
    row.querySelector<HTMLInputElement>('[data-field="label"]')!.value = t(remark.label);
    row.querySelector<HTMLInputElement>('[data-field="tag"]')!.value = remark.tag;
    list.appendChild(row);
  });
}

function changeDramaRemarks(next: DramaRemark[]): void {
  dramaRemarks = next;
  saveDramaRemarks(dramaRemarks);
  renderDramaRemarks();
}

function openRemarksEditor(): void {
  renderRemarksEditor();
  el("#remarks-editor-modal").classList.remove("hidden");
}

function closeRemarksEditor(): void {
  // Buttons left without a tag do nothing: drop them.
  const kept = dramaRemarks.filter((r) => toDramaTag(r.tag));
  if (kept.length !== dramaRemarks.length) changeDramaRemarks(kept);
  el("#remarks-editor-modal").classList.add("hidden");
}

function initRemarksEditor(): void {
  const list = el<HTMLElement>("#remarks-editor-list");
  list.addEventListener("input", (event) => {
    const input = event.target as HTMLInputElement;
    const index = Number(input.closest<HTMLElement>(".remarks-editor-row")?.dataset.index);
    const remark = dramaRemarks[index];
    if (!remark) return;
    if (input.dataset.field === "label") {
      remark.label = input.value;
    } else {
      remark.tag = input.value;
      // The default tip describes the default tag.
      remark.tip = undefined;
      remark.kind = "remark";
    }
    changeDramaRemarks([...dramaRemarks]);
  });
  // Tidy the tag when the field is left: "tired" → "[tired]".
  list.addEventListener("focusout", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.field !== "tag") return;
    const index = Number(input.closest<HTMLElement>(".remarks-editor-row")?.dataset.index);
    const remark = dramaRemarks[index];
    if (!remark) return;
    const tag = toDramaTag(input.value);
    if (tag && tag !== remark.tag) {
      remark.tag = tag;
      input.value = tag;
      changeDramaRemarks([...dramaRemarks]);
    }
  });
  list.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-action]");
    if (!button) return;
    const index = Number(button.closest<HTMLElement>(".remarks-editor-row")?.dataset.index);
    const next = [...dramaRemarks];
    if (button.dataset.action === "remove") {
      next.splice(index, 1);
    } else {
      const target = button.dataset.action === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return;
      [next[index], next[target]] = [next[target], next[index]];
    }
    changeDramaRemarks(next);
    renderRemarksEditor();
  });
  el("#remarks-editor-add").addEventListener("click", () => {
    changeDramaRemarks([...dramaRemarks, { label: "", tag: "", kind: "remark" }]);
    renderRemarksEditor();
    const rows = list.querySelectorAll<HTMLInputElement>('[data-field="label"]');
    rows[rows.length - 1]?.focus();
  });
  el("#remarks-editor-reset").addEventListener("click", () => {
    dramaRemarks = resetDramaRemarks();
    renderDramaRemarks();
    renderRemarksEditor();
    showToast(t("Remark buttons reset to defaults"));
  });
  el("#remarks-editor-done").addEventListener("click", closeRemarksEditor);
  el("#remarks-editor-close").addEventListener("click", closeRemarksEditor);
  const modal = el<HTMLElement>("#remarks-editor-modal");
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeRemarksEditor();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) closeRemarksEditor();
  });
}

function renderDramaRemarks(): void {
  for (const container of document.querySelectorAll<HTMLElement>(".drama-remarks")) {
    if (!container.querySelector(".remark-bar")) initRemarksPanel(container);
    const bar = container.querySelector<HTMLElement>(".remark-bar")!;
    bar.innerHTML = "";
    for (const remark of dramaRemarks) {
      const tag = toDramaTag(remark.tag);
      if (!tag) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `compact-button remark-button ${remark.kind || "remark"}`;
      button.textContent = t(remark.label).trim() || tag;
      button.title = remark.tip ? `${tag}: ${t(remark.tip)}` : tag;
      // Keep the text box's cursor: a mousedown on the button would take the focus away.
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => insertTagAtCursor(remarksTarget(container), tag));
      bar.appendChild(button);
    }
  }
}

// ─── Generation ───

function captureDramaGenerationJob(overrideText?: string): GenerationJob {
  if (currentMode !== "tts" && currentMode !== "multi") throw new Error(t("Drama 3 works in the TTS tab for now"));
  const options = readDramaOptionsFromUi();
  saveDramaOptions(options);
  let payload: GenerationJob["payload"];
  if (currentMode === "multi") {
    const problem = sceneProblem();
    if (problem) throw new Error(problem);
    payload = {
      kind: "scene",
      characters: dramaScene.characters.map((c) => ({ ...c })),
      script: dramaScene.script,
      sceneMode: dramaScene.mode,
      pause: dramaScene.pause,
      level: dramaScene.level,
      check: dramaScene.check !== false,
      retries: dramaScene.retries ?? 2,
    };
  } else {
    const text = (overrideText ?? el<HTMLTextAreaElement>("#tts-text").value).trim();
    if (!text) throw new Error(t("Please enter text to speak"));
    payload = { kind: "tts", text };
  }
  const job: GenerationJob = {
    id: nextId("queue"),
    mode: currentMode,
    label: "",
    createdAt: Date.now(),
    options: dramaRequestOptions(options),
    deliveryPrefix: "",
    payload,
    engine: "drama",
    dramaVoice: el<HTMLSelectElement>("#drama-voice").value || "none",
  };
  job.label = jobLabel(job);
  return job;
}

async function generateDramaJob(job: GenerationJob): Promise<GenerationResult> {
  if (!dramaStatus.modelLoaded && !(await ensureDramaLoaded())) {
    throw new Error(t("The Drama 3 model is not loaded"));
  }
  dramaPartLabel = "";
  if (job.payload.kind === "scene") return generateDramaScene(job, job.payload);
  if (job.payload.kind !== "tts") throw new Error(t("Drama 3 works in the TTS tab for now"));
  const result = await dramaGenerate({
    request: {
      text: job.payload.text,
      voice: job.dramaVoice || "none",
      options: job.options,
      streamPlayback,
    },
  });
  setDramaLastSeed(result.seed);
  if (result.stop === "max_seconds") {
    // After the "Generation complete" toast.
    window.setTimeout(() => showToast(t("Stopped at the Max seconds limit: the end of the text may be missing."), "warning"), 2500);
  }
  const shortened = autoShortenPauses(result);
  reportAutoShortened();
  return shortened;
}

// ─── Pauses and the audio editor ───

let pauseTrim: PauseTrimSettings = loadPauseTrimSettings();
let autoShortenedCount = 0;
let autoShortenedSeconds = 0;

/** Shortens the long pauses of a Drama 3 result when the automatic option is on. */
function autoShortenPauses<T extends GenerationResult>(result: T): T {
  if (!pauseTrim.auto) return result;
  try {
    const shortened = shortenResultPauses(result, pauseTrim);
    autoShortenedCount += shortened.count;
    autoShortenedSeconds += shortened.seconds;
    return shortened.result;
  } catch {
    return result;
  }
}

/** Tells how many pauses were shortened since the last report, after the completion toast. */
function reportAutoShortened(): void {
  const count = autoShortenedCount;
  const removed = autoShortenedSeconds;
  autoShortenedCount = 0;
  autoShortenedSeconds = 0;
  if (count === 0) return;
  window.setTimeout(
    () => showToast(`${t("Long pauses shortened")}: ${count} (−${removed.toFixed(1)} ${t("s")})`),
    1400,
  );
}

function setPauseTrim(next: PauseTrimSettings): void {
  pauseTrim = next;
  savePauseTrimSettings(pauseTrim);
  el<HTMLInputElement>("#drama-auto-pauses").checked = pauseTrim.auto;
  el<HTMLInputElement>("#drama-pause-longer").value = String(pauseTrim.longerThan);
  el<HTMLInputElement>("#drama-pause-keep").value = String(pauseTrim.keep);
  chapterWave?.refresh();
  montageWave?.refresh();
}

/** The waveform panel with pauses under a joined track; edits go back through `show`. */
function makeWavePanel(audioId: string, show: (result: GenerationResult) => void): WavePanel {
  return createWavePanel({ audio: el<HTMLAudioElement>(audioId), settings: () => pauseTrim, onEdit: show, toast: showToast });
}

function editAudio(title: string, wavBase64: string, onSave: (result: GenerationResult) => Promise<void> | void): void {
  openAudioEditor({ title, wavBase64, settings: { ...pauseTrim }, onSettings: (s) => setPauseTrim({ ...pauseTrim, longerThan: s.longerThan, keep: s.keep }), onSave });
}

async function trimGalleryReference(): Promise<void> {
  const persona = selectedGalleryPersona();
  if (!persona?.refPath) return;
  let source: GenerationResult;
  try {
    source = await invoke<GenerationResult>("read_audio_as_wav", { audioPath: persona.refPath });
  } catch (e) {
    showToast(`${t("Could not read the recording")}: ${e}`, "error");
    return;
  }
  editAudio(`${t("Trim the recording")}: ${persona.name}`, source.wavBase64, async (edited) => {
    // Written into the speaker's own folder, then stored as its reference.wav.
    const voiceFile = await invoke<{ path: string }>("speaker_drama_voice_path", {
      speakerId: persona.id,
      speakerName: persona.name,
    });
    const editPath = voiceFile.path.replace(/[^\\/]+$/, "reference_edit.wav");
    await invoke("save_binary_file", { path: editPath, base64Data: edited.wavBase64 });
    const stored = await storeSpeakerAsset(persona, editPath, "audio");
    persona.refPath = stored.path;
    persona.refName = stored.fileName;
    persona.cachePath = "";
    await ensureSpeakerCachePath(persona);
    // The Drama 3 voice was made from the old recording.
    if (persona.dramaVoicePath) persona.dramaVoiceText = "";
    persona.updatedAt = Date.now();
    saveSpeakerPersonas();
    showRefPreview("gallery", persona.refPath);
    showToast(persona.dramaVoicePath
      ? t("Recording trimmed. Recreate the Drama 3 voice so it uses the new recording.")
      : t("Recording trimmed"));
  });
}

function initAudioEditing(): void {
  initAudioEditor(showToast);
  setPauseTrim(pauseTrim);
  el("#drama-auto-pauses").addEventListener("change", (event) => {
    setPauseTrim({ ...pauseTrim, auto: (event.target as HTMLInputElement).checked });
  });
  for (const id of ["#drama-pause-longer", "#drama-pause-keep"]) {
    el(id).addEventListener("change", () => {
      const longerThan = Math.min(10, Math.max(0.3, parseFloat(el<HTMLInputElement>("#drama-pause-longer").value) || 1));
      const keep = Math.min(longerThan, Math.max(0, parseFloat(el<HTMLInputElement>("#drama-pause-keep").value) || 0));
      setPauseTrim({ ...pauseTrim, longerThan, keep });
    });
  }
  el("#output-edit-btn").addEventListener("click", () => {
    const result = lastResult;
    if (!result) return;
    const mode = currentMode;
    editAudio(t("Edit the result"), result.wavBase64, (edited) => {
      lastResult = edited;
      showOutput(edited, mode);
      showToast(t("Result updated"));
    });
  });
  el("#speaker-gallery-trim").addEventListener("click", () => void trimGalleryReference());
}

function initDramaEngine(): void {
  el("#engine-pick-drama").addEventListener("click", () => applyEngineKind("drama"));
  el("#engine-pick-higgs").addEventListener("click", () => applyEngineKind("higgs"));

  const libraryInput = el<HTMLInputElement>("#drama-library-path");
  const modelInput = el<HTMLInputElement>("#drama-model-path");
  libraryInput.value = localStorage.getItem(DRAMA_LIBRARY_PATH_STORAGE_KEY) || "";
  modelInput.value = localStorage.getItem(DRAMA_MODEL_PATH_STORAGE_KEY) || "";
  libraryInput.addEventListener("change", () => localStorage.setItem(DRAMA_LIBRARY_PATH_STORAGE_KEY, libraryInput.value.trim()));
  modelInput.addEventListener("change", () => localStorage.setItem(DRAMA_MODEL_PATH_STORAGE_KEY, modelInput.value.trim()));
  el("#drama-library-browse").addEventListener("click", async () => {
    const selected = await open({ filters: [{ name: "speech.dll", extensions: ["dll"] }] });
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (!path) return;
    libraryInput.value = path;
    localStorage.setItem(DRAMA_LIBRARY_PATH_STORAGE_KEY, path);
  });
  el("#drama-model-browse").addEventListener("click", async () => {
    const selected = await open({ filters: [{ name: "Drama 3 GGUF", extensions: ["gguf"] }] });
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (!path) return;
    modelInput.value = path;
    localStorage.setItem(DRAMA_MODEL_PATH_STORAGE_KEY, path);
  });
  el<HTMLSelectElement>("#drama-device").addEventListener("change", (event) => {
    localStorage.setItem(DRAMA_DEVICE_STORAGE_KEY, (event.target as HTMLSelectElement).value);
  });
  el("#drama-load-btn").addEventListener("click", () => void doLoadDrama());
  el("#drama-unload-btn").addEventListener("click", () => void doUnloadDrama());

  el("#drama-voice-add-btn").addEventListener("click", () => void doAddDramaVoiceFile());
  el("#drama-voice-remove-btn").addEventListener("click", removeSelectedDramaVoice);
  el<HTMLSelectElement>("#drama-voice").addEventListener("change", (event) => {
    selectDramaVoice((event.target as HTMLSelectElement).value);
  });

  renderDramaRemarks();
  initRemarksEditor();
  initEmotionBuilder({
    toast: showToast,
    addRemark: (label, tag) => changeDramaRemarks([...dramaRemarks, { label, tag, kind: "remark" }]),
  });
  el("#chapter-narrator-emotions").addEventListener("click", (event) => {
    event.preventDefault();
    openEmotionBuilder({ kind: "manner", input: el<HTMLInputElement>("#chapter-narrator-style"), who: t("the narrator") });
  });
  initDramaScene();

  applyDramaOptionsToUi(loadDramaOptions());
  const persist = () => {
    updateDramaSliderLabels();
    saveDramaOptions(readDramaOptionsFromUi());
  };
  for (const slider of DRAMA_SLIDERS) el(slider.input).addEventListener("input", persist);
  el("#drama-experts-on-cpu").addEventListener("change", persist);
  const seedInput = el<HTMLInputElement>("#drama-seed");
  seedInput.addEventListener("input", () => {
    const digits = seedInput.value.replace(/\D/g, "");
    if (digits !== seedInput.value) seedInput.value = digits;
    persist();
  });
  el("#drama-seed-clear").addEventListener("click", () => {
    seedInput.value = "";
    persist();
  });
  el("#drama-seed-keep").addEventListener("click", () => {
    const last = el<HTMLElement>("#drama-last-seed").textContent || "";
    if (!/^\d+$/.test(last)) return;
    seedInput.value = last;
    persist();
    showToast(t("Seed kept: generation will repeat this take"));
  });
  el("#drama-options-stable").addEventListener("click", () => {
    applyDramaOptionsToUi({ ...readDramaOptionsFromUi(), temperature: DRAMA_STEADY_TEMPERATURE, topP: DRAMA_STEADY_TOP_P });
    showToast(t("Steady voice: temperature 0.75, Top-P 0.85"));
  });
  el("#drama-options-reset").addEventListener("click", () => {
    applyDramaOptionsToUi({ ...DRAMA_DEFAULT_OPTIONS });
    showToast(t("Drama 3 options reset"));
  });

  applyEngineKind(activeEngine);
  renderDramaStatus();
  void initDramaPaths();
}

// ─── Scene (Multi Speaker tab with Drama 3) ───

const SCENE_VOICE_PREFIX = "scene-";
const SCENE_COLORS = ["#25b8ab", "#e0803a", "#7a6ff0", "#d8556f", "#48a860", "#c9a227", "#3b82f6", "#b45bd6"];

type SceneLineResult = { reply: SceneReply; result: DramaGenerationResult };

let dramaScene: DramaScene = loadDramaScene();
let dramaPartLabel = "";
/** Line-by-line takes of the last scene, for per-line playback and redo. */
let sceneLines: SceneLineResult[] = [];
let sceneLinesPause = 0.35;
let sceneLinesCharacters: DramaCharacter[] = [];
let sceneLineBusy = -1;
const sceneLinePlayer = new Audio();
let sceneLinePlayerUrl = "";
let sceneLinePlaying = -1;

function persistDramaScene(): void {
  saveDramaScene(dramaScene);
  scheduleProjectSave();
  chapterVoicesChanged();
}

function sceneColor(index: number): string {
  return SCENE_COLORS[index % SCENE_COLORS.length];
}

/** What stops the scene from being generated, or "" when it is ready. */
function sceneProblem(): string {
  const characters = dramaScene.characters;
  if (characters.length === 0) return t("Add at least one character");
  if (characters.length > DRAMA_MAX_SPEAKERS) return t("Drama 3 takes at most 16 characters in a scene");
  if (characters.some((c) => !c.name.trim())) return t("Every character needs a name");
  const { replies, unknown } = parseScene(dramaScene.script, characters);
  if (unknown.length > 0) return `${t("Not in the character list")}: ${unknown.join(", ")}`;
  if (replies.length === 0) return t("Write the script: one reply per line, “Name: text”");
  return "";
}

/** The voices a character can have: "none", added files and Speaker Gallery voices. */
function sceneVoiceOptionsHtml(current: string): string {
  const voices = ["none", ...Array.from(new Set(dramaVoiceSources().map((v) => v.name)))];
  const options = voices.includes(current) ? voices : [...voices, current];
  return options
    .map((name) => {
      const label = name === "none"
        ? t("none (the model chooses)")
        : voices.includes(name) ? name : `${name} (${t("not found")})`;
      return `<option value="${escapeHtml(name)}">${escapeHtml(label)}</option>`;
    })
    .join("");
}

/**
 * Brings the characters' voice lists up to date (a voice just made in the Speaker
 * Gallery or added as a file) without rebuilding the rows, so typing is not disturbed.
 */
function refreshSceneVoiceOptions(): void {
  const list = document.querySelector<HTMLElement>("#scene-characters");
  if (!list) return;
  for (const select of list.querySelectorAll<HTMLSelectElement>('select[data-field="voice"]')) {
    const index = Number(select.closest<HTMLElement>(".scene-character-row")?.dataset.index);
    const character = dramaScene.characters[index];
    if (!character) continue;
    const html = sceneVoiceOptionsHtml(character.voice);
    if (select.innerHTML !== html) {
      select.innerHTML = html;
      select.value = character.voice;
    }
  }
}

// ─── Assigning speakers to script lines ───

/** One button per character above the script: gives the current line(s) that speaker. */
/** A text box whose lines can be given speakers: the scene script or the chapter text. */
type SpeakerTextTarget = {
  textarea: string;
  bar: string;
  undoButton: string;
  setText: (text: string) => void;
};

const SCENE_TEXT_TARGET: SpeakerTextTarget = {
  textarea: "#scene-script",
  bar: "#scene-speaker-bar",
  undoButton: "#scene-markup-undo",
  setText: (text) => setSceneScript(text),
};

const CHAPTER_TEXT_TARGET: SpeakerTextTarget = {
  textarea: "#chapter-text",
  bar: "#chapter-speaker-bar",
  undoButton: "#chapter-markup-undo",
  setText: (text) => setChapterText(text),
};

/** One button per character above each such text box: gives the current line(s) that speaker. */
function renderSceneSpeakerBar(): void {
  for (const target of [SCENE_TEXT_TARGET, CHAPTER_TEXT_TARGET]) {
    const bar = document.querySelector<HTMLElement>(target.bar);
    if (!bar) continue;
    bar.innerHTML = "";
    dramaScene.characters.forEach((character, index) => {
      if (!character.name.trim()) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "compact-button scene-speaker-button";
      button.style.setProperty("--speaker-color", sceneColor(index));
      button.title = index <= 9 ? `Alt+${index}` : "";
      button.innerHTML = `<span class="scene-speaker-number">${index}</span>${escapeHtml(character.name.trim())}`;
      // Keep the text box's cursor: a mousedown on the button would take the focus away.
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => assignSpeakerToScriptLines(index, target));
      bar.appendChild(button);
    });
  }
}

function setSceneScript(script: string): void {
  dramaScene.script = script;
  el<HTMLTextAreaElement>("#scene-script").value = script;
  persistDramaScene();
  renderScenePreview();
}

/**
 * Gives the line the cursor is in, or every line of the selection, the speaker
 * `character`, then moves the cursor to the start of the next line so the next
 * reply can be marked right away.
 */
function assignSpeakerToScriptLines(character: number, target: SpeakerTextTarget = SCENE_TEXT_TARGET): void {
  const textarea = el<HTMLTextAreaElement>(target.textarea);
  if (!dramaScene.characters[character]?.name.trim()) return;
  const value = textarea.value;
  const lineOf = (pos: number) => value.slice(0, pos).split("\n").length - 1;
  const first = lineOf(textarea.selectionStart ?? 0);
  let last = lineOf(textarea.selectionEnd ?? 0);
  // A selection that ends at the very start of a line does not take that line.
  if (last > first && (textarea.selectionEnd ?? 0) > 0 && value[(textarea.selectionEnd ?? 1) - 1] === "\n") last -= 1;
  let script = value.replace(/\r\n/g, "\n");
  const lines = script.split("\n");
  for (let i = first; i <= last; i++) {
    if (!lines[i]?.trim()) continue;
    script = setScriptLineSpeaker(script, i, dramaScene.characters, character);
  }
  target.setText(script);
  const after = script.split("\n");
  // Skip empty lines (paragraph breaks in a chapter) to the next text line.
  let nextLine = Math.min(after.length - 1, last + 1);
  while (nextLine < after.length - 1 && !after[nextLine].trim()) nextLine += 1;
  const cursor = after.slice(0, nextLine).reduce((sum, line) => sum + line.length + 1, 0);
  textarea.focus();
  textarea.setSelectionRange(cursor, cursor);
}

/** Paste a book passage, get "Name: text" lines: narrator, replies, author's words. */
const markupUndo = new Map<string, { text: string; characters: DramaCharacter[] }>();

function markupSceneBookText(target: SpeakerTextTarget = SCENE_TEXT_TARGET): void {
  const text = el<HTMLTextAreaElement>(target.textarea).value;
  if (!text.trim()) {
    showToast(t("Paste a book passage into the script first"), "warning");
    return;
  }
  markupUndo.set(target.textarea, { text, characters: dramaScene.characters.map((c) => ({ ...c })) });
  const characters = dramaScene.characters;
  let narrator = findNarrator(characters);
  if (narrator < 0 && characters.length < DRAMA_MAX_SPEAKERS) {
    characters.push(newDramaCharacter(t("Narrator")));
    narrator = characters.length - 1;
  }
  const added: string[] = [];
  for (const name of bookNameCandidates(text, characters)) {
    if (characters.length >= DRAMA_MAX_SPEAKERS) break;
    characters.push(newDramaCharacter(name));
    added.push(name);
  }
  // Replies need someone to say them besides the narrator.
  for (let n = 1; characters.filter((_, i) => i !== narrator).length < 2 && characters.length < DRAMA_MAX_SPEAKERS; n++) {
    const name = `${t("Character")} ${n}`;
    if (characters.some((c) => c.name === name)) continue;
    characters.push(newDramaCharacter(name));
    added.push(name);
  }
  const result = markupBookText(text, characters, narrator);
  persistDramaScene();
  renderSceneCharacters();
  target.setText(result.script);
  el(target.undoButton).classList.remove("hidden");
  const parts = [`${t("Marked up")}: ${result.replies} ${t("replies")}`];
  if (added.length > 0) parts.push(`${t("characters added")}: ${added.join(", ")}`);
  if (result.guessed > 0) parts.push(`${t("speaker guessed for")} ${result.guessed}: ${t("check them")}`);
  showToast(parts.join(" · "), result.guessed > 0 ? "warning" : "success");
}

function undoSceneMarkup(target: SpeakerTextTarget = SCENE_TEXT_TARGET): void {
  const saved = markupUndo.get(target.textarea);
  if (!saved) return;
  markupUndo.delete(target.textarea);
  dramaScene.characters = saved.characters;
  persistDramaScene();
  renderSceneCharacters();
  target.setText(saved.text);
  el(target.undoButton).classList.add("hidden");
}

/** Alt+number in a text box: the current line(s) get that character (Alt+0 … Alt+9). */
function speakerHotkeys(target: SpeakerTextTarget, enabled: () => boolean = () => true): void {
  el<HTMLTextAreaElement>(target.textarea).addEventListener("keydown", (event) => {
    if (!event.altKey || event.ctrlKey || event.metaKey || !enabled()) return;
    const match = /^(?:Digit|Numpad)(\d)$/.exec(event.code);
    if (!match) return;
    const index = Number(match[1]);
    if (index >= dramaScene.characters.length) return;
    event.preventDefault();
    assignSpeakerToScriptLines(index, target);
  });
}

function renderSceneCharacters(): void {
  const list = el<HTMLElement>("#scene-characters");
  list.innerHTML = "";
  dramaScene.characters.forEach((character, index) => {
    const row = document.createElement("div");
    row.className = "scene-character-row";
    row.dataset.index = String(index);
    row.innerHTML = `
      <span class="scene-speaker-badge" style="--speaker-color:${sceneColor(index)}" title="${escapeHtml(t("Speaker number in Drama 3"))}">${index}</span>
      <input class="text-input" data-field="name" type="text" placeholder="${escapeHtml(t("Name"))}" />
      <select class="select-input" data-field="voice">${sceneVoiceOptionsHtml(character.voice)}</select>
      <input class="text-input" data-field="description" type="text" spellcheck="false"
        placeholder="${escapeHtml(t("Voice description in English, e.g. calm elderly man, low voice"))}" />
      <span class="style-with-emotions">
        <input class="text-input" data-field="style" type="text" list="drama-style-presets" spellcheck="false"
          title="${escapeHtml(t("How this character speaks in every reply: pick or type a direction in English"))}"
          placeholder="${escapeHtml(t("Manner, e.g. calm narrator"))}" />
        <button class="icon-button" data-action="emotions" type="button" title="${escapeHtml(t("Emotion builder"))}">🎭</button>
      </span>
      <button class="icon-button danger" data-action="remove" type="button" title="${escapeHtml(t("Delete"))}">✕</button>
    `;
    row.querySelector<HTMLInputElement>('[data-field="name"]')!.value = character.name;
    row.querySelector<HTMLSelectElement>('[data-field="voice"]')!.value = character.voice;
    const description = row.querySelector<HTMLInputElement>('[data-field="description"]')!;
    description.value = character.description;
    row.querySelector<HTMLInputElement>('[data-field="style"]')!.value = character.style || "";
    description.classList.toggle("hidden", character.voice !== "none");
    list.appendChild(row);
  });
  el<HTMLButtonElement>("#scene-add-character").disabled = dramaScene.characters.length >= DRAMA_MAX_SPEAKERS;
  renderSceneSpeakerBar();
}

function renderScenePreview(): void {
  const preview = el<HTMLElement>("#scene-preview");
  const { replies, unknown } = parseScene(dramaScene.script, dramaScene.characters);
  const candidates = sceneNameCandidates(dramaScene.script, dramaScene.characters);
  el<HTMLButtonElement>("#scene-detect-characters").disabled = candidates.length === 0;
  const parts: string[] = [];
  if (unknown.length > 0) {
    parts.push(`<p class="scene-warning">${escapeHtml(t("Not in the character list"))}: ${escapeHtml(unknown.join(", "))}. ${escapeHtml(t("Add them, or such lines are read as text."))}</p>`);
  }
  for (const reply of replies.slice(0, 200)) {
    const character = dramaScene.characters[reply.character];
    const name = character?.name || "?";
    const text = reply.text.length > 160 ? `${reply.text.slice(0, 160)}…` : reply.text;
    parts.push(`<div class="scene-preview-line" data-line="${reply.line - 1}" data-character="${reply.character}" title="${escapeHtml(t("Click to switch the speaker of this reply"))}"><strong style="color:${sceneColor(reply.character)}">${escapeHtml(name)}</strong><span>${escapeHtml(text)}</span></div>`);
  }
  if (replies.length > 0) {
    const chars = replies.reduce((sum, r) => sum + r.text.length, 0);
    const scenePartsCount = sceneParts(replies).length;
    let partsInfo = dramaScene.mode === "scene" && scenePartsCount > 1 ? ` · ${escapeHtml(t("parts"))}: ${scenePartsCount}` : "";
    if (dramaScene.mode === "mixed") {
      const narrator = findNarrator(dramaScene.characters);
      if (narrator < 0) {
        partsInfo = ` · <span class="warn-text">${escapeHtml(t("No narrator in the list: name a character Рассказчик, Рассказчица or Автор"))}</span>`;
      } else {
        const mixed = mixedSceneParts(replies, narrator);
        const narration = mixed.filter((p) => p.kind === "narration").length;
        partsInfo = ` · ${escapeHtml(t("parts"))}: ${mixed.length} (${escapeHtml(t("narrator alone"))}: ${narration}, ${escapeHtml(t("dialogue"))}: ${mixed.length - narration})`;
      }
    }
    parts.unshift(`<p class="input-hint">${replies.length} ${escapeHtml(t("replies"))} · ${chars} ${escapeHtml(t("characters of text"))}${partsInfo}</p>`);
  }
  preview.innerHTML = parts.join("");
}

function renderSceneMode(): void {
  const lines = dramaScene.mode === "lines";
  const mixed = dramaScene.mode === "mixed";
  el("#scene-mode-scene").classList.toggle("active", dramaScene.mode === "scene");
  el("#scene-mode-lines").classList.toggle("active", lines);
  el("#scene-mode-mixed").classList.toggle("active", mixed);
  el("#scene-pause-row").classList.toggle("hidden", !lines && !mixed);
  el<HTMLInputElement>("#scene-pause").value = String(dramaScene.pause);
  el<HTMLInputElement>("#scene-level").checked = dramaScene.level;
  el<HTMLInputElement>("#scene-check").checked = dramaScene.check !== false;
  el<HTMLInputElement>("#scene-retries").value = String(dramaScene.retries ?? 2);
  el("#scene-val-pause").textContent = dramaScene.pause.toFixed(2);
  setText("#scene-mode-hint", lines
    ? t("Each reply on its own, with its character's voice: every line gets a player and a Redo button, and the lines are joined with the pause.")
    : mixed
      ? t("Long narrator paragraphs are read on their own in the narrator's voice (it keeps the voice better); the dialogue, with the short author's words between replies, goes in one request (livelier). The parts are joined with the pause.")
      : t("The whole scene in one request: intonation and pauses between replies sound more natural. A long scene is split into parts of about 45 s."));
}

function renderDramaScene(): void {
  el<HTMLTextAreaElement>("#scene-script").value = dramaScene.script;
  renderSceneCharacters();
  renderScenePreview();
  renderSceneMode();
}

function renderSceneLineResults(): void {
  scheduleProjectSave();
  const section = el<HTMLElement>("#scene-results");
  const list = el<HTMLElement>("#scene-results-list");
  section.classList.toggle("hidden", sceneLines.length === 0);
  list.innerHTML = "";
  sceneLines.forEach((line, index) => {
    const character = sceneLinesCharacters[line.reply.character];
    const row = document.createElement("div");
    row.className = "scene-result-row";
    row.dataset.index = String(index);
    const busy = sceneLineBusy === index;
    row.innerHTML = `
      <button class="ref-play" data-action="play" type="button" aria-label="${escapeHtml(t("Play"))}">${sceneLinePlaying === index ? "⏸" : "▶"}</button>
      <span class="scene-result-main">
        <strong style="color:${sceneColor(line.reply.character)}">${escapeHtml(character?.name || "?")}</strong>
        <span>${escapeHtml(line.reply.text.length > 140 ? `${line.reply.text.slice(0, 140)}…` : line.reply.text)}</span>
      </span>
      <span class="scene-result-meta">${line.result.seconds.toFixed(1)} ${escapeHtml(t("s"))} · seed ${line.result.seed}</span>
      <span class="scene-result-actions">
        <button class="compact-button" data-action="edit" type="button" title="${escapeHtml(t("Cut pauses and pieces out of this line"))}" ${sceneLineBusy >= 0 ? "disabled" : ""}>✂</button>
        <button class="compact-button" data-action="lock" type="button" title="${escapeHtml(t("Make this take the character's permanent voice"))}" ${sceneLineBusy >= 0 ? "disabled" : ""}>🔒</button>
        <button class="compact-button" data-action="redo" type="button" ${sceneLineBusy >= 0 || isGenerating ? "disabled" : ""}>${escapeHtml(busy ? t("Generating…") : t("↻ Redo"))}</button>
      </span>
    `;
    list.appendChild(row);
  });
}

async function playSceneLine(index: number): Promise<void> {
  if (sceneLinePlaying === index) {
    sceneLinePlayer.pause();
    sceneLinePlaying = -1;
    renderSceneLineResults();
    return;
  }
  const line = sceneLines[index];
  if (!line) return;
  if (sceneLinePlayerUrl) URL.revokeObjectURL(sceneLinePlayerUrl);
  sceneLinePlayerUrl = URL.createObjectURL(await base64ToBlobAsync(line.result.wavBase64, "audio/wav"));
  sceneLinePlayer.src = sceneLinePlayerUrl;
  sceneLinePlayer.volume = audioPlayer.volume;
  sceneLinePlaying = index;
  renderSceneLineResults();
  sceneLinePlayer.onended = () => {
    sceneLinePlaying = -1;
    renderSceneLineResults();
  };
  await sceneLinePlayer.play().catch(() => {
    sceneLinePlaying = -1;
    renderSceneLineResults();
  });
}

/** The scene's lines joined with the pause, shown as the tab's output. */
function showJoinedSceneLines(): GenerationResult {
  const joined = concatenateWavResults(sceneLines.map((l) => l.result), sceneLinesPause);
  return joined;
}

function sceneLineRequest(reply: SceneReply, characters: DramaCharacter[]): { text: string; voice: string } {
  const character = characters[reply.character];
  const loaded = new Set(dramaStatus.modelInfo?.voices.map((v) => v.name) || []);
  const voice = character && character.voice !== "none" && loaded.has(character.voice) ? character.voice : "none";
  if (character && character.voice !== "none" && voice === "none") {
    throw new Error(`${t("Voice not found")}: ${character.voice} (${character.name})`);
  }
  return { text: `${characterLineHint(character)}${reply.text}`, voice };
}

function editSceneLine(index: number): void {
  const line = sceneLines[index];
  if (!line) return;
  const name = sceneLinesCharacters[line.reply.character]?.name || "";
  editAudio(`${t("Line")} ${index + 1}${name ? `: ${name}` : ""}`, line.result.wavBase64, (edited) => {
    const seconds = edited.sampleCount / edited.channels / edited.sampleRate;
    sceneLines[index] = { reply: line.reply, result: { ...line.result, ...edited, seconds } };
    renderSceneLineResults();
    showOutput(showJoinedSceneLines(), "multi");
  });
}

async function redoSceneLine(index: number): Promise<void> {
  const line = sceneLines[index];
  if (!line || sceneLineBusy >= 0) return;
  if (isGenerating) {
    showToast(t("Wait for the current generation to finish"), "warning");
    return;
  }
  sceneLineBusy = index;
  renderSceneLineResults();
  try {
    if (!dramaStatus.modelLoaded && !(await ensureDramaLoaded())) return;
    const { text, voice } = sceneLineRequest(line.reply, sceneLinesCharacters);
    // A new take: same settings, a new random seed.
    const options = dramaRequestOptions({ ...readDramaOptionsFromUi(), seed: "" });
    const result = await dramaGenerate({
      request: { text, voice, options, streamPlayback: false },
    });
    sceneLines[index] = { reply: line.reply, result: await levelSceneTake(autoShortenPauses(result), dramaScene.level) };
    reportAutoShortened();
    setDramaLastSeed(result.seed);
    const joined = showJoinedSceneLines();
    showOutput(joined, "multi");
    showToast(`${t("Line redone")}: ${index + 1}`);
  } catch (e) {
    showToast(`${t("Generation failed")}: ${e}`, "error");
  } finally {
    sceneLineBusy = -1;
    renderSceneLineResults();
  }
}

/** The shared voice file of the characters that have voices, added to the model; "none" if none has. */
async function prepareSceneVoice(characters: DramaCharacter[]): Promise<string> {
  const sources = dramaVoiceSources();
  const parts = characters
    .map((character, speaker) => ({ character, speaker }))
    .filter(({ character }) => character.voice !== "none")
    .map(({ character, speaker }) => {
      const source = sources.find((s) => s.name === character.voice);
      if (!source) throw new Error(`${t("Voice not found")}: ${character.voice} (${character.name})`);
      return { name: source.name, path: source.path, speaker };
    });
  if (parts.length === 0) return "none";
  const key = shortHash(parts.map((p) => `${p.speaker}:${p.name}:${p.path}`).join("|"));
  const name = `${SCENE_VOICE_PREFIX}${key}`;
  if (dramaStatus.modelInfo?.voices.some((v) => v.name === name)) return name;
  const target = await invoke<{ path: string }>("drama_scene_voice_path", { key });
  await invoke("drama_voice_make", {
    request: {
      references: [],
      voices: parts.map((p) => ({ path: p.path, speaker: p.speaker })),
      outPath: target.path,
      modelPath: null,
    },
    addAs: name,
  });
  await refreshDramaStatus();
  return name;
}

/** A scene take at the common loudness (−20 LUFS) when `level` is on; unchanged otherwise. */
async function levelSceneTake(result: DramaGenerationResult, level: boolean): Promise<DramaGenerationResult> {
  if (!level) return result;
  const leveled = await normalizeResultLoudness(result);
  return { ...result, wavBase64: leveled.wavBase64 };
}

async function generateDramaScene(
  job: GenerationJob,
  payload: Extract<GenerationJob["payload"], { kind: "scene" }>,
): Promise<GenerationResult> {
  const characters = payload.characters;
  const level = payload.level ?? true;
  const { replies, unknown } = parseScene(payload.script, characters);
  if (unknown.length > 0) throw new Error(`${t("Not in the character list")}: ${unknown.join(", ")}`);
  if (replies.length === 0) throw new Error(t("Write the script: one reply per line, “Name: text”"));
  const bar = el<HTMLElement>("#gen-progress-bar");
  bar.classList.remove("indeterminate");

  // Each part is checked (length, speed, words heard) and a bad one redone with new seeds.
  const checking = payload.check ?? true;
  const recognise = checking && Boolean(localStorage.getItem("higgsAudio.whisperModel"));
  const retries = checking ? payload.retries ?? 2 : 0;
  let redone = 0;
  const stillBad: number[] = [];
  const checkedTake = async (
    request: { text: string; voice: string; options: Record<string, number | string | boolean> },
    spoken: string,
    number: number,
    label: string,
    stream = false,
  ): Promise<DramaGenerationResult> => {
    let best: { result: DramaGenerationResult; score: number; bad: boolean } | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const options = { ...request.options };
      // The seed counts for the first take only; retries need other seeds.
      if (attempt > 0) delete options.seed;
      dramaPartLabel = `${label}${attempt > 0 ? `${t("take")} ${attempt + 1} · ` : ""}`;
      const raw = await dramaGenerate({ request: { ...request, options, streamPlayback: stream && attempt === 0 } });
      setDramaLastSeed(raw.seed);
      if (raw.stop === "max_seconds") {
        window.setTimeout(() => showToast(t("A part hit the 95 s limit: its end may be missing. Split long replies."), "warning"), 2500);
      }
      const result = autoShortenPauses(raw);
      if (!checking) return result;
      const check = await checkTake(spoken, result, recognise, `scene_part_${number}.wav`);
      if (!best || check.score > best.score) best = { result, score: check.score, bad: check.status === "bad" };
      if (check.status !== "bad") break;
      if (attempt < retries) redone += attempt === 0 ? 1 : 0;
    }
    if (best!.bad) stillBad.push(number);
    return best!.result;
  };
  const reportChecks = () => {
    if (!checking) return;
    window.setTimeout(() => {
      if (stillBad.length > 0) showToast(`${t("Parts that may have missing words")}: ${stillBad.join(", ")} — ${t("listen to them")}`, "warning");
      else if (redone > 0) showToast(`${t("Parts redone after the check")}: ${redone}`);
    }, 3500);
  };

  if (payload.sceneMode === "lines") {
    sceneLines = [];
    sceneLinesPause = payload.pause;
    sceneLinesCharacters = characters.map((c) => ({ ...c }));
    for (let i = 0; i < replies.length; i++) {
      dramaPartLabel = `${t("Line")} ${i + 1}/${replies.length} · `;
      setProgress("#gen-progress-bar", i, replies.length);
      const { text, voice } = sceneLineRequest(replies[i], characters);
      const result = await checkedTake({ text, voice, options: job.options }, replies[i].text, i + 1, dramaPartLabel);
      sceneLines.push({ reply: replies[i], result: await levelSceneTake(result, level) });
      renderSceneLineResults();
    }
    setProgress("#gen-progress-bar", 1, 1);
    reportAutoShortened();
    reportChecks();
    return showJoinedSceneLines();
  }

  if (payload.sceneMode === "mixed") {
    const narrator = findNarrator(characters);
    if (narrator < 0) throw new Error(t("No narrator in the list: name a character Рассказчик, Рассказчица or Автор"));
    sceneLines = [];
    renderSceneLineResults();
    dramaPartLabel = `${t("Preparing the voices…")} `;
    const sharedVoice = await prepareSceneVoice(characters);
    const parts = mixedSceneParts(replies, narrator);
    const options = { ...job.options, max_seconds: DRAMA_MAX_SECONDS_LIMIT };
    const results: DramaGenerationResult[] = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      dramaPartLabel = `${t("Part")} ${i + 1}/${parts.length} (${part.kind === "narration" ? t("narrator") : t("dialogue")}) · `;
      setProgress("#gen-progress-bar", i, parts.length);
      const request = part.kind === "narration"
        ? sceneLineRequest({ ...part.reply, text: part.text }, characters)
        : { text: sceneText(part.replies, characters), voice: sharedVoice };
      const spoken = part.kind === "narration" ? part.text : part.replies.map((r) => r.text).join(" ");
      const result = await checkedTake({ ...request, options }, spoken, i + 1, dramaPartLabel);
      results.push(await levelSceneTake(result, level));
    }
    setProgress("#gen-progress-bar", 1, 1);
    reportAutoShortened();
    reportChecks();
    return results.length === 1 ? results[0] : concatenateWavResults(results, payload.pause);
  }

  // Whole scene: one shared voice file, the text in parts under the 95 s limit.
  sceneLines = [];
  renderSceneLineResults();
  dramaPartLabel = `${t("Preparing the voices…")} `;
  const voice = await prepareSceneVoice(characters);
  const parts = sceneParts(replies);
  const options = { ...job.options, max_seconds: DRAMA_MAX_SECONDS_LIMIT };
  const results: DramaGenerationResult[] = [];
  for (let i = 0; i < parts.length; i++) {
    dramaPartLabel = parts.length > 1 ? `${t("Part")} ${i + 1}/${parts.length} · ` : "";
    setProgress("#gen-progress-bar", i, parts.length);
    const result = await checkedTake(
      { text: sceneText(parts[i], characters), voice, options },
      parts[i].map((r) => r.text).join(" "),
      i + 1,
      dramaPartLabel,
      // Live playback only makes sense for one continuous request.
      streamPlayback && parts.length === 1,
    );
    results.push(await levelSceneTake(result, level));
  }
  setProgress("#gen-progress-bar", 1, 1);
  reportAutoShortened();
  reportChecks();
  return results.length === 1 ? results[0] : concatenateWavResults(results, 0.3);
}

function initDramaScene(): void {
  const list = el<HTMLElement>("#scene-characters");
  list.addEventListener("input", (event) => {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    const index = Number(input.closest<HTMLElement>(".scene-character-row")?.dataset.index);
    const character = dramaScene.characters[index];
    if (!character) return;
    if (input.dataset.field === "name") {
      character.name = input.value;
      renderSceneSpeakerBar();
    }
    if (input.dataset.field === "description") character.description = input.value;
    if (input.dataset.field === "style") character.style = input.value;
    if (input.dataset.field === "voice") {
      character.voice = input.value;
      renderSceneCharacters();
    }
    persistDramaScene();
    renderScenePreview();
  });
  list.addEventListener("click", (event) => {
    const emotions = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action="emotions"]');
    if (emotions) {
      const row = emotions.closest<HTMLElement>(".scene-character-row")!;
      const character = dramaScene.characters[Number(row.dataset.index)];
      openEmotionBuilder({ kind: "manner", input: row.querySelector<HTMLInputElement>('[data-field="style"]')!, who: character?.name || t("this character") });
      return;
    }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action="remove"]');
    if (!button) return;
    const index = Number(button.closest<HTMLElement>(".scene-character-row")?.dataset.index);
    dramaScene.characters.splice(index, 1);
    persistDramaScene();
    renderSceneCharacters();
    renderScenePreview();
  });
  el("#scene-add-character").addEventListener("click", () => {
    if (dramaScene.characters.length >= DRAMA_MAX_SPEAKERS) return;
    dramaScene.characters.push(newDramaCharacter());
    persistDramaScene();
    renderSceneCharacters();
    renderScenePreview();
    const names = list.querySelectorAll<HTMLInputElement>('[data-field="name"]');
    names[names.length - 1]?.focus();
  });
  el("#scene-detect-characters").addEventListener("click", () => {
    const room = DRAMA_MAX_SPEAKERS - dramaScene.characters.length;
    const names = sceneNameCandidates(dramaScene.script, dramaScene.characters).slice(0, Math.max(0, room));
    for (const name of names) dramaScene.characters.push(newDramaCharacter(name));
    persistDramaScene();
    renderSceneCharacters();
    renderScenePreview();
    if (names.length > 0) showToast(`${t("Characters added")}: ${names.join(", ")}`);
  });
  el<HTMLTextAreaElement>("#scene-script").addEventListener("input", (event) => {
    dramaScene.script = (event.target as HTMLTextAreaElement).value;
    persistDramaScene();
    renderScenePreview();
  });
  speakerHotkeys(SCENE_TEXT_TARGET);
  // A click on a reply in the preview gives it the next character.
  el("#scene-preview").addEventListener("click", (event) => {
    const line = (event.target as HTMLElement).closest<HTMLElement>(".scene-preview-line");
    if (!line || dramaScene.characters.length === 0) return;
    const named = dramaScene.characters.map((c, i) => (c.name.trim() ? i : -1)).filter((i) => i >= 0);
    if (named.length === 0) return;
    const current = Number(line.dataset.character);
    const next = named[(named.indexOf(current) + 1) % named.length];
    setSceneScript(setScriptLineSpeaker(dramaScene.script.replace(/\r\n/g, "\n"), Number(line.dataset.line), dramaScene.characters, next));
  });
  el("#scene-markup-book").addEventListener("click", () => markupSceneBookText(SCENE_TEXT_TARGET));
  el("#scene-markup-undo").addEventListener("click", () => undoSceneMarkup(SCENE_TEXT_TARGET));
  el("#scene-mode-scene").addEventListener("click", () => {
    dramaScene.mode = "scene";
    persistDramaScene();
    renderSceneMode();
    renderScenePreview();
  });
  el("#scene-mode-lines").addEventListener("click", () => {
    dramaScene.mode = "lines";
    persistDramaScene();
    renderSceneMode();
    renderScenePreview();
  });
  el("#scene-mode-mixed").addEventListener("click", () => {
    dramaScene.mode = "mixed";
    persistDramaScene();
    renderSceneMode();
    renderScenePreview();
  });
  el<HTMLInputElement>("#scene-check").addEventListener("change", (event) => {
    dramaScene.check = (event.target as HTMLInputElement).checked;
    persistDramaScene();
  });
  el<HTMLInputElement>("#scene-retries").addEventListener("change", (event) => {
    const v = Math.round(parseFloat((event.target as HTMLInputElement).value));
    dramaScene.retries = Number.isFinite(v) ? Math.min(5, Math.max(0, v)) : 2;
    (event.target as HTMLInputElement).value = String(dramaScene.retries);
    persistDramaScene();
  });
  el<HTMLInputElement>("#scene-level").addEventListener("change", (event) => {
    dramaScene.level = (event.target as HTMLInputElement).checked;
    persistDramaScene();
  });
  el<HTMLInputElement>("#scene-pause").addEventListener("input", (event) => {
    dramaScene.pause = parseFloat((event.target as HTMLInputElement).value);
    el("#scene-val-pause").textContent = dramaScene.pause.toFixed(2);
    persistDramaScene();
  });
  el("#scene-results-list").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-action]");
    if (!button) return;
    const index = Number(button.closest<HTMLElement>(".scene-result-row")?.dataset.index);
    if (button.dataset.action === "play") void playSceneLine(index);
    else if (button.dataset.action === "edit") editSceneLine(index);
    else if (button.dataset.action === "lock") void lockSceneLineVoice(index);
    else void redoSceneLine(index);
  });
  renderDramaScene();
}

/** Fills empty paths with the defaults found on disk and loads speech.dll (not the model). */
async function initDramaPaths(): Promise<void> {
  const defaults = await invoke<{ libraryPath: string | null; modelPath: string | null }>("drama_default_paths").catch(() => null);
  const libraryInput = el<HTMLInputElement>("#drama-library-path");
  const modelInput = el<HTMLInputElement>("#drama-model-path");
  if (!libraryInput.value && defaults?.libraryPath) libraryInput.value = defaults.libraryPath;
  if (!modelInput.value && defaults?.modelPath) modelInput.value = defaults.modelPath;
  if (activeEngine !== "drama" || !libraryInput.value) {
    renderDramaStatus();
    return;
  }
  try {
    const status = await invoke<DramaStatus & { devices: DramaDevice[] }>("drama_load_library", {
      libraryPath: libraryInput.value,
    });
    dramaDevices = status.devices || [];
    dramaStatus = status;
    renderDramaDeviceSelect();
  } catch (e) {
    el<HTMLElement>("#drama-detail").textContent = `${t("speech.dll did not load")}: ${e}`;
    el<HTMLElement>("#drama-detail").classList.add("warn");
    return;
  }
  renderDramaStatus();
}

// ═══════════════════════════════════════════════════════════════════════════
// Batch generation (dedicated tab): many clips at once from a textarea
// (one line = one clip) and/or loaded .txt files. Each clip is generated with
// the base voice or a chosen saved identity, rendered with its own player and
// save button, and also stored in History.
// ═══════════════════════════════════════════════════════════════════════════

let batchFileClips: string[] = [];
let batchRunning = false;
let batchCancel = false;

function setBatchLog(text: string): void {
  el<HTMLElement>("#batch-log").textContent = text;
}

function updateBatchFilesInfo(): void {
  const info = el<HTMLElement>("#batch-files-info");
  const clearBtn = el<HTMLButtonElement>("#batch-clear-files");
  if (batchFileClips.length > 0) {
    info.textContent = `${t("From files:")} ${batchFileClips.length}`;
    clearBtn.classList.remove("hidden");
  } else {
    info.textContent = "";
    clearBtn.classList.add("hidden");
  }
}

function refreshBatchPersonaOptions(): void {
  const select = document.querySelector<HTMLSelectElement>("#batch-persona");
  if (!select) return;
  const current = select.value;
  select.innerHTML = personaOptions(current, "Base voice (no cloning)");
}

async function loadBatchTxtFiles(): Promise<void> {
  try {
    const selected = await open({ multiple: true, filters: [{ name: "Text", extensions: ["txt"] }] });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    const splitLines = el<HTMLInputElement>("#batch-split-lines").checked;
    let added = 0;
    for (const path of paths) {
      const content = await invoke<string>("read_text_file", { path });
      if (splitLines) {
        for (const line of content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
          batchFileClips.push(line);
          added += 1;
        }
      } else {
        const whole = content.trim();
        if (whole) {
          batchFileClips.push(whole);
          added += 1;
        }
      }
    }
    updateBatchFilesInfo();
    showToast(`${t("Clips loaded from files:")} ${added}`);
  } catch (e) {
    showToast(`${t("Could not read files")}: ${e}`, "error");
  }
}

function collectBatchTexts(): string[] {
  const fromTextarea = el<HTMLTextAreaElement>("#batch-text").value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return [...fromTextarea, ...batchFileClips];
}

function buildBatchJob(text: string, persona: SpeakerPersona | undefined): GenerationJob {
  const payload: GenerationJob["payload"] = persona && persona.refPath
    ? {
        kind: "clone",
        text,
        refPath: persona.refPath,
        refName: persona.refName,
        refText: persona.refText || undefined,
        normalize: persona.normalize,
        personaId: persona.id,
      }
    : { kind: "tts", text };
  return {
    id: nextId("batch"),
    mode: payload.kind === "clone" ? "clone" : "tts",
    label: text.slice(0, 48),
    createdAt: Date.now(),
    options: gatherOptions(),
    deliveryPrefix: deliveryControlPrefix(),
    payload,
  };
}

async function saveResultToFile(result: GenerationResult, defaultName: string, format: SaveFormat = selectedSaveFormat): Promise<void> {
  try {
    const path = await save({
      defaultPath: `${defaultName}.${format}`,
      filters: [format === "wav"
        ? { name: "WAV Audio", extensions: ["wav"] }
        : { name: "MP3 Audio", extensions: ["mp3"] }],
    });
    if (!path) return;
    const base64Audio = format === "wav"
      ? result.wavBase64
      : bytesToBase64(await encodeMp3FromWav(result.wavBase64));
    await invoke("save_binary_file", { path, base64Data: base64Audio });
    showToast(`${t("Saved")} ${format.toUpperCase()}`);
  } catch (e) {
    showToast(`Save failed: ${e}`, "error");
  }
}

function appendBatchResult(index: number, text: string, result: GenerationResult): void {
  const list = el<HTMLElement>("#batch-results");
  const card = document.createElement("div");
  card.className = "batch-result-item";
  const label = document.createElement("div");
  label.className = "batch-result-label";
  label.textContent = `${index + 1}. ${text.slice(0, 80)}`;
  const audio = document.createElement("audio");
  audio.controls = true;
  audio.preload = "none";
  void base64ToBlobAsync(result.wavBase64, "audio/wav").then((blob) => {
    audio.src = URL.createObjectURL(blob);
  });
  const saveBtn = document.createElement("button");
  saveBtn.className = "compact-button";
  saveBtn.type = "button";
  saveBtn.textContent = t("Save");
  saveBtn.addEventListener("click", () => void saveResultToFile(result, `higgs_batch_${index + 1}`));
  const row = document.createElement("div");
  row.className = "batch-result-controls";
  row.append(audio, saveBtn);
  card.append(label, row);
  list.appendChild(card);
}

async function runBatch(): Promise<void> {
  if (batchRunning) return;
  const texts = collectBatchTexts();
  if (texts.length === 0) {
    showToast("Please enter text to speak (one clip per line)", "warning");
    return;
  }
  if (!(await ensureLoadedForGeneration())) return;
  const personaId = el<HTMLSelectElement>("#batch-persona").value;
  const persona = personaId ? findPersona(personaId) : undefined;
  batchRunning = true;
  batchCancel = false;
  el<HTMLElement>("#batch-results").innerHTML = "";
  el<HTMLButtonElement>("#batch-generate-btn").classList.add("hidden");
  el<HTMLButtonElement>("#batch-stop-btn").classList.remove("hidden");
  let done = 0;
  let failed = 0;
  for (let i = 0; i < texts.length; i++) {
    if (batchCancel) break;
    setBatchLog(`${t("Generating")} ${i + 1}/${texts.length}…`);
    try {
      const result = await generateJobAudio(buildBatchJob(texts[i], persona));
      if (batchCancel) break;
      appendBatchResult(i, texts[i], result);
      addHistory("batch", texts[i].slice(0, 48), result);
      done += 1;
    } catch (e) {
      const msg = String(e);
      if (msg.toLowerCase().includes("cancel")) break;
      failed += 1;
      const err = document.createElement("div");
      err.className = "batch-result-item error";
      err.textContent = `${i + 1}. ${t("Failed")}: ${e}`;
      el<HTMLElement>("#batch-results").appendChild(err);
    }
  }
  batchRunning = false;
  el<HTMLButtonElement>("#batch-generate-btn").classList.remove("hidden");
  el<HTMLButtonElement>("#batch-stop-btn").classList.add("hidden");
  setBatchLog(batchCancel
    ? `${t("Stopped")}. ${t("Done")}: ${done}`
    : `${t("Done")}: ${done}${failed ? ` · ${t("Failed")}: ${failed}` : ""}`);
}

async function stopBatch(): Promise<void> {
  batchCancel = true;
  try {
    await invoke("cancel_generation");
  } catch {
    /* engine may be idle */
  }
}

function initBatchTab(): void {
  refreshBatchPersonaOptions();
  el("#batch-load-files").addEventListener("click", () => void loadBatchTxtFiles());
  el("#batch-clear-files").addEventListener("click", () => {
    batchFileClips = [];
    updateBatchFilesInfo();
  });
  el("#batch-generate-btn").addEventListener("click", () => void runBatch());
  el("#batch-stop-btn").addEventListener("click", () => void stopBatch());
}

// ═══════════════════════════════════════════════════════════════════════════
// Transcript & Diarization tab
// ═══════════════════════════════════════════════════════════════════════════

// Source file selected for transcription (audio path OR video path — the Rust
// decode path (ensure_wav → symphonia) extracts the audio track). We keep the
// ORIGINAL path so the backend re-decodes it for both transcription and voice
// building; a temp .wav name is only shown for recordings.
let transcriptSourcePath = "";
let transcriptSourceLabel = "";
// Names shown per speaker (index = contiguous speaker id 0..k-1), editable in UI.
let transcriptSpeakerNames: string[] = [];
let transcriptResult: TranscriptResult | null = null;
let transcriptRunning = false;
// Cached decoded WAV for in-tab segment playback (one <audio> reused).
const transcriptPlayer = new Audio();
let transcriptPlayerUrl = "";
let transcriptPlayStopTimer: number | null = null;
let transcriptProgressUnlisten: (() => void) | null = null;

const TRANSCRIPT_VIDEO_EXTS = ["mp4", "mkv", "webm", "mov", "m4v", "avi"];
const TRANSCRIPT_AUDIO_EXTS = ["wav", "mp3", "flac", "m4a", "ogg", "aac", "opus"];

function isTranscriptVideoPath(path: string): boolean {
  const ext = (path.split(".").pop() || "").toLowerCase();
  return TRANSCRIPT_VIDEO_EXTS.includes(ext);
}

// Speaker chip colors — distinct hues, reused cyclically past 6 speakers.
const SPEAKER_COLORS = ["#25b8ab", "#e0803a", "#7a6ff0", "#d8556f", "#48a860", "#c9a227"];
function speakerColor(id: number): string {
  return SPEAKER_COLORS[((id % SPEAKER_COLORS.length) + SPEAKER_COLORS.length) % SPEAKER_COLORS.length];
}
function transcriptSpeakerName(id: number): string {
  return transcriptSpeakerNames[id] || `${t("Speaker")} ${id + 1}`;
}

async function refreshTranscriptModelNote(): Promise<void> {
  const note = document.querySelector<HTMLElement>("#transcript-sortformer-note");
  const dlBtn = document.querySelector<HTMLButtonElement>("#transcript-download-diar");
  const diarizeToggle = document.querySelector<HTMLInputElement>("#transcript-diarize");
  try {
    const status = await invoke<{ installed: boolean; path: string }>("sortformer_status");
    if (note) {
      note.textContent = status.installed
        ? t("Diarization model ready.")
        : t("Diarization model not downloaded — single-speaker transcription only.");
    }
    if (dlBtn) dlBtn.classList.toggle("hidden", status.installed);
    if (diarizeToggle && !status.installed) diarizeToggle.checked = false;
  } catch (e) {
    if (note) note.textContent = String(e);
  }
}

async function downloadDiarizationModel(): Promise<void> {
  const btn = el<HTMLButtonElement>("#transcript-download-diar");
  btn.disabled = true;
  showToast(t("Downloading diarization model…"));
  try {
    await invoke("download_sortformer");
    showToast(t("Diarization model downloaded."));
    const toggle = document.querySelector<HTMLInputElement>("#transcript-diarize");
    if (toggle) toggle.checked = true;
    await refreshTranscriptModelNote();
  } catch (e) {
    showToast(`${t("Model download failed")}: ${e}`, "error");
  } finally {
    btn.disabled = false;
  }
}

// ── Очистка голоса (вокал-сепарация) — статус модели/движка и скачивание ──
async function refreshVoiceCleanNote(): Promise<void> {
  let installed = false;
  try {
    const status = await invoke<{ installed: boolean }>("voiceclean_status");
    installed = status.installed;
  } catch (e) {
    installed = false;
  }
  const noteText = installed
    ? t("Voice-cleaning model ready.")
    : t("Voice-cleaning engine not downloaded — references used as-is.");
  for (const [noteSel, btnSel] of [
    ["#transcript-voiceclean-note", "#transcript-download-voiceclean"],
    ["#clone-voiceclean-note", "#clone-download-voiceclean"],
  ] as const) {
    const note = document.querySelector<HTMLElement>(noteSel);
    const btn = document.querySelector<HTMLButtonElement>(btnSel);
    if (note) note.textContent = noteText;
    if (btn) btn.classList.toggle("hidden", installed);
  }
}

async function downloadVoiceCleanModel(triggerSel: string): Promise<void> {
  const btn = document.querySelector<HTMLButtonElement>(triggerSel);
  if (btn) btn.disabled = true;
  showToast(t("Downloading voice-cleaning model…"));
  try {
    await invoke("download_voiceclean");
    showToast(t("Voice-cleaning model downloaded."));
    await refreshVoiceCleanNote();
  } catch (e) {
    showToast(`${t("Model download failed")}: ${e}`, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Держим оба тумблера «Очистка голоса» синхронными и персистим выбор.
function setVoiceCleanEnabled(on: boolean): void {
  voiceCleanEnabled = on;
  localStorage.setItem("higgsAudio.voiceClean", on ? "true" : "false");
  for (const sel of ["#transcript-voiceclean", "#clone-voiceclean"]) {
    const toggle = document.querySelector<HTMLInputElement>(sel);
    if (toggle && toggle.checked !== on) toggle.checked = on;
  }
}

function setTranscriptSource(path: string, label: string): void {
  transcriptSourcePath = path;
  transcriptSourceLabel = label;
  const wrap = el<HTMLElement>("#transcript-source");
  wrap.classList.toggle("hidden", !path);
  el<HTMLElement>("#transcript-source-name").textContent = label;
}

function clearTranscriptSource(): void {
  setTranscriptSource("", "");
  el<HTMLButtonElement>("#transcript-run-btn").disabled = false;
}

async function pickTranscriptFile(): Promise<void> {
  const selected = await open({
    filters: [
      { name: "Media", extensions: [...TRANSCRIPT_AUDIO_EXTS, ...TRANSCRIPT_VIDEO_EXTS] },
      { name: "Audio", extensions: TRANSCRIPT_AUDIO_EXTS },
      { name: "Video", extensions: TRANSCRIPT_VIDEO_EXTS },
    ],
  });
  if (!selected) return;
  const path = Array.isArray(selected) ? selected[0] : selected;
  const name = path.split(/[/\\]/).pop() || path;
  setTranscriptSource(path, name);
}

function setTranscriptStatus(text: string): void {
  el<HTMLElement>("#transcript-status").textContent = text;
}

// Live progress phases emitted by the `diarize_transcribe` command.
function transcriptPhaseLabel(phase: string): string {
  switch (phase) {
    case "decode": return t("Decoding…");
    case "diarize": return t("Diarizing…");
    case "transcribe": return t("Transcribing…");
    default: return "";
  }
}

async function runTranscription(): Promise<void> {
  if (transcriptRunning) return;
  if (!transcriptSourcePath) {
    showToast(t("Choose an audio or video file first."), "warning");
    return;
  }
  const whisperModelPath = localStorage.getItem("higgsAudio.whisperModel") || "";
  if (!whisperModelPath) {
    showToast(t("No ASR model set. Download the Parakeet model in Settings."), "warning");
    return;
  }

  transcriptRunning = true;
  const runBtn = el<HTMLButtonElement>("#transcript-run-btn");
  runBtn.disabled = true;
  el<HTMLButtonElement>("#transcript-export-txt").classList.add("hidden");
  el<HTMLButtonElement>("#transcript-export-srt").classList.add("hidden");
  el<HTMLElement>("#transcript-result").innerHTML = "";
  transcriptResult = null;
  transcriptSpeakerNames = [];
  setTranscriptStatus(t("Decoding…"));

  const diarize = el<HTMLInputElement>("#transcript-diarize").checked;
  // Follow staged progress from the backend.
  transcriptProgressUnlisten = await listen<{ phase: string }>("transcript-progress", (e) => {
    const label = transcriptPhaseLabel(e.payload.phase);
    if (label) setTranscriptStatus(label);
  });

  try {
    const result = await invoke<TranscriptResult>("diarize_transcribe", {
      audioPath: transcriptSourcePath,
      whisperModelPath,
      diarize,
    });
    transcriptResult = result;
    transcriptSpeakerNames = Array.from(
      { length: Math.max(1, result.nSpeakers) },
      (_, i) => `${t("Speaker")} ${i + 1}`,
    );
    renderTranscript();
    if (result.segments.length === 0) {
      setTranscriptStatus(t("No speech found."));
    } else {
      const spk = result.nSpeakers <= 1
        ? t("1 speaker")
        : `${result.nSpeakers} ${t("speakers")}`;
      setTranscriptStatus(`${spk} · ${result.segments.length}`);
      el<HTMLButtonElement>("#transcript-export-txt").classList.remove("hidden");
      el<HTMLButtonElement>("#transcript-export-srt").classList.remove("hidden");
    }
  } catch (e) {
    const msg = String(e);
    // Video with no decodable audio track surfaces as a symphonia probe/decode error.
    if (isTranscriptVideoPath(transcriptSourcePath) && /probe|decode|no audio/i.test(msg)) {
      setTranscriptStatus(t("Video has no decodable audio track, or the container is unsupported (try mp4)."));
    } else {
      setTranscriptStatus(`${t("Transcription failed")}: ${msg}`);
    }
    showToast(`${t("Transcription failed")}: ${msg}`, "error");
  } finally {
    transcriptProgressUnlisten?.();
    transcriptProgressUnlisten = null;
    transcriptRunning = false;
    runBtn.disabled = false;
  }
}

// Play just one segment [start,end] by decoding the source once into an <audio>.
async function playTranscriptSegment(start: number, end: number): Promise<void> {
  try {
    if (!transcriptPlayerUrl) {
      // Decode the source to a real WAV once, blob it for HTML5 playback.
      const decoded = await invoke<{ wavBase64: string }>("read_audio_as_wav", {
        audioPath: transcriptSourcePath,
      });
      const blob = await base64ToBlobAsync(decoded.wavBase64, "audio/wav");
      transcriptPlayerUrl = URL.createObjectURL(blob);
      transcriptPlayer.src = transcriptPlayerUrl;
    }
    if (transcriptPlayStopTimer !== null) {
      window.clearTimeout(transcriptPlayStopTimer);
      transcriptPlayStopTimer = null;
    }
    transcriptPlayer.currentTime = Math.max(0, start);
    await transcriptPlayer.play();
    const ms = Math.max(120, (end - start) * 1000);
    transcriptPlayStopTimer = window.setTimeout(() => {
      transcriptPlayer.pause();
      transcriptPlayStopTimer = null;
    }, ms);
  } catch (e) {
    showToast(`${t("Transcription failed")}: ${e}`, "error");
  }
}

function formatTimecode(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function renderTranscript(): void {
  const root = el<HTMLElement>("#transcript-result");
  root.innerHTML = "";
  if (!transcriptResult || transcriptResult.segments.length === 0) return;

  const diarized = transcriptResult.diarized && transcriptResult.nSpeakers > 1;
  const nSpeakers = Math.max(1, transcriptResult.nSpeakers);

  // Per-speaker header row (rename + make voice) — always, incl. single speaker
  // (запись самого себя — самый частый случай «сделать голос»).
  {
    const speakersBar = document.createElement("div");
    speakersBar.className = "transcript-speakers";
    for (let sid = 0; sid < nSpeakers; sid++) {
      const chip = document.createElement("div");
      chip.className = "transcript-speaker-head";
      chip.style.setProperty("--spk-color", speakerColor(sid));

      const nameInput = document.createElement("input");
      nameInput.className = "transcript-speaker-name";
      nameInput.type = "text";
      nameInput.value = transcriptSpeakerName(sid);
      nameInput.title = t("Rename speaker");
      nameInput.addEventListener("change", () => {
        transcriptSpeakerNames[sid] = nameInput.value.trim() || `${t("Speaker")} ${sid + 1}`;
        // Re-render segment labels to reflect the new name.
        renderTranscript();
      });

      const voiceBtn = document.createElement("button");
      voiceBtn.className = "compact-button";
      voiceBtn.type = "button";
      voiceBtn.textContent = t("Make voice");
      voiceBtn.addEventListener("click", () => void makeSpeakerVoice(sid, voiceBtn));

      chip.append(nameInput, voiceBtn);
      speakersBar.appendChild(chip);
    }
    root.appendChild(speakersBar);
  }

  // Segments in time order, colored by speaker.
  const list = document.createElement("div");
  list.className = "transcript-segments";
  const ordered = [...transcriptResult.segments].sort((a, b) => a.start - b.start);
  for (const seg of ordered) {
    const item = document.createElement("div");
    item.className = "transcript-segment";
    item.style.setProperty("--spk-color", speakerColor(seg.speaker));

    const meta = document.createElement("div");
    meta.className = "transcript-segment-meta";
    if (diarized) {
      const tag = document.createElement("span");
      tag.className = "transcript-speaker-tag";
      tag.textContent = transcriptSpeakerName(seg.speaker);
      meta.appendChild(tag);
    }
    const time = document.createElement("button");
    time.className = "transcript-segment-time";
    time.type = "button";
    time.title = t("Play segment");
    time.textContent = `▶ ${formatTimecode(seg.start)}`;
    time.addEventListener("click", () => void playTranscriptSegment(seg.start, seg.end));
    meta.appendChild(time);

    const text = document.createElement("div");
    text.className = "transcript-segment-text";
    text.textContent = seg.text;

    item.append(meta, text);
    list.appendChild(item);
  }
  root.appendChild(list);
}

// «Сделать голос»: collect a speaker's best segments into a reference clip and
// register it as a gallery persona — same mechanism as importStandardVoicePack.
async function makeSpeakerVoice(speaker: number, btn: HTMLButtonElement): Promise<void> {
  if (!transcriptResult) return;
  const name = transcriptSpeakerName(speaker).trim();
  if (speakerPersonas.some((p) => p.name.trim().toLowerCase() === name.toLowerCase())) {
    showToast(t("A speaker with this name already exists"), "warning");
    return;
  }
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = t("Building voice…");
  try {
    const built = await invoke<{ path: string; refText: string }>("build_speaker_voice", {
      audioPath: transcriptSourcePath,
      segments: transcriptResult.segments as TranscriptSegment[],
      speaker,
      speakerName: name,
      cleanVoice: voiceCleanEnabled,
    });
    const persona = createBlankPersona();
    persona.name = name;
    // Реф уже очищен в build_speaker_voice — не гоняем сепаратор повторно.
    const prepared = await prepareReferenceAudioFile(built.path, `${name}.wav`, false);
    const stored = await storeSpeakerAsset(persona, prepared.path, "audio");
    persona.refPath = stored.path;
    persona.refName = prepared.name || stored.fileName;
    persona.refText = built.refText;
    persona.cachePath = "";
    persona.updatedAt = Date.now();
    speakerPersonas.push(persona);
    saveSpeakerPersonas();
    renderSpeakerPersonaUi();
    showToast(`${t("Voice added to gallery")}: ${name}`);
  } catch (e) {
    showToast(`${t("Could not build voice")}: ${e}`, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function transcriptToTxt(): string {
  if (!transcriptResult) return "";
  const diarized = transcriptResult.diarized && transcriptResult.nSpeakers > 1;
  return [...transcriptResult.segments]
    .sort((a, b) => a.start - b.start)
    .map((s) => (diarized ? `[${transcriptSpeakerName(s.speaker)}] ${s.text}` : s.text))
    .join("\n");
}

function srtTimecode(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const pad = (n: number, w = 2) => n.toString().padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)},${pad(ms, 3)}`;
}

function transcriptToSrt(): string {
  if (!transcriptResult) return "";
  const diarized = transcriptResult.diarized && transcriptResult.nSpeakers > 1;
  const ordered = [...transcriptResult.segments].sort((a, b) => a.start - b.start);
  return ordered
    .map((s, i) => {
      const body = diarized ? `${transcriptSpeakerName(s.speaker)}: ${s.text}` : s.text;
      return `${i + 1}\n${srtTimecode(s.start)} --> ${srtTimecode(s.end)}\n${body}\n`;
    })
    .join("\n");
}

async function exportTranscript(kind: "txt" | "srt"): Promise<void> {
  if (!transcriptResult || transcriptResult.segments.length === 0) {
    showToast(t("Nothing to export yet."), "warning");
    return;
  }
  const content = kind === "txt" ? transcriptToTxt() : transcriptToSrt();
  const base = (transcriptSourceLabel.replace(/\.[^.]+$/, "") || "transcript");
  try {
    const path = await save({
      defaultPath: `${base}.${kind}`,
      filters: [{ name: kind.toUpperCase(), extensions: [kind] }],
    });
    if (!path) return;
    await invoke("save_text_file", { path, content });
    showToast(`${t("Exported")} .${kind}`);
  } catch (e) {
    showToast(`${t("Export failed")}: ${e}`, "error");
  }
}

function initTranscriptTab(): void {
  el("#transcript-pick-btn").addEventListener("click", () => void pickTranscriptFile());
  el("#transcript-source-clear").addEventListener("click", () => clearTranscriptSource());
  el("#transcript-download-diar").addEventListener("click", () => void downloadDiarizationModel());
  // Тумблеры «Очистка голоса» (транскрипт + клон) синхронны, дефолт — из настройки.
  for (const sel of ["#transcript-voiceclean", "#clone-voiceclean"]) {
    const toggle = document.querySelector<HTMLInputElement>(sel);
    if (toggle) {
      toggle.checked = voiceCleanEnabled;
      toggle.addEventListener("change", () => setVoiceCleanEnabled(toggle.checked));
    }
  }
  el("#transcript-download-voiceclean").addEventListener("click", () => void downloadVoiceCleanModel("#transcript-download-voiceclean"));
  const cloneDlVoiceClean = document.querySelector<HTMLButtonElement>("#clone-download-voiceclean");
  if (cloneDlVoiceClean) cloneDlVoiceClean.addEventListener("click", () => void downloadVoiceCleanModel("#clone-download-voiceclean"));
  void refreshVoiceCleanNote();
  el("#transcript-run-btn").addEventListener("click", () => void runTranscription());
  el("#transcript-export-txt").addEventListener("click", () => void exportTranscript("txt"));
  el("#transcript-export-srt").addEventListener("click", () => void exportTranscript("srt"));

  // Record straight into the transcript source (same recorder as everywhere).
  wireRecordButton("#transcript-record-btn", (path, _name) => {
    // A fresh recording invalidates the cached playback blob.
    resetTranscriptPlayback();
    setTranscriptSource(path, t("Recording…"));
  });

  // OS-level drag-drop: the dropzone carries the `.dropzone` class so the global
  // Tauri drop router finds it; register a handler that accepts audio AND video.
  dropzoneHandlers.push({
    selector: "#transcript-dropzone",
    onFile: (path, name) => {
      resetTranscriptPlayback();
      setTranscriptSource(path, name);
    },
  });
  // In-webview HTML5 drop fallback (browser dev / some platforms).
  const dz = el<HTMLElement>("#transcript-dropzone");
  dz.addEventListener("dragover", (e) => {
    e.preventDefault();
    dz.classList.add("drag-over");
  });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag-over"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("drag-over");
    const file = e.dataTransfer?.files?.[0];
    const path = file ? ((file as any).path as string | undefined) : undefined;
    if (path) {
      resetTranscriptPlayback();
      setTranscriptSource(path, file!.name);
    }
  });
}

// Drop the decoded playback blob when the source changes.
function resetTranscriptPlayback(): void {
  if (transcriptPlayStopTimer !== null) {
    window.clearTimeout(transcriptPlayStopTimer);
    transcriptPlayStopTimer = null;
  }
  transcriptPlayer.pause();
  if (transcriptPlayerUrl) {
    URL.revokeObjectURL(transcriptPlayerUrl);
    transcriptPlayerUrl = "";
  }
  transcriptPlayer.removeAttribute("src");
}

async function doCancel(): Promise<void> {
  if (!isGenerating || !activeGenerationJob) return;
  cancelRequested = true;
  const cancelBtn = el<HTMLButtonElement>("#cancel-btn");
  cancelBtn.disabled = true;
  cancelBtn.textContent = "Cancelling...";
  setGenerationElapsedLabel("Cancelling ·");
  try {
    await invoke("cancel_generation");
  } catch (e) {
    cancelRequested = false;
    showToast(`Cancel failed: ${e}`, "error");
    cancelBtn.disabled = false;
    cancelBtn.textContent = "⏹ Cancel";
  }
}

function initGenerate(): void {
  el("#generate-btn").addEventListener("click", doGenerate);
  el("#queue-btn").addEventListener("click", enqueueCurrentGenerationJob);
  el("#cancel-btn").addEventListener("click", doCancel);
  el("#queue-clear-btn").addEventListener("click", () => {
    generationQueue.splice(0, generationQueue.length);
    renderQueuePanel();
    updateGenerationControls();
    showToast("Queue cleared");
  });
  el("#queue-list").addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const action = target.dataset.queueAction;
    const item = target.closest<HTMLElement>("[data-queue-id]");
    if (!action || !item?.dataset.queueId) return;
    const job = removeQueuedJob(item.dataset.queueId);
    if (!job) return;
    if (action === "edit") {
      loadQueuedJobForEdit(job);
    } else {
      showToast("Queued item deleted");
    }
  });
  el("#auto-transcribe-btn").addEventListener("click", () => doAutoTranscribe(cloneRefPath, "#clone-ref-text"));
  const finishTranscribe = document.querySelector<HTMLElement>("#finish-auto-transcribe-btn");
  if (finishTranscribe) finishTranscribe.addEventListener("click", () => doAutoTranscribe(finishRefPath, "#finish-transcript"));
  el("#history-clear-all").addEventListener("click", () => {
    history = [];
    renderHistory();
    showToast("History cleared");
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Audio output — waveform + playback
// ═══════════════════════════════════════════════════════════════════════════

function stopLiveStreamPreview(): void {
  if (!liveStream) return;
  liveStream.processor.onaudioprocess = null;
  try { liveStream.processor.disconnect(); } catch { /* already disconnected */ }
  if (liveStream.finalObjectUrl) URL.revokeObjectURL(liveStream.finalObjectUrl);
  void liveStream.context.close().catch(() => {});
  liveStream = null;
  el<HTMLElement>("#output-section").classList.remove("streaming");
  el<HTMLButtonElement>("#play-btn").textContent = "▶";
}

function startLiveStreamPreview(): void {
  stopLiveStreamPreview();
  const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;
  const context = new AudioContextCtor();
  const processor = context.createScriptProcessor(1024, 0, 2);
  processor.onaudioprocess = processLiveStreamAudio;
  processor.connect(context.destination);
  void context.resume().catch(() => {});
  lastResult = null;
  waveformBuildToken += 1;
  if (!audioPlayer.paused) audioPlayer.pause();
  audioPlayer.removeAttribute("src");
  audioPlayer.load();
  waveformSamples = new Float32Array(0);
  el<HTMLElement>("#output-section").classList.remove("hidden");
  el<HTMLElement>("#output-section").classList.add("streaming");
  el<HTMLButtonElement>("#play-btn").textContent = "⏸";
  setText("#output-time", "00:00 / 00:00");
  drawWaveform();
  liveStream = {
    context,
    processor,
    sampleRate: 0,
    channels: 0,
    receivedFrames: 0,
    playbackFrame: 0,
    playing: true,
    pcm: new Float32Array(0),
    finalized: false,
    finalObjectUrl: null,
    finalDuration: 0,
  };
  startWaveLoop();
}

function processLiveStreamAudio(event: AudioProcessingEvent): void {
  const stream = liveStream;
  const output = event.outputBuffer;
  const outputs = Array.from({ length: output.numberOfChannels }, (_, channel) => output.getChannelData(channel));
  for (const channel of outputs) channel.fill(0);
  if (!stream || !stream.playing || !stream.sampleRate || !stream.channels || stream.receivedFrames <= 0) return;

  const rateRatio = stream.sampleRate / stream.context.sampleRate;
  const frameCount = output.length;
  for (let outFrame = 0; outFrame < frameCount; outFrame++) {
    if (stream.playbackFrame >= stream.receivedFrames) {
      if (stream.finalized && stream.finalObjectUrl) {
        stream.playing = false;
        requestAnimationFrame(() => completeLiveStreamToFinalPlayer(true));
      }
      break;
    }

    const baseFrame = Math.floor(stream.playbackFrame);
    const frac = stream.playbackFrame - baseFrame;
    const nextFrame = Math.min(baseFrame + 1, stream.receivedFrames - 1);
    for (let outChannel = 0; outChannel < outputs.length; outChannel++) {
      const sourceChannel = stream.channels === 1 ? 0 : Math.min(outChannel, stream.channels - 1);
      const a = stream.pcm[baseFrame * stream.channels + sourceChannel] || 0;
      const b = stream.pcm[nextFrame * stream.channels + sourceChannel] || a;
      outputs[outChannel][outFrame] = (a + (b - a) * frac) * outputVolume;
    }
    stream.playbackFrame += rateRatio;
  }
}

function scheduleLiveAudioChunk(event: GenerationAudioChunkEvent): void {
  if (!isGenerating || !liveStream) return;
  try {
    const pcm = parseWavPcm(event.wavBase64);
    if (pcm.samples.length === 0) return;
    const frames = Math.floor(pcm.samples.length / pcm.channels);
    if (frames <= 0) return;
    if (!liveStream.sampleRate || !liveStream.channels) {
      liveStream.sampleRate = pcm.sampleRate;
      liveStream.channels = pcm.channels;
      setGenerationElapsedLabel();
    }
    if (liveStream.sampleRate !== pcm.sampleRate || liveStream.channels !== pcm.channels) return;
    const hintedStart = Number.isFinite(event.startSample) && event.startSample >= 0
      ? Math.floor(event.startSample / pcm.channels)
      : liveStream.receivedFrames;
    placeLivePcmChunk(pcm, Math.max(0, hintedStart));
    updateOutputTimeLabel();
    drawWaveform();
    startWaveLoop();
  } catch {
    // Streaming preview is best-effort; final output still arrives normally.
  }
}

function placeLivePcmChunk(pcm: WavPcm, startFrame: number): void {
  if (!liveStream) return;
  const frames = Math.floor(pcm.samples.length / pcm.channels);
  if (frames <= 0) return;
  const incoming = new Float32Array(frames * pcm.channels);
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < pcm.channels; channel++) {
      incoming[frame * pcm.channels + channel] = pcm.samples[frame * pcm.channels + channel] / 32768;
    }
  }

  const fadeFrames = Math.min(96, frames);
  if (fadeFrames > 0) {
    for (let channel = 0; channel < pcm.channels; channel++) {
      const previous = startFrame > 0 && (startFrame - 1) < liveStream.receivedFrames
        ? liveStream.pcm[(startFrame - 1) * pcm.channels + channel] || 0
        : 0;
      for (let frame = 0; frame < fadeFrames; frame++) {
        const index = frame * pcm.channels + channel;
        const target = incoming[index];
        const weight = (frame + 1) / fadeFrames;
        incoming[index] = previous + (target - previous) * weight;
      }
    }
  }

  const neededSamples = (startFrame + frames) * pcm.channels;
  if (liveStream.pcm.length < neededSamples) {
    const next = new Float32Array(Math.max(neededSamples, Math.ceil(liveStream.pcm.length * 1.5) + 48000));
    next.set(liveStream.pcm);
    liveStream.pcm = next;
  }
  liveStream.pcm.set(incoming, startFrame * pcm.channels);
  liveStream.receivedFrames = Math.max(liveStream.receivedFrames, startFrame + frames);
  refreshLiveWaveformFromBuffer();
}

function refreshLiveWaveformFromBuffer(): void {
  if (!liveStream || !liveStream.channels || liveStream.receivedFrames <= 0) {
    waveformSamples = new Float32Array(0);
    return;
  }
  const mono = new Float32Array(liveStream.receivedFrames);
  for (let frame = 0; frame < liveStream.receivedFrames; frame++) {
    mono[frame] = liveStream.pcm[frame * liveStream.channels] || 0;
  }
  waveformSamples = mono;
}

function liveStreamDuration(): number {
  if (!liveStream || !liveStream.sampleRate) return 0;
  return liveStream.receivedFrames / liveStream.sampleRate;
}

function liveStreamCurrentTime(): number {
  if (!liveStream || !liveStream.sampleRate) return 0;
  return Math.min(liveStream.playbackFrame / liveStream.sampleRate, liveStreamFinalDuration());
}

function liveStreamFinalDuration(): number {
  if (!liveStream) return 0;
  return Math.max(liveStreamDuration(), liveStream.finalDuration);
}

function seekLiveStream(timeSeconds: number): void {
  if (!liveStream || !liveStream.sampleRate) return;
  const maxTime = liveStreamFinalDuration();
  const clamped = Math.max(0, Math.min(timeSeconds, maxTime));
  liveStream.playbackFrame = clamped * liveStream.sampleRate;
  updateOutputTimeLabel();
  drawWaveform();
}

function updateOutputTimeLabel(): void {
  if (liveStream) {
    setText("#output-time", `${formatTime(liveStreamCurrentTime())} / ${formatTime(liveStreamFinalDuration())}`);
    return;
  }
  setText("#output-time", `${formatTime(audioPlayer.currentTime)} / ${formatTime(audioPlayer.duration || 0)}`);
}

function completeLiveStreamToFinalPlayer(resumePlayback: boolean): void {
  if (!liveStream || !liveStream.finalObjectUrl) return;
  const finalUrl = liveStream.finalObjectUrl;
  const currentTime = liveStreamCurrentTime();
  liveStream.finalObjectUrl = null;
  liveStream.processor.onaudioprocess = null;
  try { liveStream.processor.disconnect(); } catch { /* already disconnected */ }
  void liveStream.context.close().catch(() => {});
  liveStream = null;
  el<HTMLElement>("#output-section").classList.remove("streaming");
  if (outputObjectUrl && outputObjectUrl !== finalUrl) URL.revokeObjectURL(outputObjectUrl);
  outputObjectUrl = finalUrl;
  audioPlayer.src = finalUrl;
  audioPlayer.load();
  const finalDuration = streamSafeDurationFromWaveform();
  el<HTMLButtonElement>("#play-btn").textContent = "▶";
  audioPlayer.onloadedmetadata = () => {
    if (audioPlayer.duration > 0) {
      audioPlayer.currentTime = Math.min(currentTime, audioPlayer.duration);
    } else if (finalDuration > 0) {
      audioPlayer.currentTime = Math.min(currentTime, finalDuration);
    }
    if (resumePlayback && audioPlayer.currentTime < (audioPlayer.duration || finalDuration) - 0.05) {
      void audioPlayer.play().then(() => {
        el<HTMLButtonElement>("#play-btn").textContent = "⏸";
        startWaveLoop();
      }).catch(() => {});
    }
    updateOutputTimeLabel();
    drawWaveform();
  };
  setText("#output-time", `${formatTime(Math.min(currentTime, finalDuration))} / ${formatTime(finalDuration)}`);
  drawWaveform();
}

function streamSafeDurationFromWaveform(): number {
  if (lastResult) {
    return lastResult.sampleCount / lastResult.sampleRate / lastResult.channels;
  }
  return waveformSamples ? waveformSamples.length / 48000 : 0;
}

function finalizeLiveStreamOutput(result: GenerationResult, mode: Mode, token: number): void {
  if (currentMode === mode && isGenerationMode(mode)) {
    el<HTMLElement>("#output-section").classList.remove("hidden");
  }
  const duration = result.sampleCount / result.sampleRate / result.channels;
  if (liveStream) {
    liveStream.finalized = true;
    liveStream.finalDuration = duration;
  }
  updateOutputTimeLabel();
  void base64ToBlobAsync(result.wavBase64, "audio/wav").then((blob) => {
    if (token !== waveformBuildToken) return;
    const url = URL.createObjectURL(blob);
    if (liveStream) {
      if (liveStream.finalObjectUrl) URL.revokeObjectURL(liveStream.finalObjectUrl);
      liveStream.finalObjectUrl = url;
      if (liveStream.finalized && !liveStream.playing) {
        completeLiveStreamToFinalPlayer(false);
      }
    } else {
      if (outputObjectUrl) URL.revokeObjectURL(outputObjectUrl);
      outputObjectUrl = url;
      audioPlayer.src = outputObjectUrl;
      audioPlayer.load();
    }
  }).catch(() => {
    if (token === waveformBuildToken) showToast("Could not prepare audio preview", "warning");
  });
  void drawWaveformFromBase64(result.wavBase64, token);
}

function showOutput(result: GenerationResult, mode: Mode = currentMode): void {
  const token = ++waveformBuildToken;
  // Store for this mode
  outputByMode[mode] = result;
  lastResult = result;

  if (liveStream) {
    finalizeLiveStreamOutput(result, mode, token);
    return;
  }

  // Stop any current playback
  if (!audioPlayer.paused) audioPlayer.pause();
  el<HTMLButtonElement>("#play-btn").textContent = "▶";

  audioPlayer.removeAttribute("src");
  void base64ToBlobAsync(result.wavBase64, "audio/wav").then((blob) => {
    if (token !== waveformBuildToken) return;
    if (outputObjectUrl) URL.revokeObjectURL(outputObjectUrl);
    outputObjectUrl = URL.createObjectURL(blob);
    audioPlayer.src = outputObjectUrl;
    audioPlayer.load();
  }).catch(() => {
    if (token === waveformBuildToken) showToast("Could not prepare audio preview", "warning");
  });

  if (currentMode === mode && isGenerationMode(mode)) {
    el<HTMLElement>("#output-section").classList.remove("hidden");
  }

  const duration = result.sampleCount / result.sampleRate / result.channels;
  setText("#output-time", `00:00 / ${formatTime(duration)}`);

  audioPlayer.onloadedmetadata = () => {
    updateOutputTimeLabel();
  };
  audioPlayer.onended = () => {
    el<HTMLButtonElement>("#play-btn").textContent = "▶";
    if (waveRAF) { cancelAnimationFrame(waveRAF); waveRAF = null; }
    drawWaveform();
  };

  waveformSamples = null;
  drawWaveform();
  void drawWaveformFromBase64(result.wavBase64, token);
}

let waveformSamples: Float32Array | null = null;
let waveRAF: number | null = null;
let waveformBuildToken = 0;
let outputObjectUrl: string | null = null;

function startWaveLoop(): void {
  const tick = () => {
    updateOutputTimeLabel();
    drawWaveform();
    if (liveStream) {
      if (liveStream.playing || !liveStream.finalized) {
        waveRAF = requestAnimationFrame(tick);
      } else {
        waveRAF = null;
      }
    } else if (!audioPlayer.paused && !audioPlayer.ended) {
      waveRAF = requestAnimationFrame(tick);
    } else {
      waveRAF = null;
    }
  };
  if (waveRAF) cancelAnimationFrame(waveRAF);
  waveRAF = requestAnimationFrame(tick);
}

async function drawWaveformFromBase64(base64: string, token = waveformBuildToken): Promise<void> {
  try {
    const buf = await base64ToBytesAsync(base64);
    if (token !== waveformBuildToken) return;
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const numChannels = dv.getUint16(22, true);
    const dataOffset = 44;
    const totalSamples = Math.floor((buf.length - dataOffset) / 2 / numChannels);
    const samples = new Float32Array(Math.min(totalSamples, 48000 * 120));
    for (let i = 0; i < samples.length; i++) {
      const offset = dataOffset + i * numChannels * 2;
      if (offset + 1 >= buf.length) break;
      samples[i] = dv.getInt16(offset, true) / 32768.0;
      if ((i & 0x3fff) === 0) {
        await nextFrame();
        if (token !== waveformBuildToken) return;
      }
    }
    waveformSamples = samples;
    drawWaveform();
  } catch {
    // ignore decode errors
  }
}

function drawWaveform(): void {
  const canvas = el<HTMLCanvasElement>("#waveform-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d")!;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.floor(width * dpr)) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = cssVar("--bg-inner", "#0d1013");
  ctx.fillRect(0, 0, width, height);
  if (!waveformSamples) return;

  const accent = cssVar("--accent", "#25b8ab");
  const muted = cssVar("--text-muted", "#9ea8b3");
  const barGap = 2;
  const barMinW = 3;
  const barCount = Math.max(60, Math.min(300, Math.floor(width / (barMinW + barGap))));
  const barW = (width - barCount * barGap) / barCount;
  const step = Math.max(1, Math.floor(waveformSamples.length / barCount));
  const mid = height / 2;

  const currentTime = liveStream ? liveStreamCurrentTime() : audioPlayer.currentTime;
  const duration = liveStream ? liveStreamFinalDuration() : audioPlayer.duration;
  const progress = duration > 0 ? currentTime / duration : 0;
  const playheadX = progress * width;

  for (let i = 0; i < barCount; i++) {
    let sum = 0;
    for (let j = 0; j < step; j++) {
      const idx = i * step + j;
      if (idx >= waveformSamples.length) break;
      sum += waveformSamples[idx] ** 2;
    }
    const rms = Math.sqrt(sum / step);
    const barH = Math.max(2, rms * height * 2.5);
    const x = i * (barW + barGap);
    ctx.fillStyle = x + barW / 2 <= playheadX ? accent : muted + "50";
    ctx.fillRect(x, mid - barH / 2, barW, barH);
  }

  // Playhead line
  if (progress > 0 && progress < 1) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
  }
}

function setSaveFormat(format: SaveFormat): void {
  selectedSaveFormat = format === "mp3" ? "mp3" : "wav";
  localStorage.setItem("higgsAudio.saveFormat", selectedSaveFormat);
  for (const btn of document.querySelectorAll<HTMLButtonElement>(".save-format")) {
    const active = btn.dataset.format === selectedSaveFormat;
    btn.classList.toggle("active", active);
    btn.textContent = `${active ? "✓ " : ""}${(btn.dataset.format || "wav").toUpperCase()}`;
  }
}

function initAudioPlayer(): void {
  const playBtn = el<HTMLButtonElement>("#play-btn");

  const volumeSlider = el<HTMLInputElement>("#output-volume");
  const volumeIcon = document.querySelector<HTMLElement>("#output-volume-icon");
  const applyVolume = (value: number): void => {
    outputVolume = Math.min(1, Math.max(0, value));
    audioPlayer.volume = outputVolume;
    if (volumeIcon) {
      volumeIcon.textContent = outputVolume === 0 ? "🔇" : outputVolume < 0.5 ? "🔉" : "🔊";
    }
  };
  volumeSlider.value = String(Math.round(outputVolume * 100));
  applyVolume(outputVolume);
  volumeSlider.addEventListener("input", () => {
    applyVolume(Number(volumeSlider.value) / 100);
    localStorage.setItem(OUTPUT_VOLUME_STORAGE_KEY, String(outputVolume));
  });

  playBtn.addEventListener("click", async () => {
    if (liveStream) {
      if (liveStream.playing) {
        liveStream.playing = false;
        playBtn.textContent = "▶";
        if (waveRAF) { cancelAnimationFrame(waveRAF); waveRAF = null; }
        updateOutputTimeLabel();
        drawWaveform();
        if (liveStream.finalized && liveStream.finalObjectUrl) completeLiveStreamToFinalPlayer(false);
      } else {
        if (liveStream.finalized && liveStream.finalObjectUrl) {
          completeLiveStreamToFinalPlayer(true);
          return;
        }
        await liveStream.context.resume().catch(() => {});
        liveStream.playing = true;
        playBtn.textContent = "⏸";
        startWaveLoop();
      }
      return;
    }
    if (audioPlayer.paused) {
      if (audioPlayer.duration > 0 && audioPlayer.currentTime >= audioPlayer.duration - 0.05) {
        audioPlayer.currentTime = 0;
      }
      await audioPlayer.play().catch(() => {});
      playBtn.textContent = "⏸";
      startWaveLoop();
    } else {
      audioPlayer.pause();
      playBtn.textContent = "▶";
      if (waveRAF) { cancelAnimationFrame(waveRAF); waveRAF = null; }
      drawWaveform();
    }
  });

  // Click/drag-to-seek on waveform, including while streaming.
  const canvas = el<HTMLCanvasElement>("#waveform-canvas");
  canvas.style.cursor = "pointer";
  const seekFromPointer = (e: PointerEvent | MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (liveStream) {
      seekLiveStream(pct * liveStreamFinalDuration());
      if (liveStream.playing) startWaveLoop();
      return;
    }
    if (!audioPlayer.duration) return;
    audioPlayer.currentTime = pct * audioPlayer.duration;
    drawWaveform();
    if (!audioPlayer.paused) startWaveLoop();
  };
  let outputWaveDragging = false;
  canvas.addEventListener("pointerdown", (e) => {
    outputWaveDragging = true;
    canvas.setPointerCapture(e.pointerId);
    seekFromPointer(e);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (outputWaveDragging) seekFromPointer(e);
  });
  canvas.addEventListener("pointerup", (e) => {
    outputWaveDragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  });
  canvas.addEventListener("pointercancel", () => {
    outputWaveDragging = false;
  });

  setSaveFormat(selectedSaveFormat);
  for (const btn of document.querySelectorAll<HTMLButtonElement>(".save-format")) {
    btn.addEventListener("click", () => setSaveFormat((btn.dataset.format as SaveFormat) || "wav"));
  }

  el("#download-output-btn").addEventListener("click", async () => {
    if (!lastResult) return;
    const format = selectedSaveFormat;
    try {
      const path = await save({
        defaultPath: `higgs_output_${Date.now()}.${format}`,
        filters: [
          format === "wav"
            ? { name: "WAV Audio", extensions: ["wav"] }
            : { name: "MP3 Audio", extensions: ["mp3"] },
        ],
      });
      if (path) {
        const base64Audio = format === "wav"
          ? lastResult.wavBase64
          : bytesToBase64(await encodeMp3FromWav(lastResult.wavBase64));
        await invoke("save_binary_file", { path, base64Data: base64Audio });
        showToast(`Saved ${format.toUpperCase()} file`);
      }
    } catch (e) {
      showToast(`Save failed: ${e}`, "error");
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Generation history
// ═══════════════════════════════════════════════════════════════════════════

function addHistory(mode: Mode, label: string, result: GenerationResult): void {
  const entry: HistoryEntry = {
    id: `gen_${Date.now()}`,
    mode,
    label,
    timestamp: Date.now(),
    wavBase64: result.wavBase64,
    sampleRate: result.sampleRate,
    channels: result.channels,
  };
  history.unshift(entry);
  if (history.length > 30) history.length = 30; // keep last 30 (fragments for Montage)
  renderHistory();
}

function renderHistory(): void {
  const list = el<HTMLElement>("#recent-list");
  if (history.length === 0) {
    list.innerHTML = `<p class="empty-state">${t("No generations yet")}</p>`;
    el<HTMLElement>("#history-clear-all").classList.add("hidden");
    return;
  }
  el<HTMLElement>("#history-clear-all").classList.remove("hidden");
  list.innerHTML = "";
  for (const entry of history) {
    const item = document.createElement("div");
    item.className = "recent-item";
    const time = new Date(entry.timestamp).toLocaleTimeString();
    item.innerHTML = `<span class="recent-mode">${entry.mode}</span><span class="recent-label">${escapeHtml(entry.label)}</span><span class="recent-time">${time}</span><button class="recent-montage compact-button" data-id="${entry.id}" type="button" title="${escapeHtml(t("Add to the Montage tab"))}">${escapeHtml(t("+ To montage"))}</button><button class="recent-delete" data-id="${entry.id}" title="Delete">✕</button>`;
    item.querySelector<HTMLButtonElement>(".recent-montage")!.addEventListener("click", (e) => {
      e.stopPropagation();
      addMontageClip(entry.label, historyEntryResult(entry), "history");
    });

    // Click on the item (not the delete button) plays it
    item.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("recent-delete")) return;
      // Stop current playback
      if (!audioPlayer.paused) audioPlayer.pause();
      el<HTMLButtonElement>("#play-btn").textContent = "▶";
      // Load this entry
      const fakeResult: GenerationResult = {
        sampleRate: entry.sampleRate,
        channels: entry.channels,
        sampleCount: 0,
        wavBase64: entry.wavBase64,
      };
      // Switch to the entry's mode so it shows in the right tab
      switchMode(entry.mode as Mode);
      showOutput(fakeResult);
    });

    list.appendChild(item);
  }

  // Wire delete buttons
  for (const btn of list.querySelectorAll<HTMLButtonElement>(".recent-delete")) {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      history = history.filter((h) => h.id !== id);
      renderHistory();
    });
  }
  renderMontageHistorySelect();
}

// ═══════════════════════════════════════════════════════════════════════════
// Montage: fragments from History, results, scene lines or files, put in order
// and joined into one track, each with its own speed and pause after it.
// Kept in memory for the session; the joined track is saved to a file.
// ═══════════════════════════════════════════════════════════════════════════

type MontageClip = {
  id: string;
  label: string;
  result: GenerationResult;
  /** 1 = as recorded; the voice keeps its pitch. */
  speed: number;
  /** Silence after this fragment, in seconds. */
  pauseAfter: number;
};

const MONTAGE_NORMALIZE_STORAGE_KEY = "dramaStudio.montageNormalize";
let montageClips: MontageClip[] = [];
let montageResult: GenerationResult | null = null;
let montageAudioUrl = "";
let montageWave: WavePanel | null = null;
const montageClipPlayer = new Audio();
let montageClipPlayerUrl = "";
let montagePlayingId = "";
let montageJoining = false;

function historyEntryResult(entry: HistoryEntry): GenerationResult {
  const pcm = parseWavPcm(entry.wavBase64);
  return { sampleRate: pcm.sampleRate, channels: pcm.channels, sampleCount: pcm.samples.length, wavBase64: entry.wavBase64 };
}

function resultSeconds(result: GenerationResult): number {
  const pcm = parseWavPcm(result.wavBase64);
  return pcm.samples.length / pcm.channels / pcm.sampleRate;
}

function addMontageClip(label: string, result: GenerationResult, _source: string, silent = false): void {
  montageClips.push({
    id: nextId("clip"),
    label: label.trim() || t("Fragment"),
    result,
    speed: 1,
    pauseAfter: 0.4,
  });
  renderMontage();
  if (!silent) showToast(`${t("Added to montage")}: ${label.trim().slice(0, 40) || t("Fragment")}`);
}

function renderMontageHistorySelect(): void {
  const select = document.querySelector<HTMLSelectElement>("#montage-history-select");
  if (!select) return;
  const current = select.value;
  select.innerHTML = history.length === 0
    ? `<option value="">${escapeHtml(t("History is empty"))}</option>`
    : history
      .map((entry) => `<option value="${entry.id}">${escapeHtml(new Date(entry.timestamp).toLocaleTimeString())} · ${escapeHtml(entry.label.slice(0, 60))}</option>`)
      .join("");
  if (history.some((h) => h.id === current)) select.value = current;
  el<HTMLButtonElement>("#montage-add-history").disabled = history.length === 0;
}

function renderMontage(): void {
  scheduleProjectSave();
  const list = el<HTMLElement>("#montage-list");
  list.innerHTML = "";
  if (montageClips.length === 0) {
    list.innerHTML = `<p class="empty-state">${escapeHtml(t("No fragments yet: add them with the buttons above or “+ To montage” in History and under a result."))}</p>`;
  }
  montageClips.forEach((clip, index) => {
    const row = document.createElement("div");
    row.className = "montage-row";
    row.dataset.id = clip.id;
    const seconds = resultSeconds(clip.result) / clip.speed;
    row.innerHTML = `
      <span class="montage-index">${index + 1}</span>
      <button class="ref-play" data-action="play" type="button" aria-label="${escapeHtml(t("Play"))}">${montagePlayingId === clip.id ? "⏸" : "▶"}</button>
      <input class="text-input montage-label" data-field="label" type="text" />
      <span class="montage-duration">${seconds.toFixed(1)} ${escapeHtml(t("s"))}</span>
      <label class="montage-field" title="${escapeHtml(t("Speed: above 1 faster, below 1 slower; the voice keeps its pitch"))}">
        <span>${escapeHtml(t("Speed"))}</span>
        <input class="number-input" data-field="speed" type="number" min="0.5" max="2" step="0.05" />
      </label>
      <label class="montage-field" title="${escapeHtml(t("Silence after this fragment"))}">
        <span>${escapeHtml(t("Pause after"))}</span>
        <input class="number-input" data-field="pause" type="number" min="0" max="10" step="0.05" />
      </label>
      <span class="montage-actions">
        <button class="icon-button" data-action="edit" type="button" title="${escapeHtml(t("Cut pauses and pieces out of this fragment"))}">✂</button>
        <button class="icon-button" data-action="up" type="button" title="${escapeHtml(t("Move up"))}" ${index === 0 ? "disabled" : ""}>↑</button>
        <button class="icon-button" data-action="down" type="button" title="${escapeHtml(t("Move down"))}" ${index === montageClips.length - 1 ? "disabled" : ""}>↓</button>
        <button class="icon-button danger" data-action="remove" type="button" title="${escapeHtml(t("Delete"))}">✕</button>
      </span>
    `;
    row.querySelector<HTMLInputElement>('[data-field="label"]')!.value = clip.label;
    row.querySelector<HTMLInputElement>('[data-field="speed"]')!.value = String(clip.speed);
    row.querySelector<HTMLInputElement>('[data-field="pause"]')!.value = String(clip.pauseAfter);
    list.appendChild(row);
  });
  el("#montage-clear").classList.toggle("hidden", montageClips.length === 0);
  el<HTMLButtonElement>("#montage-join").disabled = montageClips.length === 0 || montageJoining;
}

/** A fragment's audio at the montage's rate and channels, with its speed applied. */
function montageClipPcm(clip: MontageClip, rate: number, channels: number): WavPcm {
  let pcm = parseWavPcm(clip.result.wavBase64);
  pcm = convertChannels(resamplePcm(pcm, rate), channels);
  return timeStretch(pcm, clip.speed);
}

async function playMontageClip(clip: MontageClip): Promise<void> {
  montageClipPlayer.pause();
  if (montagePlayingId === clip.id) {
    montagePlayingId = "";
    renderMontage();
    return;
  }
  const pcm = parseWavPcm(clip.result.wavBase64);
  const audio = clip.speed === 1 ? clip.result : pcmToResult(timeStretch(pcm, clip.speed));
  if (montageClipPlayerUrl) URL.revokeObjectURL(montageClipPlayerUrl);
  montageClipPlayerUrl = URL.createObjectURL(await base64ToBlobAsync(audio.wavBase64, "audio/wav"));
  montageClipPlayer.src = montageClipPlayerUrl;
  montageClipPlayer.volume = audioPlayer.volume;
  montagePlayingId = clip.id;
  montageClipPlayer.onended = () => {
    montagePlayingId = "";
    renderMontage();
  };
  renderMontage();
  await montageClipPlayer.play().catch(() => {
    montagePlayingId = "";
    renderMontage();
  });
}

function showMontageResult(result: GenerationResult): void {
  montageResult = result;
  const audio = el<HTMLAudioElement>("#montage-audio");
  void base64ToBlobAsync(result.wavBase64, "audio/wav").then((blob) => {
    if (montageAudioUrl) URL.revokeObjectURL(montageAudioUrl);
    montageAudioUrl = URL.createObjectURL(blob);
    audio.src = montageAudioUrl;
    audio.load();
  });
  const seconds = resultSeconds(result);
  el("#montage-output-info").textContent = `${formatTime(seconds)} · ${result.sampleRate} ${t("Hz")}`;
  el("#montage-output").classList.remove("hidden");
  montageWave?.show(result);
}

async function joinMontage(): Promise<void> {
  if (montageClips.length === 0 || montageJoining) return;
  montageJoining = true;
  const button = el<HTMLButtonElement>("#montage-join");
  button.disabled = true;
  button.textContent = t("Joining…");
  try {
    // Let the button repaint before the work.
    await nextFrame();
    const normalize = el<HTMLInputElement>("#montage-normalize").checked;
    const decoded = montageClips.map((clip) => parseWavPcm(clip.result.wavBase64));
    const rate = Math.max(...decoded.map((p) => p.sampleRate));
    const channels = Math.max(...decoded.map((p) => p.channels));
    const pieces: WavPcm[] = [];
    for (const clip of montageClips) {
      let source = clip;
      if (normalize) {
        // Same loudness for every fragment (EBU R128, −20 LUFS), as Multi Speaker does.
        const leveled = await normalizeResultLoudness(clip.result);
        source = { ...clip, result: leveled };
      }
      pieces.push(montageClipPcm(source, rate, channels));
    }
    const pauses = montageClips.map((clip, i) => (i < montageClips.length - 1 ? Math.round(clip.pauseAfter * rate) : 0));
    const total = pieces.reduce((sum, p, i) => sum + p.samples.length + pauses[i] * channels, 0);
    const samples = new Int16Array(total);
    let offset = 0;
    pieces.forEach((piece, i) => {
      samples.set(piece.samples, offset);
      offset += piece.samples.length + pauses[i] * channels;
    });
    let joined: WavPcm = { sampleRate: rate, channels, samples };
    const speed = parseFloat(el<HTMLInputElement>("#montage-speed").value) || 1;
    joined = timeStretch(joined, speed);
    showMontageResult(pcmToResult(joined));
    showToast(`${t("Joined")}: ${montageClips.length} ${t("fragments")}`);
  } catch (e) {
    showToast(`${t("Could not join")}: ${e}`, "error");
  } finally {
    montageJoining = false;
    button.textContent = t("⧉ Join");
    renderMontage();
  }
}

async function addMontageFiles(): Promise<void> {
  const selected = await open({
    multiple: true,
    filters: [{ name: "Audio", extensions: ["wav", "mp3", "flac", "m4a", "ogg", "aac", "opus"] }],
  });
  const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
  for (const path of paths) {
    try {
      const result = await invoke<GenerationResult>("read_audio_as_wav", { audioPath: path });
      addMontageClip(path.split(/[/\\]/).pop() || path, result, "file", true);
    } catch (e) {
      showToast(`${t("Could not read the recording")}: ${e}`, "error");
    }
  }
  if (paths.length > 0) showToast(`${t("Added to montage")}: ${paths.length}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Chapter: a long text cut into pieces, voiced one after another and checked
// (length limit, speed, words heard by Parakeet); a bad piece is redone with a
// new seed and the best take is kept. Pieces live for the session.
// ═══════════════════════════════════════════════════════════════════════════

type ChapterPieceStatus = "waiting" | "generating" | "ok" | "warn" | "bad";
type ChapterPieceState = ChapterPiece & {
  id: string;
  status: ChapterPieceStatus;
  reason: string;
  result: DramaGenerationResult | null;
  coverage: number | null;
  attempts: number;
  /** The text was edited after the take: it needs a new one. */
  stale: boolean;
  /** Why the take is out of date: its text, or the voice or manner it was read with. */
  staleWhy?: "text" | "voice";
  /** The voice and text (with the manner) the take was made with, to notice a change. */
  voicedWith?: string;
};
type ChapterSettings = {
  text: string;
  voice: string;
  useCharacters: boolean;
  maxChars: number;
  check: boolean;
  retries: number;
  pauseParagraph: number;
  pauseSentence: number;
  pauseDialogue: number;
  level: boolean;
  /** The narrator's manner in every piece it reads. */
  narratorStyle: string;
};

const CHAPTER_STORAGE_KEY = "dramaStudio.chapter";
let chapterPieces: ChapterPieceState[] = [];
/** The scene characters the pieces were cut with (their voices). */
let chapterCharacters: DramaCharacter[] = [];
let chapterRunning = false;
let chapterStopRequested = false;
let chapterResult: GenerationResult | null = null;

/** Chapters of the book (in a project). The active one lives in the Chapter tab; the others only on disk. */
type BookChapter = { id: string; title: string; text: string; characters: DramaCharacter[]; pieces: SavedPiece[]; joined: string | null };
let bookChapters: BookChapter[] = [];
let bookActive = 0;
let bookRunning = false;
let bookStopRequested = false;
let chapterAudioUrl = "";
let chapterWave: WavePanel | null = null;
const chapterPiecePlayer = new Audio();
let chapterPiecePlayerUrl = "";
let chapterPlayingId = "";

function setChapterText(text: string): void {
  el<HTMLTextAreaElement>("#chapter-text").value = text;
  saveChapterSettings();
}

/** The marking tools are shown when dialogue goes to the characters. */
function renderChapterCharacterTools(): void {
  el("#chapter-character-tools").classList.toggle("hidden", !el<HTMLInputElement>("#chapter-use-characters").checked);
}

/** The current scene character a piece was cut for (its voice may have changed since). */
function chapterCharacter(index: number): DramaCharacter | undefined {
  const snapshot = chapterCharacters[index];
  if (!snapshot) return undefined;
  return dramaScene.characters.find((c) => c.id === snapshot.id) ?? snapshot;
}

function readChapterSettings(): ChapterSettings {
  const num = (id: string, min: number, max: number, fallback: number) => {
    const v = parseFloat(el<HTMLInputElement>(id).value);
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  };
  return {
    text: el<HTMLTextAreaElement>("#chapter-text").value,
    voice: el<HTMLSelectElement>("#chapter-voice").value || "none",
    useCharacters: el<HTMLInputElement>("#chapter-use-characters").checked,
    maxChars: Math.round(num("#chapter-max-chars", 80, 1200, 400)),
    check: el<HTMLInputElement>("#chapter-check").checked,
    retries: Math.round(num("#chapter-retries", 0, 5, 2)),
    pauseParagraph: num("#chapter-pause-paragraph", 0, 5, 0.8),
    pauseSentence: num("#chapter-pause-sentence", 0, 3, 0.3),
    pauseDialogue: num("#chapter-pause-dialogue", 0, 3, 0.45),
    level: el<HTMLInputElement>("#chapter-level").checked,
    narratorStyle: el<HTMLInputElement>("#chapter-narrator-style").value,
  };
}

function saveChapterSettings(): void {
  try {
    localStorage.setItem(CHAPTER_STORAGE_KEY, JSON.stringify(readChapterSettings()));
  } catch {
    // A very long chapter may not fit: the settings are a convenience.
  }
  scheduleProjectSave();
}

/** Puts chapter settings into the form: from a project, or the last ones remembered. */
function loadChapterSettings(fromProject?: Partial<ChapterSettings>): void {
  let saved: Partial<ChapterSettings> = fromProject ?? {};
  if (!fromProject) {
    try {
      saved = JSON.parse(localStorage.getItem(CHAPTER_STORAGE_KEY) || "{}") || {};
    } catch {
      saved = {};
    }
  }
  if (fromProject && typeof saved.voice === "string") {
    const select = el<HTMLSelectElement>("#chapter-voice");
    select.dataset.saved = saved.voice;
    select.value = "";
    refreshChapterVoiceOptions();
  }
  if (typeof saved.text === "string") el<HTMLTextAreaElement>("#chapter-text").value = saved.text;
  if (typeof saved.useCharacters === "boolean") el<HTMLInputElement>("#chapter-use-characters").checked = saved.useCharacters;
  if (typeof saved.check === "boolean") el<HTMLInputElement>("#chapter-check").checked = saved.check;
  if (typeof saved.level === "boolean") el<HTMLInputElement>("#chapter-level").checked = saved.level;
  const setNum = (id: string, v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) el<HTMLInputElement>(id).value = String(v);
  };
  setNum("#chapter-max-chars", saved.maxChars);
  setNum("#chapter-retries", saved.retries);
  setNum("#chapter-pause-paragraph", saved.pauseParagraph);
  setNum("#chapter-pause-sentence", saved.pauseSentence);
  setNum("#chapter-pause-dialogue", saved.pauseDialogue);
  if (typeof saved.voice === "string") el<HTMLSelectElement>("#chapter-voice").dataset.saved = saved.voice;
  if (typeof saved.narratorStyle === "string") el<HTMLInputElement>("#chapter-narrator-style").value = saved.narratorStyle;
}

function refreshChapterVoiceOptions(): void {
  const select = document.querySelector<HTMLSelectElement>("#chapter-voice");
  if (!select) return;
  const current = select.value || select.dataset.saved || "none";
  const names = dramaVoiceNames().filter((n) => !isHiddenVoice(n));
  if (!names.includes(current)) names.push(current);
  select.innerHTML = names
    .map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n === "none" ? t("none (the model chooses)") : n)}</option>`)
    .join("");
  select.value = current;
}

function chapterPieceSpeaker(piece: ChapterPieceState): string {
  return piece.character >= 0 ? chapterCharacter(piece.character)?.name || "?" : "";
}

/** Who can read a piece: the chapter's narrator voice, or a character (not the scene's narrator). */
function chapterSpeakerOptions(current: number): string {
  const narrator = findNarrator(chapterCharacters);
  const options = [`<option value="-1">${escapeHtml(t("Narrator (chapter voice)"))}</option>`];
  chapterCharacters.forEach((snapshot, index) => {
    if (index === narrator) return;
    const name = chapterCharacter(index)?.name || snapshot.name;
    options.push(`<option value="${index}"${index === current ? " selected" : ""}>${index}. ${escapeHtml(name)}</option>`);
  });
  return options.join("");
}

/** The voice and text (with the manner) a piece should be read with. */
function chapterPieceWanted(piece: ChapterPieceState): { text: string; voice: string; who: string } {
  if (piece.character >= 0) {
    const character = chapterCharacter(piece.character);
    return { text: `${characterLineHint(character)}${piece.text}`, voice: character?.voice || "none", who: character?.name || "" };
  }
  const settings = readChapterSettings();
  // The narrator's manner: the chapter's own, else the scene narrator's.
  const sceneNarrator = dramaScene.characters[findNarrator(dramaScene.characters)];
  const style = settings.narratorStyle.trim() ? { style: settings.narratorStyle } : sceneNarrator;
  return { text: `${characterStyleHint(style)}${piece.text}`, voice: settings.voice, who: "" };
}

function chapterPieceSignature(piece: ChapterPieceState): string {
  const wanted = chapterPieceWanted(piece);
  return `${wanted.voice}\n${wanted.text}`;
}

/** The voice and text a piece is generated with. */
function chapterPieceRequest(piece: ChapterPieceState): { text: string; voice: string } {
  const loaded = new Set(dramaStatus.modelInfo?.voices.map((v) => v.name) || []);
  const { text, voice, who } = chapterPieceWanted(piece);
  if (voice !== "none" && !loaded.has(voice)) {
    throw new Error(`${t("Voice not found")}: ${voice}${who ? ` (${who})` : ""}`);
  }
  return { text, voice };
}

/** Marks voiced pieces whose voice or manner changed since the take (narrator or characters). */
function markChangedChapterPieces(): boolean {
  let changed = false;
  for (const piece of chapterPieces) {
    if (!piece.result || piece.stale || piece.voicedWith === undefined) continue;
    if (chapterPieceSignature(piece) !== piece.voicedWith) {
      piece.stale = true;
      piece.staleWhy = "voice";
      changed = true;
    }
  }
  if (changed) chapterResult = null;
  return changed;
}

/** After a change of a voice or manner: marks the pieces it touches and shows them. */
function chapterVoicesChanged(): void {
  if (markChangedChapterPieces() && !chapterRunning) renderChapterPieces();
}

const CHAPTER_STATUS_LABEL: Record<ChapterPieceStatus, string> = {
  waiting: "Waiting",
  generating: "Generating…",
  ok: "OK",
  warn: "Check",
  bad: "Bad",
};

function renderChapterPieces(): void {
  scheduleProjectSave();
  const list = el<HTMLElement>("#chapter-pieces");
  list.innerHTML = "";
  chapterPieces.forEach((piece, index) => {
    const row = document.createElement("div");
    row.className = `chapter-piece ${piece.status}${piece.stale ? " stale" : ""}`;
    row.dataset.id = piece.id;
    const speaker = chapterPieceSpeaker(piece);
    const meta: string[] = [];
    if (piece.result) meta.push(`${piece.result.seconds.toFixed(1)} ${t("s")}`);
    if (piece.coverage !== null) meta.push(`${t("words")} ${Math.round(piece.coverage * 100)}%`);
    if (piece.attempts > 1) meta.push(`${t("takes")}: ${piece.attempts}`);
    row.innerHTML = `
      <div class="chapter-piece-head">
        <span class="chapter-piece-index">${index + 1}</span>
        <span class="chapter-piece-status">${escapeHtml(t(CHAPTER_STATUS_LABEL[piece.status]))}</span>
        ${chapterCharacters.length > 0
          ? `<select class="select-input chapter-piece-speaker-select" data-field="speaker" style="--speaker-color:${piece.character >= 0 ? sceneColor(piece.character) : "var(--text-secondary)"}">${chapterSpeakerOptions(piece.character)}</select>`
          : speaker ? `<strong class="chapter-piece-speaker" style="color:${sceneColor(piece.character)}">${escapeHtml(speaker)}</strong>` : ""}
        <span class="chapter-piece-meta">${escapeHtml(meta.join(" · "))}</span>
        <span class="chapter-piece-actions">
          <button class="ref-play" data-action="play" type="button" ${piece.result ? "" : "disabled"} aria-label="${escapeHtml(t("Play"))}">${chapterPlayingId === piece.id ? "⏸" : "▶"}</button>
          <button class="compact-button" data-action="edit" type="button" ${piece.result ? "" : "disabled"} title="${escapeHtml(t("Cut pauses and pieces out of this line"))}">✂</button>
          <button class="compact-button" data-action="variants" type="button" ${chapterRunning ? "disabled" : ""} title="${escapeHtml(t("Three takes with different seeds: listen and keep the best"))}">3×</button>
          <button class="compact-button" data-action="redo" type="button" ${chapterRunning ? "disabled" : ""}>${escapeHtml(t("↻ Redo"))}</button>
        </span>
      </div>
      <textarea class="text-area chapter-piece-text" data-field="text" rows="2" spellcheck="false"></textarea>
      ${piece.reason || piece.stale ? `<p class="chapter-piece-reason"></p>` : ""}
    `;
    row.querySelector<HTMLTextAreaElement>(".chapter-piece-text")!.value = piece.text;
    const reason = row.querySelector<HTMLElement>(".chapter-piece-reason");
    if (reason) {
      reason.textContent = !piece.stale
        ? piece.reason
        : piece.staleWhy === "voice" ? t("The voice or manner changed: redo this piece") : t("The text was changed: redo this piece");
    }
    list.appendChild(row);
  });
  const done = chapterPieces.filter((p) => p.result).length;
  const marked = chapterPieces.filter((p) => p.status === "bad" || p.status === "warn" || p.stale).length;
  el("#chapter-join-row").classList.toggle("hidden", done === 0);
  el("#chapter-redo-bad").classList.toggle("hidden", marked === 0 || chapterRunning);
  el<HTMLButtonElement>("#chapter-redo-bad").textContent = `${t("↻ Redo the marked pieces")} (${marked})`;
  el<HTMLButtonElement>("#chapter-run").classList.toggle("hidden", chapterRunning);
  el<HTMLButtonElement>("#chapter-stop").classList.toggle("hidden", !chapterRunning);
  el<HTMLButtonElement>("#chapter-split").disabled = chapterRunning;
  if (document.querySelector("#book-chapter")) renderBook();
  const seconds = chapterPieces.reduce((sum, p) => sum + (p.result?.seconds || 0), 0);
  el("#chapter-status").textContent = chapterPieces.length > 0
    ? `${done}/${chapterPieces.length} ${t("pieces")} · ${formatTime(seconds)}${marked > 0 ? ` · ${t("to check")}: ${marked}` : ""}`
    : "";
}

function splitChapterIntoPieces(): boolean {
  const settings = readChapterSettings();
  if (!settings.text.trim()) {
    showToast(t("Paste the chapter text first"), "warning");
    return false;
  }
  chapterCharacters = settings.useCharacters ? dramaScene.characters.map((c) => ({ ...c })) : [];
  if (settings.useCharacters && chapterCharacters.length === 0) {
    showToast(t("Add characters in the Multi Speaker tab first, or turn off dialogue in the characters' voices"), "warning");
    return false;
  }
  const pieces = splitChapter(settings.text, settings.maxChars, settings.useCharacters ? chapterCharacters : null);
  chapterPieces = pieces.map((piece) => ({
    ...piece,
    id: nextId("piece"),
    status: "waiting",
    reason: "",
    result: null,
    coverage: null,
    attempts: 0,
    stale: false,
  }));
  chapterResult = null;
  el("#chapter-output").classList.add("hidden");
  saveChapterSettings();
  renderChapterPieces();
  showToast(`${t("Cut into pieces")}: ${chapterPieces.length}`);
  return true;
}

type ChapterCheck = { status: "ok" | "warn" | "bad"; reason: string; coverage: number | null; score: number };

/** Checks a take of a piece: the length limit, a believable speed, and the words heard. */
function checkChapterTake(piece: ChapterPieceState, take: DramaGenerationResult, recognise: boolean): Promise<ChapterCheck> {
  return checkTake(piece.text, take, recognise, `chapter_${piece.id}.wav`);
}

/** Checks a take of `text` (tags and speaker marks are ignored): length limit, speed, words heard. */
async function checkTake(text: string, take: DramaGenerationResult, recognise: boolean, fileName: string): Promise<ChapterCheck> {
  const problems: string[] = [];
  let status: ChapterCheck["status"] = "ok";
  if (take.stop === "max_seconds") {
    status = "bad";
    problems.push(t("hit the length limit: the end is missing"));
  }
  const spoken = applyDictionary(text, dictionary);
  const cps = charsPerSecond(spoken, take.seconds);
  const speakable = Math.round(cps * take.seconds);
  // A short reply ("Нет.") takes a second whatever its few letters: allow 2 s on top.
  if (take.seconds > 2 + speakable / 6) {
    status = "bad";
    problems.push(t("too long for its text: silences or repeats"));
  } else if (speakable >= 20 && cps > 32) {
    status = "bad";
    problems.push(t("too short for its text: words skipped"));
  }
  // Recognition of one or two words is unreliable: it may only ask for a check.
  const fewWords = comparableWords(spoken).length <= 2;
  let coverage: number | null = null;
  if (recognise) {
    try {
      const path = await invoke<string>("drama_temp_path", { name: fileName });
      await invoke("save_binary_file", { path, base64Data: take.wavBase64 });
      const heard = await tryAutoTranscribeSilently(path);
      if (heard) {
        const check = wordCoverage(spoken, heard);
        coverage = check.coverage;
        if (check.coverage < 0.8 && !fewWords) {
          status = "bad";
          problems.push(`${t("words missing")}: ${check.missing.slice(0, 8).join(", ")}`);
        } else if (check.coverage < 0.93 && status === "ok") {
          status = "warn";
          problems.push(`${t("maybe missing")}: ${check.missing.slice(0, 8).join(", ")}`);
        }
      }
    } catch {
      // Recognition is a help: without it the piece is judged by the rest.
    }
  }
  const speedPenalty = cps > 0 ? Math.min(1, Math.abs(Math.log(cps / 14)) / 2) : 1;
  const score = (coverage ?? 1) - speedPenalty * 0.5 - (status === "bad" ? 1 : 0);
  return { status, reason: problems.join("; "), coverage, score };
}

/** Voices one piece, retrying a bad take with new seeds; keeps the best take. */
async function voiceChapterPiece(piece: ChapterPieceState): Promise<void> {
  const settings = readChapterSettings();
  const recognise = settings.check && Boolean(localStorage.getItem("higgsAudio.whisperModel"));
  piece.status = "generating";
  piece.reason = "";
  renderChapterPieces();
  const { text, voice } = chapterPieceRequest(piece);
  let best: { take: DramaGenerationResult; check: ChapterCheck } | null = null;
  let attempts = 0;
  for (let attempt = 0; attempt <= settings.retries; attempt++) {
    if (chapterStopRequested) break;
    // The seed field counts for the first take only; retries need other seeds.
    const ui = readDramaOptionsFromUi();
    const options = dramaRequestOptions(attempt === 0 ? ui : { ...ui, seed: "" });
    const raw = await dramaGenerate({
      request: { text, voice, options, streamPlayback: false },
    });
    attempts += 1;
    const take = autoShortenPauses(raw);
    const check = await checkChapterTake(piece, take, recognise);
    if (!best || check.score > best.check.score) best = { take, check };
    if (check.status !== "bad") break;
  }
  if (!best) {
    piece.status = "waiting";
    renderChapterPieces();
    return;
  }
  piece.result = best.take;
  piece.status = best.check.status;
  piece.reason = best.check.reason;
  piece.coverage = best.check.coverage;
  piece.attempts = attempts;
  piece.stale = false;
  piece.staleWhy = undefined;
  piece.voicedWith = `${voice}\n${text}`;
  chapterResult = null;
  renderChapterPieces();
}

/** Voices the pieces that need it (all waiting ones, or the marked ones), in order. */
async function runChapter(onlyMarked = false, auto = false): Promise<void> {
  if (chapterRunning) return;
  if (!onlyMarked && !auto) await offerProjectBeforeLongRun();
  if (chapterPieces.length === 0 && !splitChapterIntoPieces()) return;
  if (!(await ensureDramaLoaded())) return;
  markChangedChapterPieces();
  let todo = chapterPieces.filter((p) =>
    onlyMarked ? p.status === "bad" || p.status === "warn" || p.stale : !p.result || p.stale,
  );
  if (todo.length === 0) {
    if (auto) return;
    if (onlyMarked) {
      showToast(t("All pieces are voiced"));
      renderChapterPieces();
      return;
    }
    const answer = await askChoice(t("All pieces are voiced"), t("Voice the whole chapter again? The present takes will be replaced."), [
      { value: "cancel", label: t("Cancel") },
      { value: "all", label: t("Voice everything again"), primary: true },
    ]);
    if (answer !== "all") return;
    todo = [...chapterPieces];
  }
  chapterRunning = true;
  chapterStopRequested = false;
  el("#chapter-progress").classList.remove("hidden");
  const started = performance.now();
  let failed = 0;
  try {
    for (let i = 0; i < todo.length; i++) {
      if (chapterStopRequested) break;
      setProgress("#chapter-progress-bar", i, todo.length);
      const elapsed = (performance.now() - started) / 1000;
      const left = i > 0 ? (elapsed / i) * (todo.length - i) : 0;
      el("#chapter-status").textContent = `${t("Piece")} ${i + 1}/${todo.length}${i > 0 ? ` · ${t("about")} ${formatTime(left)} ${t("left")}` : ""}`;
      try {
        await voiceChapterPiece(todo[i]);
      } catch (e) {
        if (chapterStopRequested || String(e).toLowerCase().includes("cancel")) {
          todo[i].status = todo[i].result ? todo[i].status : "waiting";
          break;
        }
        failed += 1;
        todo[i].status = "bad";
        todo[i].reason = String(e);
      }
      renderChapterPieces();
    }
    setProgress("#chapter-progress-bar", 1, 1);
  } finally {
    chapterRunning = false;
    el("#chapter-progress").classList.add("hidden");
    renderChapterPieces();
  }
  const marked = chapterPieces.filter((p) => p.status === "bad" || p.status === "warn").length;
  if (chapterStopRequested) showToast(t("Chapter stopped: press ▶ to go on"), "warning");
  else if (failed > 0 || marked > 0) showToast(`${t("Chapter voiced")} · ${t("to check")}: ${marked}`, "warning");
  else showToast(t("Chapter voiced"));
}

async function stopChapter(): Promise<void> {
  if (!chapterRunning) return;
  chapterStopRequested = true;
  await invoke("drama_cancel").catch(() => {});
}

/** How many takes "3×" makes. */
const VARIANT_COUNT = 3;

type TakeVariant = { take: DramaGenerationResult; check: ChapterCheck };

/** A window with the takes side by side; resolves with the chosen one, or -1. */
function chooseTakeVariant(title: string, variants: TakeVariant[], current: DramaGenerationResult | null): Promise<number> {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "modal-backdrop";
    const urls: string[] = [];
    modal.innerHTML = `
      <section class="modal-panel variants-panel">
        <div class="modal-head">
          <div>
            <h3></h3>
            <span class="api-status-text">${escapeHtml(t("Listen to the takes and keep the best one."))}</span>
          </div>
          <button class="popover-close" data-choice="-1" type="button" aria-label="Close">✕</button>
        </div>
        <div class="variants-list"></div>
        <div class="modal-actions">
          <button class="compact-button" data-choice="-1" type="button">${escapeHtml(current ? t("Keep the present take") : t("Cancel"))}</button>
        </div>
      </section>
    `;
    modal.querySelector("h3")!.textContent = title;
    const list = modal.querySelector<HTMLElement>(".variants-list")!;
    variants.forEach((variant, index) => {
      const row = document.createElement("div");
      row.className = `variant-row ${variant.check.status}`;
      const meta = [`${variant.take.seconds.toFixed(1)} ${t("s")}`, `seed ${variant.take.seed}`];
      if (variant.check.coverage !== null) meta.push(`${t("words")} ${Math.round(variant.check.coverage * 100)}%`);
      row.innerHTML = `
        <strong>${index + 1}</strong>
        <audio controls preload="auto"></audio>
        <span class="variant-meta"></span>
        <button class="compact-button primary" data-choice="${index}" type="button">${escapeHtml(t("Keep this one"))}</button>
      `;
      row.querySelector<HTMLElement>(".variant-meta")!.textContent = `${meta.join(" · ")}${variant.check.reason ? ` · ${variant.check.reason}` : ""}`;
      void base64ToBlobAsync(variant.take.wavBase64, "audio/wav").then((blob) => {
        const url = URL.createObjectURL(blob);
        urls.push(url);
        row.querySelector<HTMLAudioElement>("audio")!.src = url;
      });
      // One take plays at a time.
      row.querySelector<HTMLAudioElement>("audio")!.addEventListener("play", (event) => {
        for (const audio of list.querySelectorAll("audio")) if (audio !== event.target) audio.pause();
      });
      list.appendChild(row);
    });
    modal.addEventListener("click", (event) => {
      const choice = (event.target as HTMLElement).closest<HTMLElement>("[data-choice]")?.dataset.choice;
      if (choice === undefined && event.target !== modal) return;
      for (const audio of modal.querySelectorAll("audio")) audio.pause();
      for (const url of urls) URL.revokeObjectURL(url);
      modal.remove();
      resolve(choice === undefined ? -1 : Number(choice));
    });
    document.body.appendChild(modal);
  });
}

/** "3×": the piece voiced with three new seeds; the chosen take replaces the present one. */
async function chapterPieceVariants(piece: ChapterPieceState): Promise<void> {
  if (chapterRunning) return;
  if (!(await ensureDramaLoaded())) return;
  const settings = readChapterSettings();
  const recognise = settings.check && Boolean(localStorage.getItem("higgsAudio.whisperModel"));
  chapterRunning = true;
  chapterStopRequested = false;
  const before = piece.status;
  piece.status = "generating";
  renderChapterPieces();
  const variants: TakeVariant[] = [];
  try {
    const { text, voice } = chapterPieceRequest(piece);
    for (let i = 0; i < VARIANT_COUNT; i++) {
      if (chapterStopRequested) break;
      el("#chapter-status").textContent = `${t("Piece")} ${chapterPieces.indexOf(piece) + 1}: ${t("take")} ${i + 1}/${VARIANT_COUNT}`;
      const options = dramaRequestOptions({ ...readDramaOptionsFromUi(), seed: "" });
      const raw = await dramaGenerate({ request: { text, voice, options, streamPlayback: false } });
      const take = autoShortenPauses(raw);
      variants.push({ take, check: await checkChapterTake(piece, take, recognise) });
    }
  } catch (e) {
    showToast(`${t("Generation failed")}: ${e}`, "error");
  } finally {
    chapterRunning = false;
    piece.status = before;
    renderChapterPieces();
  }
  if (variants.length === 0) return;
  const chosen = await chooseTakeVariant(`${t("Piece")} ${chapterPieces.indexOf(piece) + 1}`, variants, piece.result);
  if (chosen < 0) return;
  const { take, check } = variants[chosen];
  const request = chapterPieceRequest(piece);
  piece.result = take;
  piece.status = check.status;
  piece.reason = check.reason;
  piece.coverage = check.coverage;
  piece.attempts = (piece.attempts || 0) + variants.length;
  piece.stale = false;
  piece.staleWhy = undefined;
  piece.voicedWith = `${request.voice}\n${request.text}`;
  chapterResult = null;
  renderChapterPieces();
}

async function redoChapterPiece(piece: ChapterPieceState): Promise<void> {
  if (chapterRunning) return;
  if (!(await ensureDramaLoaded())) return;
  chapterRunning = true;
  chapterStopRequested = false;
  try {
    await voiceChapterPiece(piece);
  } catch (e) {
    piece.status = "bad";
    piece.reason = String(e);
  } finally {
    chapterRunning = false;
    renderChapterPieces();
  }
}

function showChapterResult(result: GenerationResult): void {
  chapterResult = result;
  void base64ToBlobAsync(result.wavBase64, "audio/wav").then((blob) => {
    if (chapterAudioUrl) URL.revokeObjectURL(chapterAudioUrl);
    chapterAudioUrl = URL.createObjectURL(blob);
    const audio = el<HTMLAudioElement>("#chapter-audio");
    audio.src = chapterAudioUrl;
    audio.load();
  });
  el("#chapter-output-info").textContent = `${formatTime(resultSeconds(result))} · ${result.sampleRate} ${t("Hz")}`;
  el("#chapter-output").classList.remove("hidden");
  chapterWave?.show(result);
}

async function joinChapter(): Promise<void> {
  const missing = chapterPieces.filter((p) => !p.result).length;
  if (missing > 0) {
    showToast(`${t("Not all pieces are voiced")}: ${missing}`, "warning");
    return;
  }
  const settings = readChapterSettings();
  const button = el<HTMLButtonElement>("#chapter-join");
  button.disabled = true;
  try {
    await nextFrame();
    const takes: GenerationResult[] = [];
    for (const piece of chapterPieces) {
      takes.push(settings.level ? await levelSceneTake(piece.result!, true) : piece.result!);
    }
    const pcms = takes.map((take) => parseWavPcm(take.wavBase64));
    const rate = pcms[0].sampleRate;
    const channels = pcms[0].channels;
    const pauseAfter = chapterPieces.map((piece, i) => {
      if (i === chapterPieces.length - 1) return 0;
      const seconds = piece.kind === "dialogue" ? settings.pauseDialogue : piece.paragraphEnd ? settings.pauseParagraph : settings.pauseSentence;
      return Math.round(seconds * rate) * channels;
    });
    const total = pcms.reduce((sum, p, i) => sum + p.samples.length + pauseAfter[i], 0);
    const samples = new Int16Array(total);
    let offset = 0;
    pcms.forEach((pcm, i) => {
      samples.set(pcm.samples, offset);
      offset += pcm.samples.length + pauseAfter[i];
    });
    showChapterResult(pcmToResult({ sampleRate: rate, channels, samples }));
    showToast(t("Chapter joined"));
  } catch (e) {
    showToast(`${t("Could not join")}: ${e}`, "error");
  } finally {
    button.disabled = false;
  }
}

/** The list of ready-made manners shown under a "Manner" field (labels translated). */
function renderStylePresets(): void {
  let list = document.querySelector<HTMLDataListElement>("#drama-style-presets");
  if (!list) {
    list = document.createElement("datalist");
    list.id = "drama-style-presets";
    document.body.appendChild(list);
  }
  list.innerHTML = DRAMA_STYLE_PRESETS
    .map((preset) => `<option value="${escapeHtml(preset.tag)}" label="${escapeHtml(t(preset.label))}"></option>`)
    .join("");
}

function initChapter(): void {
  renderStylePresets();
  loadChapterSettings();
  refreshChapterVoiceOptions();
  for (const id of ["#chapter-text", "#chapter-voice", "#chapter-use-characters", "#chapter-max-chars", "#chapter-check", "#chapter-retries", "#chapter-pause-paragraph", "#chapter-pause-sentence", "#chapter-pause-dialogue", "#chapter-level", "#chapter-narrator-style"]) {
    el(id).addEventListener("change", saveChapterSettings);
  }
  renderChapterCharacterTools();
  el("#chapter-use-characters").addEventListener("change", renderChapterCharacterTools);
  for (const id of ["#chapter-voice", "#chapter-narrator-style"]) el(id).addEventListener("change", chapterVoicesChanged);
  el("#chapter-markup-book").addEventListener("click", () => markupSceneBookText(CHAPTER_TEXT_TARGET));
  el("#chapter-markup-undo").addEventListener("click", () => undoSceneMarkup(CHAPTER_TEXT_TARGET));
  el("#chapter-goto-characters").addEventListener("click", () => switchMode("multi"));
  speakerHotkeys(CHAPTER_TEXT_TARGET, () => el<HTMLInputElement>("#chapter-use-characters").checked);
  renderSceneSpeakerBar();
  el("#chapter-split").addEventListener("click", () => {
    if (chapterPieces.some((p) => p.result)) {
      void askChoice(t("Cut into pieces"), t("The voiced pieces will be dropped and the chapter cut again. Go on?"), [
        { value: "cancel", label: t("Cancel") },
        { value: "go", label: t("Cut again"), primary: true },
      ]).then((answer) => {
        if (answer === "go") splitChapterIntoPieces();
      });
    } else {
      splitChapterIntoPieces();
    }
  });
  el("#chapter-run").addEventListener("click", () => void runChapter(false));
  el("#chapter-redo-bad").addEventListener("click", () => void runChapter(true));
  el("#chapter-stop").addEventListener("click", () => void stopChapter());
  el("#chapter-join").addEventListener("click", () => void joinChapter());

  const list = el<HTMLElement>("#chapter-pieces");
  list.addEventListener("input", (event) => {
    const area = event.target as HTMLTextAreaElement;
    const piece = chapterPieces.find((p) => p.id === area.closest<HTMLElement>(".chapter-piece")?.dataset.id);
    // The speaker list sends "input" too: only the text field holds the text.
    if (!piece || area.dataset.field !== "text") return;
    piece.text = area.value;
    if (piece.result && !piece.stale) {
      piece.stale = true;
      piece.staleWhy = "text";
      const row = area.closest<HTMLElement>(".chapter-piece")!;
      row.classList.add("stale");
    }
  });
  list.addEventListener("change", (event) => {
    const select = event.target as HTMLSelectElement;
    if (select.dataset.field === "speaker") {
      const piece = chapterPieces.find((p) => p.id === select.closest<HTMLElement>(".chapter-piece")?.dataset.id);
      if (piece) {
        piece.character = Number(select.value);
        piece.kind = piece.character >= 0 ? "dialogue" : "narration";
        // The take was read by someone else.
        if (piece.result) {
          piece.stale = true;
          piece.staleWhy = "voice";
        }
        chapterResult = null;
      }
    }
    renderChapterPieces();
  });
  list.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-action]");
    if (!button) return;
    const piece = chapterPieces.find((p) => p.id === button.closest<HTMLElement>(".chapter-piece")?.dataset.id);
    if (!piece) return;
    if (button.dataset.action === "variants") {
      void chapterPieceVariants(piece);
    } else if (button.dataset.action === "redo") {
      void redoChapterPiece(piece);
    } else if (button.dataset.action === "edit" && piece.result) {
      editAudio(`${t("Piece")} ${chapterPieces.indexOf(piece) + 1}`, piece.result.wavBase64, (edited) => {
        const seconds = edited.sampleCount / edited.channels / edited.sampleRate;
        piece.result = { ...piece.result!, ...edited, seconds };
        chapterResult = null;
        renderChapterPieces();
      });
    } else if (button.dataset.action === "play" && piece.result) {
      chapterPiecePlayer.pause();
      if (chapterPlayingId === piece.id) {
        chapterPlayingId = "";
        renderChapterPieces();
        return;
      }
      if (chapterPiecePlayerUrl) URL.revokeObjectURL(chapterPiecePlayerUrl);
      chapterPiecePlayerUrl = URL.createObjectURL(await base64ToBlobAsync(piece.result.wavBase64, "audio/wav"));
      chapterPiecePlayer.src = chapterPiecePlayerUrl;
      chapterPiecePlayer.volume = audioPlayer.volume;
      chapterPlayingId = piece.id;
      chapterPiecePlayer.onended = () => {
        chapterPlayingId = "";
        renderChapterPieces();
      };
      renderChapterPieces();
      await chapterPiecePlayer.play().catch(() => {
        chapterPlayingId = "";
        renderChapterPieces();
      });
    }
  });

  chapterWave = makeWavePanel("#chapter-audio", showChapterResult);
  el("#chapter-edit").addEventListener("click", () => {
    if (chapterResult) editAudio(t("Chapter"), chapterResult.wavBase64, (edited) => showChapterResult(edited));
  });
  el("#chapter-save-wav").addEventListener("click", () => {
    if (chapterResult) void saveResultToFile(chapterResult, "chapter", "wav");
  });
  el("#chapter-save-mp3").addEventListener("click", () => {
    if (chapterResult) void saveResultToFile(chapterResult, "chapter", "mp3");
  });
  el("#chapter-to-montage").addEventListener("click", () => {
    if (chapterResult) addMontageClip(t("Chapter"), chapterResult, "chapter");
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Book: the chapters of a project. The active chapter is the Chapter tab; the
// others are kept on disk only (a book does not fit in memory). "Voice the book"
// cuts, voices (with checks) and joins every chapter in turn.
// ═══════════════════════════════════════════════════════════════════════════

function newBookChapter(title: string, text = ""): BookChapter {
  return { id: nextId("ch"), title, text, characters: [], pieces: [], joined: null };
}

/** There is always a chapter: the one in the Chapter tab. */
function ensureBook(): void {
  if (bookChapters.length > 0) return;
  bookChapters = [newBookChapter(`${t("Chapter")} 1`, el<HTMLTextAreaElement>("#chapter-text").value)];
  bookActive = 0;
}

/** Saves now, after a save already running. */
async function saveProjectNow(): Promise<void> {
  while (projectSaving) await new Promise((r) => setTimeout(r, 100));
  await saveProject();
}

function bookChapterInfo(index: number): { done: number; total: number; seconds: number } {
  if (index === bookActive) {
    return {
      done: chapterPieces.filter((p) => p.result).length,
      total: chapterPieces.length,
      seconds: chapterPieces.reduce((sum, p) => sum + (p.result?.seconds || 0), 0),
    };
  }
  const pieces = bookChapters[index].pieces;
  return {
    done: pieces.filter((p) => p.take).length,
    total: pieces.length,
    seconds: pieces.reduce((sum, p) => sum + (p.take?.seconds || 0), 0),
  };
}

function renderBook(): void {
  ensureBook();
  const select = el<HTMLSelectElement>("#book-chapter");
  select.innerHTML = bookChapters.map((chapter, index) => {
    const info = bookChapterInfo(index);
    const state = info.total === 0 ? t("not cut") : `${info.done}/${info.total}${info.done > 0 ? ` · ${formatTime(info.seconds)}` : ""}`;
    return `<option value="${index}">${index + 1}. ${escapeHtml(chapter.title)} — ${escapeHtml(state)}</option>`;
  }).join("");
  select.value = String(bookActive);
  const inProject = Boolean(currentProject);
  const busy = chapterRunning || bookRunning;
  select.disabled = !inProject || busy;
  for (const id of ["#book-add", "#book-rename", "#book-split", "#book-m4b"]) el<HTMLButtonElement>(id).disabled = !inProject || busy;
  el<HTMLButtonElement>("#book-remove").disabled = !inProject || busy || bookChapters.length < 2;
  el<HTMLButtonElement>("#book-run").disabled = !inProject || (chapterRunning && !bookRunning);
  el<HTMLButtonElement>("#book-run").textContent = bookRunning ? t("⏹ Stop the book") : t("▶ Voice the book");
  el("#book-hint").textContent = inProject
    ? `${t("Chapters in the book")}: ${bookChapters.length}`
    : t("A book of several chapters works in a project: create or open one on the left.");
}

/** Makes chapter `index` the one in the Chapter tab; the present one is saved to disk first. */
async function activateBookChapter(index: number): Promise<boolean> {
  if (!currentProject || index < 0 || index >= bookChapters.length) return false;
  if (index === bookActive) return true;
  await saveProjectNow();
  const chapter = bookChapters[index];
  projectLoading = true;
  try {
    bookActive = index;
    el<HTMLTextAreaElement>("#chapter-text").value = chapter.text;
    chapterCharacters = chapter.characters || [];
    const missing = await loadSavedChapter(chapter.pieces, chapter.joined);
    if (missing > 0) showToast(`${t("Audio files not found")}: ${missing}`, "warning");
  } finally {
    projectLoading = false;
  }
  renderChapterCharacterTools();
  renderBook();
  scheduleProjectSave();
  return true;
}

async function addBookChapter(): Promise<void> {
  if (!currentProject) return;
  await saveProjectNow();
  bookChapters.push(newBookChapter(`${t("Chapter")} ${bookChapters.length + 1}`));
  await activateBookChapter(bookChapters.length - 1);
  el<HTMLTextAreaElement>("#chapter-text").focus();
}

async function renameBookChapter(): Promise<void> {
  const chapter = bookChapters[bookActive];
  const name = await askText(t("Rename the chapter"), t("Chapter title:"), chapter.title);
  if (!name) return;
  chapter.title = name;
  renderBook();
  scheduleProjectSave();
}

async function removeBookChapter(): Promise<void> {
  if (bookChapters.length < 2) return;
  const chapter = bookChapters[bookActive];
  const answer = await askChoice(t("Remove the chapter"), `${t("Remove")} «${chapter.title}» ${t("from the book, with its voiced pieces?")}`, [
    { value: "cancel", label: t("Cancel") },
    { value: "remove", label: t("Remove"), primary: true },
  ]);
  if (answer !== "remove") return;
  const removed = bookActive;
  const next = removed > 0 ? removed - 1 : 0;
  const target = bookChapters[removed === 0 ? 1 : next];
  bookChapters.splice(removed, 1);
  // The removed chapter is not saved back: load its neighbour directly.
  bookActive = bookChapters.indexOf(target);
  projectLoading = true;
  try {
    el<HTMLTextAreaElement>("#chapter-text").value = target.text;
    chapterCharacters = target.characters || [];
    await loadSavedChapter(target.pieces, target.joined);
  } finally {
    projectLoading = false;
  }
  renderChapterCharacterTools();
  renderBook();
  await saveProjectNow();
}

/** The whole book pasted into the chapter text → one chapter per heading. */
async function splitBookIntoChapters(): Promise<void> {
  const parts = splitBookText(el<HTMLTextAreaElement>("#chapter-text").value, t("Beginning"));
  if (parts.length < 2) {
    showToast(t("No chapter headings found: lines like «Глава 1», «Пролог», «Эпилог»"), "warning");
    return;
  }
  const list = parts.slice(0, 12).map((p) => p.title).join(", ") + (parts.length > 12 ? "…" : "");
  const answer = await askChoice(
    t("Split the book into chapters"),
    `${t("Chapters found")}: ${parts.length} (${list}). ${t("The text in the box becomes the first of them, the others are added after it.")}`,
    [
      { value: "cancel", label: t("Cancel") },
      { value: "split", label: t("Split"), primary: true },
    ],
  );
  if (answer !== "split") return;
  const active = bookChapters[bookActive];
  active.title = parts[0].title;
  el<HTMLTextAreaElement>("#chapter-text").value = parts[0].text;
  chapterPieces = [];
  chapterResult = null;
  el("#chapter-output").classList.add("hidden");
  renderChapterPieces();
  saveChapterSettings();
  bookChapters.splice(bookActive + 1, 0, ...parts.slice(1).map((p) => newBookChapter(p.title, p.text)));
  renderBook();
  await saveProjectNow();
  showToast(`${t("Chapters in the book")}: ${bookChapters.length}`);
}

/** Every chapter in turn: cut if needed, voice what is missing (with checks), join. */
async function runBook(): Promise<void> {
  if (bookRunning) {
    bookStopRequested = true;
    await stopChapter();
    return;
  }
  if (!currentProject) {
    await offerProjectBeforeLongRun();
    if (!currentProject) return;
  }
  bookRunning = true;
  bookStopRequested = false;
  renderBook();
  let voiced = 0;
  let toCheck = 0;
  try {
    for (let i = 0; i < bookChapters.length; i++) {
      if (bookStopRequested) break;
      await activateBookChapter(i);
      if (chapterPieces.length === 0) {
        if (!el<HTMLTextAreaElement>("#chapter-text").value.trim()) continue;
        if (!splitChapterIntoPieces()) break;
      }
      // Without the model the book stops (and does not ask again for every chapter).
      if (!(await ensureDramaLoaded())) {
        bookStopRequested = true;
        break;
      }
      el("#book-hint").textContent = `${t("Voicing chapter")} ${i + 1}/${bookChapters.length}: ${bookChapters[i].title}`;
      await runChapter(false, true);
      if (bookStopRequested || chapterStopRequested) break;
      if (chapterPieces.every((p) => p.result)) {
        if (!chapterResult) await joinChapter();
        voiced += 1;
      }
      toCheck += chapterPieces.filter((p) => p.status === "bad" || p.status === "warn").length;
      await saveProjectNow();
      renderBook();
    }
  } finally {
    bookRunning = false;
    renderBook();
  }
  if (bookStopRequested || chapterStopRequested) showToast(t("The book stopped: press ▶ Voice the book to go on"), "warning");
  else if (toCheck > 0) showToast(`${t("Book voiced")}: ${voiced} · ${t("pieces to check")}: ${toCheck}`, "warning");
  else showToast(`${t("Book voiced")}: ${voiced}`);
}

/** The whole book as one M4B with a chapter list: every joined chapter mastered, then ffmpeg. */
async function exportBookM4b(outPath?: string): Promise<void> {
  if (!currentProject) return;
  await saveProjectNow();
  const ready = bookChapters.filter((c) => c.joined);
  const missing = bookChapters.filter((c) => !c.joined && c.text.trim()).map((c) => c.title);
  if (ready.length === 0) {
    showToast(t("No joined chapters yet: voice the book first"), "warning");
    return;
  }
  if (missing.length > 0) {
    const answer = await askChoice(t("Audiobook M4B"), `${t("Not joined yet")}: ${missing.join(", ")}. ${t("Make the M4B from the joined chapters only?")}`, [
      { value: "cancel", label: t("Cancel") },
      { value: "go", label: t("Make M4B"), primary: true },
    ]);
    if (answer !== "go") return;
  }
  if (!videoFfmpeg) await detectFfmpeg();
  if (!videoFfmpeg) {
    showToast(t("ffmpeg not found: install it or choose ffmpeg.exe (Video tab)"), "error");
    return;
  }
  const settings = loadAudiobookExport();
  const title = settings.book || settings.title || currentProject.name;
  const out = outPath ?? await save({
    defaultPath: `${(title || "book").replace(/[\\/:*?"<>|]+/g, "_")}.m4b`,
    filters: [{ name: "M4B audiobook", extensions: ["m4b"] }],
  });
  if (!out) return;
  const hint = el("#book-hint");
  const button = el<HTMLButtonElement>("#book-m4b");
  button.disabled = true;
  try {
    const chapters: Array<{ title: string; startMs: number; endMs: number }> = [];
    const list: string[] = [];
    let at = 0;
    for (let i = 0; i < ready.length; i++) {
      hint.textContent = `${t("Preparing chapter")} ${i + 1}/${ready.length}…`;
      await nextFrame();
      let wavBase64 = await invoke<string>("read_file_base64", { path: projectAudioPath(ready[i].joined!) });
      if (settings.standard) wavBase64 = await invoke<string>("normalize_wav", { wavBase64, targetLufs: AUDIOBOOK_TARGET_LUFS });
      const mastered = masterAudiobook(parseWavPcm(wavBase64), settings);
      const ms = (frameCount(mastered) / mastered.sampleRate) * 1000;
      const path = await invoke<string>("drama_temp_path", { name: `m4b_chapter_${i + 1}.wav` });
      await invoke("save_binary_file", { path, base64Data: pcmToResult(mastered).wavBase64 });
      list.push(`file '${path.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`);
      chapters.push({ title: ready[i].title, startMs: at, endMs: at + ms });
      at += ms;
    }
    const listPath = await invoke<string>("drama_temp_path", { name: "m4b_list.txt" });
    const metaPath = await invoke<string>("drama_temp_path", { name: "m4b_metadata.txt" });
    await invoke("save_text_file", { path: listPath, content: `${list.join("\n")}\n` });
    await invoke("save_text_file", { path: metaPath, content: m4bMetadata({ title, author: settings.author }, chapters) });
    hint.textContent = `${t("Encoding M4B")}…`;
    await invoke("ffmpeg_m4b", { ffmpeg: videoFfmpeg, list: listPath, metadata: metaPath, out, bitrate: settings.format === "mp3-128" ? 128 : 64 });
    showToast(`${t("Exported")}: ${out.split(/[/\\]/).pop()} · ${t("chapters")}: ${chapters.length} · ${formatTime(at / 1000)}`);
  } catch (e) {
    showToast(`${t("Could not make the M4B")}: ${e}`, "error");
  } finally {
    button.disabled = false;
    renderBook();
  }
}

function initBook(): void {
  el("#book-m4b").addEventListener("click", () => void exportBookM4b());
  el<HTMLSelectElement>("#book-chapter").addEventListener("change", (event) => {
    void activateBookChapter(Number((event.target as HTMLSelectElement).value));
  });
  el("#book-add").addEventListener("click", () => void addBookChapter());
  el("#book-rename").addEventListener("click", () => void renameBookChapter());
  el("#book-remove").addEventListener("click", () => void removeBookChapter());
  el("#book-split").addEventListener("click", () => void splitBookIntoChapters());
  el("#book-run").addEventListener("click", () => void runBook());
  renderBook();
}

// ═══════════════════════════════════════════════════════════════════════════
// Voice Studio: a gallery voice slightly changed. Its recordings are shifted in
// pitch and tempo, Drama 3 copies the changed recordings; a trial take uses a
// temporary voice, and what is liked is saved as a new gallery voice.
// ═══════════════════════════════════════════════════════════════════════════

const STUDIO_VOICE_PREFIX = "studio-";
const STUDIO_STORAGE_KEY = "dramaStudio.voiceStudio";
let studioBusy = false;
let studioAudioUrl = "";

/** Voices that live only in the loaded model for a scene or a studio trial. */
function isHiddenVoice(name: string): boolean {
  return name.startsWith(SCENE_VOICE_PREFIX) || name.startsWith(STUDIO_VOICE_PREFIX);
}

type StudioSettings = { source: string; pitch: number; tempo: number; age: number; style: string; phrase: string };

function readStudioSettings(): StudioSettings {
  return {
    source: el<HTMLSelectElement>("#studio-source").value,
    pitch: parseFloat(el<HTMLInputElement>("#studio-pitch").value) || 0,
    tempo: parseFloat(el<HTMLInputElement>("#studio-tempo").value) || 1,
    age: parseFloat(el<HTMLInputElement>("#studio-age").value) || 0,
    style: el<HTMLInputElement>("#studio-style").value,
    phrase: el<HTMLTextAreaElement>("#studio-phrase").value,
  };
}

function saveStudioSettings(): void {
  localStorage.setItem(STUDIO_STORAGE_KEY, JSON.stringify(readStudioSettings()));
}

function renderStudioLabels(): void {
  const s = readStudioSettings();
  el("#studio-val-pitch").textContent = s.pitch > 0 ? `+${s.pitch}` : String(s.pitch);
  el("#studio-val-tempo").textContent = `${s.tempo.toFixed(2)}×`;
  el("#studio-val-age").textContent = s.age > 0 ? `+${s.age}` : String(s.age);
}

function renderStudioSources(): void {
  const select = el<HTMLSelectElement>("#studio-source");
  const current = select.value || select.dataset.saved || "";
  const personas = mixablePersonas();
  select.innerHTML = personas.length === 0
    ? `<option value="">${escapeHtml(t("No voices with a recording and its transcript in the Speaker Gallery"))}</option>`
    : personas.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  if (personas.some((p) => p.id === current)) select.value = current;
}

function setStudioStatus(text: string): void {
  el("#studio-status").textContent = text;
}

function setStudioBusy(busy: boolean): void {
  studioBusy = busy;
  for (const id of ["#studio-preview-ref", "#studio-test", "#studio-test-original", "#studio-save"]) {
    el<HTMLButtonElement>(id).disabled = busy;
  }
}

/** What the settings change, in words, for statuses and the new voice's name. */
function studioChangeLabel(s: StudioSettings): string {
  const parts: string[] = [];
  if (s.pitch > 0) parts.push(`${t("higher by")} ${s.pitch}`);
  if (s.pitch < 0) parts.push(`${t("lower by")} ${-s.pitch}`);
  if (s.tempo < 0.995) parts.push(t("slower"));
  if (s.tempo > 1.005) parts.push(t("faster"));
  if (s.age > 0) parts.push(t("younger"));
  if (s.age < 0) parts.push(t("older"));
  return parts.join(", ");
}

function studioPersona(): SpeakerPersona {
  const persona = findPersona(el<HTMLSelectElement>("#studio-source").value);
  if (!persona) throw new Error(t("Choose a voice from the Speaker Gallery"));
  return persona;
}

/** Age slider (−100…100) → formant ratio: +100 = formants 15 % higher (younger), −100 = 15 % lower. */
function studioFormantRatio(age: number): number {
  return 1 + (Math.max(-100, Math.min(100, age)) / 100) * 0.15;
}

/** The voice's recordings changed by the settings, written to temporary WAV files. */
async function studioRecordings(persona: SpeakerPersona, s: StudioSettings, onlyMain = false): Promise<{ key: string; recordings: Array<{ path: string; name: string; text: string }> }> {
  const key = shortHash(`${persona.id}|${persona.updatedAt}|${s.pitch}|${s.tempo}|${s.age}`);
  const sources = personaRecordings(persona).slice(0, onlyMain ? 1 : undefined);
  const recordings: Array<{ path: string; name: string; text: string }> = [];
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const audio = await invoke<GenerationResult>("read_audio_as_wav", { audioPath: source.path });
    let changed: WavPcm;
    if (Math.abs(s.age) > 0.5) {
      // Age needs the formants moved apart from the pitch: the WORLD vocoder does both.
      const morphed = await invoke<string>("voice_morph_wav", {
        wavBase64: audio.wavBase64,
        semitones: s.pitch,
        formantRatio: studioFormantRatio(s.age),
      });
      changed = timeStretch(parseWavPcm(morphed), s.tempo);
    } else {
      changed = shiftPitchAndTempo(parseWavPcm(audio.wavBase64), s.pitch, s.tempo);
    }
    const path = await invoke<string>("drama_temp_path", { name: `studio_${key}_${i}.wav` });
    await invoke("save_binary_file", { path, base64Data: pcmToResult(changed).wavBase64 });
    recordings.push({ path, name: source.name, text: source.text });
  }
  return { key, recordings };
}

async function playStudio(result: GenerationResult): Promise<void> {
  if (studioAudioUrl) URL.revokeObjectURL(studioAudioUrl);
  studioAudioUrl = URL.createObjectURL(await base64ToBlobAsync(result.wavBase64, "audio/wav"));
  const audio = el<HTMLAudioElement>("#studio-audio");
  audio.src = studioAudioUrl;
  audio.volume = audioPlayer.volume;
  await audio.play().catch(() => {});
}

async function studioPreviewRecording(): Promise<void> {
  if (studioBusy) return;
  setStudioBusy(true);
  try {
    const s = readStudioSettings();
    const { recordings } = await studioRecordings(studioPersona(), s, true);
    const audio = await invoke<GenerationResult>("read_audio_as_wav", { audioPath: recordings[0].path });
    setStudioStatus(`${t("Changed recording")}: ${studioChangeLabel(s) || t("no changes")}`);
    await playStudio(audio);
  } catch (e) {
    showToast(String(e), "error");
  } finally {
    setStudioBusy(false);
  }
}

/** A trial take of the phrase: with the changed voice (a temporary one), or the original. */
async function studioTrialTake(original: boolean): Promise<void> {
  if (studioBusy) return;
  setStudioBusy(true);
  try {
    const s = readStudioSettings();
    const persona = studioPersona();
    if (!s.phrase.trim()) throw new Error(t("Type a trial phrase"));
    if (!(await ensureDramaLoaded())) return;
    let voice: string;
    if (original) {
      voice = persona.dramaVoiceName || persona.name;
      if (!persona.dramaVoicePath || !dramaStatus.modelInfo?.voices.some((v) => v.name === voice)) {
        throw new Error(t("This voice has no Drama 3 voice yet: create it in the Speaker Gallery"));
      }
    } else {
      const { key, recordings } = await studioRecordings(persona, s);
      voice = `${STUDIO_VOICE_PREFIX}${key}`;
      if (!dramaStatus.modelInfo?.voices.some((v) => v.name === voice)) {
        setStudioStatus(t("Making the changed voice, about a minute…"));
        const outPath = await invoke<string>("drama_temp_path", { name: `studio_${key}.voice.gguf` });
        await invoke("drama_voice_make", {
          request: {
            references: recordings.map((r) => ({ path: r.path, transcript: r.text.trim() })),
            voices: [],
            outPath,
            modelPath: null,
          },
          addAs: voice,
        });
        await refreshDramaStatus();
      }
    }
    setStudioStatus(t("Generating the trial take…"));
    const result = await dramaGenerate({
      request: {
        text: `${characterStyleHint({ style: s.style })}${s.phrase.trim()}`,
        voice,
        options: dramaRequestOptions(readDramaOptionsFromUi()),
        streamPlayback: false,
      },
    });
    const take = autoShortenPauses(result);
    setDramaLastSeed(result.seed);
    setStudioStatus(original
      ? `${t("Original voice")} · seed ${result.seed}`
      : `${t("Changed voice")}: ${studioChangeLabel(s) || t("no changes")}${s.style.trim() ? ` · ${s.style.trim()}` : ""} · seed ${result.seed}`);
    await playStudio(take);
  } catch (e) {
    setStudioStatus("");
    showToast(String(e), "error");
  } finally {
    setStudioBusy(false);
  }
}

/** Saves the changed recordings as a new gallery voice and makes its Drama 3 voice. */
async function studioSaveVoice(): Promise<void> {
  if (studioBusy) return;
  let persona: SpeakerPersona;
  try {
    persona = studioPersona();
  } catch (e) {
    showToast(String(e), "warning");
    return;
  }
  const s = readStudioSettings();
  const change = studioChangeLabel(s);
  const name = await askText(t("💾 Save as a new voice"), t("The changed voice becomes a new card in the Speaker Gallery. Its name:"), change ? `${persona.name} — ${change}` : `${persona.name} 2`);
  if (!name) return;
  setStudioBusy(true);
  try {
    const { recordings } = await studioRecordings(persona, s);
    const created = createBlankPersona();
    created.name = name;
    const main = await storeSpeakerAsset(created, recordings[0].path, "audio");
    created.refPath = main.path;
    created.refName = recordings[0].name;
    created.refText = recordings[0].text.trim();
    created.extraRefs = [];
    for (const recording of recordings.slice(1)) {
      const stored = await invoke<{ path: string }>("store_speaker_extra_asset", {
        speakerId: created.id,
        speakerName: created.name,
        sourcePath: recording.path,
      });
      created.extraRefs.push({ path: stored.path, name: recording.name, text: recording.text.trim() });
    }
    created.notes = `${t("Voice Studio")}: ${t("from")} «${persona.name}»${change ? `, ${change}` : ""}${s.style.trim() ? `; ${t("manner for it")}: ${s.style.trim()}` : ""}`;
    speakerPersonas.push(created);
    saveSpeakerPersonas();
    setStudioStatus(t("Making the Drama 3 voice of the new card…"));
    await makeDramaVoiceForPersona(created);
    renderStudioSources();
    setStudioStatus(`${t("Saved as a new voice")}: ${created.name}`);
  } catch (e) {
    showToast(`${t("Could not save the voice")}: ${e}`, "error");
  } finally {
    setStudioBusy(false);
  }
}

function initVoiceStudio(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(STUDIO_STORAGE_KEY) || "{}") as Partial<StudioSettings>;
    if (typeof saved.pitch === "number") el<HTMLInputElement>("#studio-pitch").value = String(saved.pitch);
    if (typeof saved.tempo === "number") el<HTMLInputElement>("#studio-tempo").value = String(saved.tempo);
    if (typeof saved.age === "number") el<HTMLInputElement>("#studio-age").value = String(saved.age);
    if (typeof saved.style === "string") el<HTMLInputElement>("#studio-style").value = saved.style;
    if (typeof saved.phrase === "string" && saved.phrase.trim()) el<HTMLTextAreaElement>("#studio-phrase").value = saved.phrase;
    if (typeof saved.source === "string") el<HTMLSelectElement>("#studio-source").dataset.saved = saved.source;
  } catch {
    // Defaults stay.
  }
  renderStudioSources();
  renderStudioLabels();
  for (const id of ["#studio-pitch", "#studio-tempo", "#studio-age"]) {
    el(id).addEventListener("input", () => {
      renderStudioLabels();
      saveStudioSettings();
    });
  }
  for (const id of ["#studio-source", "#studio-style", "#studio-phrase"]) el(id).addEventListener("change", saveStudioSettings);
  el("#studio-preview-ref").addEventListener("click", () => void studioPreviewRecording());
  el("#studio-test").addEventListener("click", () => void studioTrialTake(false));
  el("#studio-test-original").addEventListener("click", () => void studioTrialTake(true));
  el("#studio-save").addEventListener("click", () => void studioSaveVoice());
}

// ═══════════════════════════════════════════════════════════════════════════
// Audiobook export: loudness to the audiobook standard, room tone, MP3 with tags.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// Subtitles: SRT/VTT lines voiced, trimmed and fitted into their times (sped up
// a little when too long), then placed at their times in one track.
// ═══════════════════════════════════════════════════════════════════════════

type SubsStatus = "waiting" | "generating" | "ok" | "fast" | "long" | "bad";
type SubsCue = SubtitleCue & {
  id: string;
  /** Scene character, or -1 for the default voice. */
  character: number;
  status: SubsStatus;
  reason: string;
  /** The take, trimmed, before fitting. */
  take: DramaGenerationResult | null;
  speed: number;
  stale: boolean;
};
type SubsSettings = { text: string; voice: string; useCharacters: boolean; maxSpeed: number; retries: number; level: boolean };

const SUBS_STORAGE_KEY = "dramaStudio.subtitles";
let subsCues: SubsCue[] = [];
let subsCharacters: DramaCharacter[] = [];
let subsRunning = false;
let subsStopRequested = false;
let subsTrack: GenerationResult | null = null;
let subsTrackUrl = "";
const subsPlayer = new Audio();
let subsPlayerUrl = "";
let subsPlayingId = "";

function readSubsSettings(): SubsSettings {
  const num = (id: string, min: number, max: number, fallback: number) => {
    const v = parseFloat(el<HTMLInputElement>(id).value);
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  };
  return {
    text: el<HTMLTextAreaElement>("#subs-text").value,
    voice: el<HTMLSelectElement>("#subs-voice").value || "none",
    useCharacters: el<HTMLInputElement>("#subs-use-characters").checked,
    maxSpeed: num("#subs-max-speed", 1, 1.6, 1.35),
    retries: Math.round(num("#subs-retries", 0, 5, 1)),
    level: el<HTMLInputElement>("#subs-level").checked,
  };
}

function saveSubsSettings(): void {
  try {
    localStorage.setItem(SUBS_STORAGE_KEY, JSON.stringify(readSubsSettings()));
  } catch {
    // Long subtitles may not fit: a convenience only.
  }
  scheduleProjectSave();
}

function loadSubsSettings(from?: Partial<SubsSettings>): void {
  let saved: Partial<SubsSettings> = from ?? {};
  if (!from) {
    try {
      saved = JSON.parse(localStorage.getItem(SUBS_STORAGE_KEY) || "{}") || {};
    } catch {
      saved = {};
    }
  }
  if (typeof saved.text === "string") el<HTMLTextAreaElement>("#subs-text").value = saved.text;
  if (typeof saved.useCharacters === "boolean") el<HTMLInputElement>("#subs-use-characters").checked = saved.useCharacters;
  if (typeof saved.level === "boolean") el<HTMLInputElement>("#subs-level").checked = saved.level;
  if (typeof saved.maxSpeed === "number") el<HTMLInputElement>("#subs-max-speed").value = String(saved.maxSpeed);
  if (typeof saved.retries === "number") el<HTMLInputElement>("#subs-retries").value = String(saved.retries);
  if (typeof saved.voice === "string") {
    const select = el<HTMLSelectElement>("#subs-voice");
    select.dataset.saved = saved.voice;
    select.value = "";
    refreshSubsVoiceOptions();
  }
}

function refreshSubsVoiceOptions(): void {
  const select = document.querySelector<HTMLSelectElement>("#subs-voice");
  if (!select) return;
  const current = select.value || select.dataset.saved || "none";
  const names = dramaVoiceNames().filter((n) => !isHiddenVoice(n));
  if (!names.includes(current)) names.push(current);
  select.innerHTML = names
    .map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n === "none" ? t("none (the model chooses)") : n)}</option>`)
    .join("");
  select.value = current;
}

/** How long a line may last: until the next line starts, or 1.5 s past its own end. */
function subsSlot(index: number): number {
  const cue = subsCues[index];
  const next = subsCues[index + 1];
  const limit = next ? next.start - 0.05 : cue.end + 1.5;
  return Math.max(0.3, limit - cue.start);
}

/** A take fitted into `slot` seconds: as it is, sped up to `maxSpeed`, or still too long. */
function fitSubsTake(take: GenerationResult, slot: number, maxSpeed: number): { pcm: WavPcm; speed: number; status: "ok" | "fast" | "long"; overflow: number } {
  const pcm = parseWavPcm(take.wavBase64);
  const seconds = frameCount(pcm) / pcm.sampleRate;
  if (seconds <= slot) return { pcm, speed: 1, status: "ok", overflow: 0 };
  const needed = seconds / slot;
  const speed = Math.min(needed, maxSpeed);
  const fitted = timeStretch(pcm, speed);
  const overflow = needed > maxSpeed ? seconds / maxSpeed - slot : 0;
  return { pcm: fitted, speed, status: needed > maxSpeed ? "long" : "fast", overflow };
}

function subsCueRequest(cue: SubsCue): { text: string; voice: string } {
  const loaded = new Set(dramaStatus.modelInfo?.voices.map((v) => v.name) || []);
  if (cue.character >= 0) {
    const snapshot = subsCharacters[cue.character];
    const character = dramaScene.characters.find((c) => c.id === snapshot?.id) ?? snapshot;
    const voice = character && character.voice !== "none" && loaded.has(character.voice) ? character.voice : "none";
    if (character && character.voice !== "none" && voice === "none") throw new Error(`${t("Voice not found")}: ${character.voice} (${character.name})`);
    return { text: `${characterLineHint(character)}${cue.text}`, voice };
  }
  const voice = readSubsSettings().voice;
  if (voice !== "none" && !loaded.has(voice)) throw new Error(`${t("Voice not found")}: ${voice}`);
  return { text: cue.text, voice };
}

const SUBS_STATUS_LABEL: Record<SubsStatus, string> = {
  waiting: "Waiting",
  generating: "Generating…",
  ok: "Fits",
  fast: "Sped up",
  long: "Does not fit",
  bad: "Bad",
};

function renderSubsCues(): void {
  scheduleProjectSave();
  const list = el<HTMLElement>("#subs-cues");
  list.innerHTML = "";
  subsCues.forEach((cue, index) => {
    const row = document.createElement("div");
    const tone = cue.status === "ok" ? "ok" : cue.status === "fast" ? "warn ok-fast" : cue.status === "long" || cue.status === "bad" ? "bad" : cue.status;
    row.className = `chapter-piece ${tone}${cue.stale ? " stale" : ""}`;
    row.dataset.id = cue.id;
    const meta: string[] = [`${formatTimestamp(cue.start)}–${formatTimestamp(cue.end)}`, `${t("slot")} ${subsSlot(index).toFixed(1)} ${t("s")}`];
    if (cue.take) meta.push(`${t("take")} ${cue.take.seconds.toFixed(1)} ${t("s")}`);
    if (cue.speed > 1.001) meta.push(`×${cue.speed.toFixed(2)}`);
    const narratorLabel = t("Default voice");
    const speakerSelect = subsCharacters.length > 0
      ? `<select class="select-input chapter-piece-speaker-select" data-field="speaker" style="--speaker-color:${cue.character >= 0 ? sceneColor(cue.character) : "var(--text-secondary)"}">
          <option value="-1">${escapeHtml(narratorLabel)}</option>
          ${subsCharacters.map((c, i) => `<option value="${i}"${i === cue.character ? " selected" : ""}>${i}. ${escapeHtml(c.name)}</option>`).join("")}
        </select>`
      : "";
    row.innerHTML = `
      <div class="chapter-piece-head">
        <span class="chapter-piece-index">${index + 1}</span>
        <span class="chapter-piece-status">${escapeHtml(t(SUBS_STATUS_LABEL[cue.status]))}</span>
        ${speakerSelect}
        <span class="chapter-piece-meta">${escapeHtml(meta.join(" · "))}</span>
        <span class="chapter-piece-actions">
          <button class="ref-play" data-action="play" type="button" ${cue.take ? "" : "disabled"} aria-label="${escapeHtml(t("Play"))}">${subsPlayingId === cue.id ? "⏸" : "▶"}</button>
          <button class="compact-button" data-action="edit" type="button" ${cue.take ? "" : "disabled"} title="${escapeHtml(t("Cut pauses and pieces out of this line"))}">✂</button>
          <button class="compact-button" data-action="redo" type="button" ${subsRunning ? "disabled" : ""}>${escapeHtml(t("↻ Redo"))}</button>
        </span>
      </div>
      <textarea class="text-area chapter-piece-text" data-field="text" rows="1" spellcheck="false"></textarea>
      ${cue.reason || cue.stale ? `<p class="chapter-piece-reason"></p>` : ""}
    `;
    row.querySelector<HTMLTextAreaElement>(".chapter-piece-text")!.value = cue.text;
    const reason = row.querySelector<HTMLElement>(".chapter-piece-reason");
    if (reason) reason.textContent = cue.stale ? t("The text was changed: redo this piece") : cue.reason;
    list.appendChild(row);
  });
  const done = subsCues.filter((c) => c.take).length;
  const marked = subsCues.filter((c) => c.status === "long" || c.status === "bad" || c.stale).length;
  el("#subs-join-row").classList.toggle("hidden", done === 0);
  el("#subs-redo-bad").classList.toggle("hidden", marked === 0 || subsRunning);
  el<HTMLButtonElement>("#subs-redo-bad").textContent = `${t("↻ Redo the marked lines")} (${marked})`;
  el("#subs-run").classList.toggle("hidden", subsRunning);
  el("#subs-stop").classList.toggle("hidden", !subsRunning);
  el("#subs-status").textContent = subsCues.length > 0
    ? `${done}/${subsCues.length} ${t("lines")} · ${formatTimestamp(subsCues[subsCues.length - 1].end)}${marked > 0 ? ` · ${t("to check")}: ${marked}` : ""}`
    : "";
}

function readSubsCues(): boolean {
  const settings = readSubsSettings();
  const cues = parseSubtitles(settings.text);
  if (cues.length === 0) {
    showToast(t("No subtitle lines found: SRT or VTT with times is needed"), "warning");
    return false;
  }
  subsCharacters = settings.useCharacters ? dramaScene.characters.map((c) => ({ ...c })) : [];
  subsCues = cues.map((cue) => {
    const speaker = settings.useCharacters ? speakerOfLine(cue.text, subsCharacters) : { character: -1, text: cue.text };
    return { ...cue, text: speaker.text, id: nextId("cue"), character: speaker.character, status: "waiting", reason: "", take: null, speed: 1, stale: false };
  });
  subsTrack = null;
  el("#subs-output").classList.add("hidden");
  saveSubsSettings();
  renderSubsCues();
  showToast(`${t("Subtitle lines")}: ${subsCues.length}`);
  return true;
}

/** Voices a line; a take that does not fit even sped up is retried, the best kept. */
async function voiceSubsCue(cue: SubsCue): Promise<void> {
  const settings = readSubsSettings();
  const index = subsCues.indexOf(cue);
  cue.status = "generating";
  cue.reason = "";
  renderSubsCues();
  const { text, voice } = subsCueRequest(cue);
  let best: { take: DramaGenerationResult; fit: ReturnType<typeof fitSubsTake> } | null = null;
  for (let attempt = 0; attempt <= settings.retries; attempt++) {
    if (subsStopRequested) break;
    const ui = readDramaOptionsFromUi();
    const raw = await dramaGenerate({
      request: { text, voice, options: dramaRequestOptions(attempt === 0 ? ui : { ...ui, seed: "" }), streamPlayback: false },
    });
    const shortened = autoShortenPauses(raw);
    const trimmed = trimEdgeSilence(parseWavPcm(shortened.wavBase64));
    const take: DramaGenerationResult = { ...shortened, ...pcmToResult(trimmed), seconds: frameCount(trimmed) / trimmed.sampleRate };
    const fit = fitSubsTake(take, subsSlot(index), settings.maxSpeed);
    if (!best || fit.speed < best.fit.speed || (fit.status !== "long" && best.fit.status === "long")) best = { take, fit };
    if (fit.status !== "long") break;
  }
  if (!best) {
    cue.status = "waiting";
    renderSubsCues();
    return;
  }
  cue.take = best.take;
  cue.speed = best.fit.speed;
  cue.status = best.fit.status;
  cue.reason = best.fit.status === "long" ? `${t("longer than its time by")} ${best.fit.overflow.toFixed(1)} ${t("s even sped up: shorten the text or allow more speed")}` : "";
  cue.stale = false;
  subsTrack = null;
  renderSubsCues();
}

async function runSubs(onlyMarked = false): Promise<void> {
  if (subsRunning) return;
  if (subsCues.length === 0 && !readSubsCues()) return;
  if (!(await ensureDramaLoaded())) return;
  const todo = subsCues.filter((c) => (onlyMarked ? c.status === "long" || c.status === "bad" || c.stale : !c.take || c.stale));
  if (todo.length === 0) {
    showToast(t("All lines are voiced"));
    return;
  }
  subsRunning = true;
  subsStopRequested = false;
  el("#subs-progress").classList.remove("hidden");
  try {
    for (let i = 0; i < todo.length; i++) {
      if (subsStopRequested) break;
      setProgress("#subs-progress-bar", i, todo.length);
      try {
        await voiceSubsCue(todo[i]);
      } catch (e) {
        if (subsStopRequested || String(e).toLowerCase().includes("cancel")) {
          if (!todo[i].take) todo[i].status = "waiting";
          break;
        }
        todo[i].status = "bad";
        todo[i].reason = String(e);
      }
    }
  } finally {
    subsRunning = false;
    el("#subs-progress").classList.add("hidden");
    renderSubsCues();
  }
  const marked = subsCues.filter((c) => c.status === "long" || c.status === "bad").length;
  showToast(subsStopRequested ? t("Stopped: press ▶ to go on") : marked > 0 ? `${t("Subtitles voiced")} · ${t("to check")}: ${marked}` : t("Subtitles voiced"), marked > 0 ? "warning" : "success");
}

/** All lines at their times in one track, as long as the last line needs. */
async function buildSubsTrack(): Promise<void> {
  const voiced = subsCues.filter((c) => c.take);
  if (voiced.length === 0) return;
  const settings = readSubsSettings();
  const button = el<HTMLButtonElement>("#subs-build");
  button.disabled = true;
  try {
    await nextFrame();
    const placed: Array<{ start: number; pcm: WavPcm }> = [];
    for (const cue of subsCues) {
      if (!cue.take) continue;
      const take = settings.level ? await levelSceneTake(cue.take, true) : cue.take;
      placed.push({ start: cue.start, pcm: fitSubsTake(take, subsSlot(subsCues.indexOf(cue)), settings.maxSpeed).pcm });
    }
    const rate = placed[0].pcm.sampleRate;
    const end = Math.max(...placed.map((p) => p.start + frameCount(p.pcm) / rate), subsCues[subsCues.length - 1].end);
    const total = Math.ceil((end + 0.5) * rate);
    const mix = new Float32Array(total);
    for (const p of placed) {
      const pcm = convertChannels(resamplePcm(p.pcm, rate), 1);
      const at = Math.round(p.start * rate);
      for (let i = 0; i < pcm.samples.length && at + i < total; i++) mix[at + i] += pcm.samples[i];
    }
    const samples = new Int16Array(total);
    for (let i = 0; i < total; i++) samples[i] = Math.max(-32768, Math.min(32767, Math.round(mix[i])));
    subsTrack = pcmToResult({ sampleRate: rate, channels: 1, samples });
    if (subsTrackUrl) URL.revokeObjectURL(subsTrackUrl);
    subsTrackUrl = URL.createObjectURL(await base64ToBlobAsync(subsTrack.wavBase64, "audio/wav"));
    el<HTMLAudioElement>("#subs-audio").src = subsTrackUrl;
    el("#subs-output-info").textContent = `${formatTime(total / rate)} · ${voiced.length}/${subsCues.length} ${t("lines")}`;
    el("#subs-output").classList.remove("hidden");
    showToast(t("Track built"));
  } catch (e) {
    showToast(`${t("Could not join")}: ${e}`, "error");
  } finally {
    button.disabled = false;
  }
}

async function openSubtitleFile(): Promise<void> {
  const selected = await open({ filters: [{ name: "Subtitles", extensions: ["srt", "vtt"] }] });
  const path = Array.isArray(selected) ? selected[0] : selected;
  if (!path) return;
  try {
    const bytes = await base64ToBytesAsync(await invoke<string>("read_file_base64", { path }));
    el<HTMLTextAreaElement>("#subs-text").value = decodeSubtitleBytes(bytes);
    readSubsCues();
  } catch (e) {
    showToast(`${t("Could not read the file")}: ${e}`, "error");
  }
}

function initSubtitles(): void {
  loadSubsSettings();
  refreshSubsVoiceOptions();
  for (const id of ["#subs-text", "#subs-voice", "#subs-use-characters", "#subs-max-speed", "#subs-retries", "#subs-level"]) {
    el(id).addEventListener("change", saveSubsSettings);
  }
  el("#subs-open").addEventListener("click", () => void openSubtitleFile());
  el("#subs-parse").addEventListener("click", () => {
    if (subsCues.some((c) => c.take)) {
      void askChoice(t("Read the pasted subtitles"), t("The voiced lines will be dropped and the subtitles read again. Go on?"), [
        { value: "cancel", label: t("Cancel") },
        { value: "go", label: t("Read again"), primary: true },
      ]).then((answer) => {
        if (answer === "go") readSubsCues();
      });
    } else {
      readSubsCues();
    }
  });
  el("#subs-run").addEventListener("click", () => void runSubs(false));
  el("#subs-redo-bad").addEventListener("click", () => void runSubs(true));
  el("#subs-stop").addEventListener("click", async () => {
    subsStopRequested = true;
    await invoke("drama_cancel").catch(() => {});
  });
  el("#subs-build").addEventListener("click", () => void buildSubsTrack());
  el("#subs-save-wav").addEventListener("click", () => {
    if (subsTrack) void saveResultToFile(subsTrack, "dubbing", "wav");
  });
  el("#subs-save-mp3").addEventListener("click", () => {
    if (subsTrack) void saveResultToFile(subsTrack, "dubbing", "mp3");
  });
  el("#subs-to-montage").addEventListener("click", () => {
    if (subsTrack) addMontageClip(t("Dubbing track"), subsTrack, "subtitles");
  });

  const list = el<HTMLElement>("#subs-cues");
  list.addEventListener("input", (event) => {
    const area = event.target as HTMLTextAreaElement;
    const cue = subsCues.find((c) => c.id === area.closest<HTMLElement>(".chapter-piece")?.dataset.id);
    if (!cue || area.dataset.field !== "text") return;
    cue.text = area.value;
    if (cue.take && !cue.stale) {
      cue.stale = true;
      area.closest<HTMLElement>(".chapter-piece")!.classList.add("stale");
    }
  });
  list.addEventListener("change", (event) => {
    const select = event.target as HTMLSelectElement;
    const cue = subsCues.find((c) => c.id === select.closest<HTMLElement>(".chapter-piece")?.dataset.id);
    if (cue && select.dataset.field === "speaker") {
      cue.character = Number(select.value);
      if (cue.take) cue.stale = true;
      subsTrack = null;
    }
    renderSubsCues();
  });
  list.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-action]");
    if (!button) return;
    const cue = subsCues.find((c) => c.id === button.closest<HTMLElement>(".chapter-piece")?.dataset.id);
    if (!cue) return;
    if (button.dataset.action === "redo") {
      if (subsRunning || !(await ensureDramaLoaded())) return;
      subsRunning = true;
      subsStopRequested = false;
      try {
        await voiceSubsCue(cue);
      } catch (e) {
        cue.status = "bad";
        cue.reason = String(e);
      } finally {
        subsRunning = false;
        renderSubsCues();
      }
    } else if (button.dataset.action === "edit" && cue.take) {
      editAudio(`${t("Line")} ${subsCues.indexOf(cue) + 1}`, cue.take.wavBase64, (edited) => {
        const seconds = edited.sampleCount / edited.channels / edited.sampleRate;
        cue.take = { ...cue.take!, ...edited, seconds };
        const fit = fitSubsTake(cue.take, subsSlot(subsCues.indexOf(cue)), readSubsSettings().maxSpeed);
        cue.speed = fit.speed;
        cue.status = fit.status;
        cue.reason = fit.status === "long" ? `${t("longer than its time by")} ${fit.overflow.toFixed(1)} ${t("s even sped up: shorten the text or allow more speed")}` : "";
        subsTrack = null;
        renderSubsCues();
      });
    } else if (button.dataset.action === "play" && cue.take) {
      subsPlayer.pause();
      if (subsPlayingId === cue.id) {
        subsPlayingId = "";
        renderSubsCues();
        return;
      }
      // Heard as it will sound in the track: fitted into its time.
      const fitted = pcmToResult(fitSubsTake(cue.take, subsSlot(subsCues.indexOf(cue)), readSubsSettings().maxSpeed).pcm);
      if (subsPlayerUrl) URL.revokeObjectURL(subsPlayerUrl);
      subsPlayerUrl = URL.createObjectURL(await base64ToBlobAsync(fitted.wavBase64, "audio/wav"));
      subsPlayer.src = subsPlayerUrl;
      subsPlayer.volume = audioPlayer.volume;
      subsPlayingId = cue.id;
      subsPlayer.onended = () => {
        subsPlayingId = "";
        renderSubsCues();
      };
      renderSubsCues();
      await subsPlayer.play().catch(() => {
        subsPlayingId = "";
        renderSubsCues();
      });
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Video: the video plays with the new track in step; ffmpeg (the user's) puts
// the track into the video, picture copied, original sound optionally kept low.
// ═══════════════════════════════════════════════════════════════════════════

const VIDEO_STORAGE_KEY = "dramaStudio.video";
let videoPath = "";
let videoFfmpeg = "";
let videoFileTrack: GenerationResult | null = null;
let videoTrackUrl = "";
let videoTrackShown: GenerationResult | null = null;

function saveVideoSettings(): void {
  localStorage.setItem(VIDEO_STORAGE_KEY, JSON.stringify({
    ffmpeg: el<HTMLInputElement>("#video-ffmpeg-path").value,
    originalVolume: parseFloat(el<HTMLInputElement>("#video-orig-volume").value),
    source: el<HTMLSelectElement>("#video-track-source").value,
  }));
}

async function detectFfmpeg(): Promise<void> {
  const custom = el<HTMLInputElement>("#video-ffmpeg-path").value.trim();
  const found = await invoke<{ path: string | null; version: string | null }>("ffmpeg_detect", { custom: custom || null }).catch(() => ({ path: null, version: null }));
  videoFfmpeg = found.path || "";
  el("#video-ffmpeg-status").textContent = found.path
    ? `✓ ${found.version}`
    : t("ffmpeg not found: install it or choose ffmpeg.exe");
  el("#video-ffmpeg-status").classList.toggle("warn-text", !found.path);
}

/** The track chosen for the video: the Subtitles, Montage or Chapter result, or a file. */
function videoTrack(): GenerationResult | null {
  const source = el<HTMLSelectElement>("#video-track-source").value;
  if (source === "subs") return subsTrack;
  if (source === "montage") return montageResult;
  if (source === "chapter") return chapterResult;
  return videoFileTrack;
}

async function refreshVideoTrack(): Promise<void> {
  const track = videoTrack();
  el("#video-track-info").textContent = track
    ? `${formatTime(resultSeconds(track))}`
    : t("not ready: build it in its tab first");
  if (track === videoTrackShown) return;
  videoTrackShown = track;
  const audio = el<HTMLAudioElement>("#video-track-audio");
  if (videoTrackUrl) URL.revokeObjectURL(videoTrackUrl);
  videoTrackUrl = "";
  if (!track) {
    audio.removeAttribute("src");
    return;
  }
  videoTrackUrl = URL.createObjectURL(await base64ToBlobAsync(track.wavBase64, "audio/wav"));
  audio.src = videoTrackUrl;
  audio.load();
}

/** Keeps the track playing in step with the video. */
function initVideoSync(): void {
  const video = el<HTMLVideoElement>("#video-preview");
  const audio = el<HTMLAudioElement>("#video-track-audio");
  const align = () => {
    if (!audio.src) return;
    if (Math.abs(audio.currentTime - video.currentTime) > 0.15) audio.currentTime = Math.min(video.currentTime, audio.duration || video.currentTime);
  };
  video.addEventListener("play", () => {
    align();
    audio.volume = audioPlayer.volume;
    if (audio.src && video.currentTime < (audio.duration || Infinity)) void audio.play().catch(() => {});
  });
  video.addEventListener("pause", () => audio.pause());
  video.addEventListener("seeked", align);
  video.addEventListener("ratechange", () => { audio.playbackRate = video.playbackRate; });
  video.addEventListener("timeupdate", () => {
    if (!video.paused) align();
  });
}

async function chooseVideo(): Promise<void> {
  const selected = await open({ filters: [{ name: "Video", extensions: ["mp4", "mkv", "mov", "webm", "avi", "m4v"] }] });
  const path = Array.isArray(selected) ? selected[0] : selected;
  if (!path) return;
  videoPath = path;
  el("#video-name").textContent = path.split(/[/\\]/).pop() || path;
  const video = el<HTMLVideoElement>("#video-preview");
  video.src = convertFileSrc(path);
  video.volume = parseFloat(el<HTMLInputElement>("#video-orig-volume").value);
  video.classList.remove("hidden");
  video.load();
}

async function saveVideoWithTrack(): Promise<void> {
  const track = videoTrack();
  if (!videoPath) {
    showToast(t("Choose a video first"), "warning");
    return;
  }
  if (!track) {
    showToast(t("The new track is not ready: build it in its tab first"), "warning");
    return;
  }
  await detectFfmpeg();
  if (!videoFfmpeg) {
    showToast(t("ffmpeg not found: install it or choose ffmpeg.exe"), "warning");
    return;
  }
  const base = (videoPath.split(/[/\\]/).pop() || "video").replace(/\.[^.]+$/, "");
  const out = await save({ defaultPath: `${base} (озвучка).mp4`, filters: [{ name: "MP4 video", extensions: ["mp4"] }] });
  if (!out) return;
  const button = el<HTMLButtonElement>("#video-save");
  button.disabled = true;
  el("#video-status").textContent = t("Saving the video…");
  try {
    const audioPath = await invoke<string>("drama_temp_path", { name: "video_track.wav" });
    await invoke("save_binary_file", { path: audioPath, base64Data: track.wavBase64 });
    await invoke("ffmpeg_mux", {
      ffmpeg: videoFfmpeg,
      video: videoPath,
      audio: audioPath,
      out,
      originalVolume: parseFloat(el<HTMLInputElement>("#video-orig-volume").value) || 0,
    });
    el("#video-status").textContent = `${t("Saved")}: ${out}`;
    showToast(`${t("Video saved")}: ${out.split(/[/\\]/).pop()}`);
  } catch (e) {
    el("#video-status").textContent = "";
    showToast(`${t("Could not save the video")}: ${e}`, "error");
  } finally {
    button.disabled = false;
  }
}

function initVideo(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(VIDEO_STORAGE_KEY) || "{}");
    if (typeof saved.ffmpeg === "string") el<HTMLInputElement>("#video-ffmpeg-path").value = saved.ffmpeg;
    if (typeof saved.originalVolume === "number") el<HTMLInputElement>("#video-orig-volume").value = String(saved.originalVolume);
    if (typeof saved.source === "string" && saved.source !== "file") el<HTMLSelectElement>("#video-track-source").value = saved.source;
  } catch {
    // Defaults stay.
  }
  const renderOrig = () => {
    const v = parseFloat(el<HTMLInputElement>("#video-orig-volume").value);
    el("#video-val-orig").textContent = `${Math.round(v * 100)}%`;
    el<HTMLVideoElement>("#video-preview").volume = v;
  };
  renderOrig();
  el("#video-orig-volume").addEventListener("input", () => {
    renderOrig();
    saveVideoSettings();
  });
  el("#video-ffmpeg-path").addEventListener("change", () => {
    saveVideoSettings();
    void detectFfmpeg();
  });
  el("#video-ffmpeg-browse").addEventListener("click", async () => {
    const selected = await open({ filters: [{ name: "ffmpeg", extensions: ["exe"] }] });
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (!path) return;
    el<HTMLInputElement>("#video-ffmpeg-path").value = path;
    saveVideoSettings();
    await detectFfmpeg();
  });
  el("#video-ffmpeg-site").addEventListener("click", () => void openExternalUrl("https://ffmpeg.org/download.html"));
  el("#video-open").addEventListener("click", () => void chooseVideo());
  el("#video-track-source").addEventListener("change", async () => {
    saveVideoSettings();
    if (el<HTMLSelectElement>("#video-track-source").value === "file") {
      const selected = await open({ filters: [{ name: "Audio", extensions: ["wav", "mp3", "flac", "m4a", "ogg"] }] });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (path) {
        try {
          videoFileTrack = await invoke<GenerationResult>("read_audio_as_wav", { audioPath: path });
        } catch (e) {
          showToast(`${t("Could not read the recording")}: ${e}`, "error");
        }
      }
    }
    await refreshVideoTrack();
  });
  el("#video-save").addEventListener("click", () => void saveVideoWithTrack());
  initVideoSync();
  void detectFfmpeg();
}

let audiobookSource: { result: GenerationResult; label: string } | null = null;

function readAudiobookForm(): AudiobookExport {
  return {
    format: el<HTMLSelectElement>("#audiobook-format").value as AudiobookFormat,
    standard: el<HTMLInputElement>("#audiobook-standard").checked,
    roomTone: el<HTMLInputElement>("#audiobook-room-tone").checked,
    title: el<HTMLInputElement>("#audiobook-tag-title").value,
    author: el<HTMLInputElement>("#audiobook-tag-author").value,
    book: el<HTMLInputElement>("#audiobook-tag-book").value,
    track: el<HTMLInputElement>("#audiobook-tag-track").value,
  };
}

function openAudiobookExport(result: GenerationResult | null, label: string): void {
  if (!result) return;
  audiobookSource = { result, label };
  const saved = loadAudiobookExport();
  el<HTMLSelectElement>("#audiobook-format").value = saved.format;
  el<HTMLInputElement>("#audiobook-standard").checked = saved.standard;
  el<HTMLInputElement>("#audiobook-room-tone").checked = saved.roomTone;
  // The title follows the project; author and book stay from the last export.
  el<HTMLInputElement>("#audiobook-tag-title").value = currentProject?.name || saved.title || label;
  el<HTMLInputElement>("#audiobook-tag-author").value = saved.author;
  el<HTMLInputElement>("#audiobook-tag-book").value = saved.book;
  el<HTMLInputElement>("#audiobook-tag-track").value = saved.track;
  el("#audiobook-source").textContent = `${label} · ${formatTime(resultSeconds(result))}`;
  el("#audiobook-modal").classList.remove("hidden");
}

function closeAudiobookExport(): void {
  el("#audiobook-modal").classList.add("hidden");
}

async function runAudiobookExport(): Promise<void> {
  if (!audiobookSource) return;
  const settings = readAudiobookForm();
  saveAudiobookExport(settings);
  const isWav = settings.format === "wav";
  const path = await save({
    defaultPath: `${audiobookFileName(settings, audiobookSource.label)}.${isWav ? "wav" : "mp3"}`,
    filters: [isWav ? { name: "WAV Audio", extensions: ["wav"] } : { name: "MP3 Audio", extensions: ["mp3"] }],
  });
  if (!path) return;
  const button = el<HTMLButtonElement>("#audiobook-save");
  button.disabled = true;
  try {
    await nextFrame();
    let wavBase64 = audiobookSource.result.wavBase64;
    if (settings.standard) {
      wavBase64 = await invoke<string>("normalize_wav", { wavBase64, targetLufs: AUDIOBOOK_TARGET_LUFS });
    }
    const mastered = masterAudiobook(parseWavPcm(wavBase64), settings);
    const wav = pcmToResult(mastered).wavBase64;
    let data: string;
    if (isWav) {
      data = wav;
    } else {
      const mp3 = await encodeMp3FromWav(wav, settings.format === "mp3-64" ? 64 : 128);
      const tag = id3Tag({
        TIT2: settings.title,
        TPE1: settings.author,
        TALB: settings.book,
        TRCK: settings.track,
        TCON: "Audiobook",
      });
      const bytes = new Uint8Array(tag.length + mp3.length);
      bytes.set(tag, 0);
      bytes.set(mp3, tag.length);
      data = bytesToBase64(bytes);
    }
    await invoke("save_binary_file", { path, base64Data: data });
    closeAudiobookExport();
    showToast(`${t("Exported")}: ${path.split(/[/\\]/).pop()}`);
  } catch (e) {
    showToast(`${t("Export failed")}: ${e}`, "error");
  } finally {
    button.disabled = false;
  }
}

function initAudiobookExport(): void {
  el("#audiobook-close").addEventListener("click", closeAudiobookExport);
  el("#audiobook-cancel").addEventListener("click", closeAudiobookExport);
  el("#audiobook-save").addEventListener("click", () => void runAudiobookExport());
  el("#chapter-audiobook").addEventListener("click", () => openAudiobookExport(chapterResult, t("Chapter")));
  el("#montage-audiobook").addEventListener("click", () => openAudiobookExport(montageResult, t("Montage")));
}

// ═══════════════════════════════════════════════════════════════════════════
// Pronunciation dictionary: applied to every text sent to Drama 3.
// ═══════════════════════════════════════════════════════════════════════════

let dictionary: DictionaryEntry[] = loadDictionary();

/** drama_generate with the dictionary applied to the text. Every Drama 3 take goes through here. */
function dramaGenerate(args: { request: { text: string } & Record<string, unknown> }): Promise<DramaGenerationResult> {
  return invoke<DramaGenerationResult>("drama_generate", {
    request: { ...args.request, text: applyDictionary(args.request.text, dictionary) },
  });
}

function updateDictionaryButtons(): void {
  const count = dictionary.filter((e) => e.from.trim()).length;
  for (const button of document.querySelectorAll<HTMLButtonElement>(".dictionary-open")) {
    button.textContent = `📖 ${t("Dictionary")} (${count})`;
  }
}

function changeDictionary(next: DictionaryEntry[]): void {
  dictionary = next;
  saveDictionary(dictionary);
  updateDictionaryButtons();
  renderDictionaryTest();
}

function renderDictionaryTest(): void {
  const input = el<HTMLInputElement>("#dictionary-test-input").value;
  el("#dictionary-test-output").textContent = input.trim() ? `→ ${applyDictionary(input, dictionary)}` : "";
}

function renderDictionaryEditor(): void {
  const list = el<HTMLElement>("#dictionary-list");
  list.innerHTML = "";
  dictionary.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "remarks-editor-row dictionary-row";
    row.dataset.index = String(index);
    row.innerHTML = `
      <input class="text-input" data-field="from" type="text" spellcheck="false" placeholder="${escapeHtml(t("замок"))}" />
      <input class="text-input" data-field="to" type="text" spellcheck="false" placeholder="${escapeHtml(t("з+амок"))}" />
      <label class="toggle-switch dictionary-whole"><input type="checkbox" data-field="whole" /><span class="toggle-slider"></span></label>
      <button class="icon-button danger" data-action="remove" type="button" title="${escapeHtml(t("Delete"))}">✕</button>
    `;
    row.querySelector<HTMLInputElement>('[data-field="from"]')!.value = entry.from;
    row.querySelector<HTMLInputElement>('[data-field="to"]')!.value = entry.to;
    row.querySelector<HTMLInputElement>('[data-field="whole"]')!.checked = entry.wholeWord;
    list.appendChild(row);
  });
}

function closeDictionary(): void {
  const kept = dictionary.filter((e) => e.from.trim());
  if (kept.length !== dictionary.length) changeDictionary(kept);
  el("#dictionary-modal").classList.add("hidden");
}

function initDictionary(): void {
  updateDictionaryButtons();
  for (const button of document.querySelectorAll<HTMLButtonElement>(".dictionary-open")) {
    button.addEventListener("click", () => {
      renderDictionaryEditor();
      renderDictionaryTest();
      el("#dictionary-modal").classList.remove("hidden");
    });
  }
  const list = el<HTMLElement>("#dictionary-list");
  list.addEventListener("input", (event) => {
    const input = event.target as HTMLInputElement;
    const entry = dictionary[Number(input.closest<HTMLElement>(".dictionary-row")?.dataset.index)];
    if (!entry) return;
    if (input.dataset.field === "from") entry.from = input.value;
    if (input.dataset.field === "to") entry.to = input.value;
    if (input.dataset.field === "whole") entry.wholeWord = input.checked;
    changeDictionary([...dictionary]);
  });
  list.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action="remove"]');
    if (!button) return;
    dictionary.splice(Number(button.closest<HTMLElement>(".dictionary-row")?.dataset.index), 1);
    changeDictionary([...dictionary]);
    renderDictionaryEditor();
  });
  el("#dictionary-add").addEventListener("click", () => {
    changeDictionary([...dictionary, { from: "", to: "", wholeWord: true }]);
    renderDictionaryEditor();
    const inputs = list.querySelectorAll<HTMLInputElement>('[data-field="from"]');
    inputs[inputs.length - 1]?.focus();
  });
  el("#dictionary-reset").addEventListener("click", () => {
    localStorage.removeItem(DICTIONARY_STORAGE_KEY);
    changeDictionary(loadDictionary());
    renderDictionaryEditor();
  });
  el("#dictionary-test-input").addEventListener("input", renderDictionaryTest);
  el("#dictionary-done").addEventListener("click", closeDictionary);
  el("#dictionary-close").addEventListener("click", closeDictionary);
}

// ═══════════════════════════════════════════════════════════════════════════
// Projects: a folder with project.json and audio/*.wav. Holds the Chapter (text,
// settings, pieces with their takes), the Multi Speaker scene with its lines, and
// the Montage. Saved automatically a moment after each change.
// ═══════════════════════════════════════════════════════════════════════════

const PROJECT_FORMAT = "drama-studio-project";
const LAST_PROJECT_STORAGE_KEY = "dramaStudio.lastProject";

type SavedTake = { file: string; seed?: number; stop?: string; seconds?: number };
type SavedPiece = Omit<ChapterPieceState, "result"> & { take: SavedTake | null };
type ProjectFile = {
  format: typeof PROJECT_FORMAT;
  version: 1;
  name: string;
  savedAt: number;
  tts: { text: string; voice: string };
  chapter: { settings: ChapterSettings; characters: DramaCharacter[]; pieces: SavedPiece[]; joined: string | null };
  scene: {
    scene: DramaScene;
    lines: Array<{ reply: SceneReply; take: SavedTake }>;
    linesPause: number;
    linesCharacters: DramaCharacter[];
  };
  montage: {
    clips: Array<{ id: string; label: string; speed: number; pauseAfter: number; take: SavedTake }>;
    joined: string | null;
    normalize: boolean;
    speed: number;
  };
  /** All chapters of the book; `chapter` above is the active one (kept for older versions). */
  book?: { chapters: BookChapter[]; active: number };
  subtitles?: {
    settings: SubsSettings;
    characters: DramaCharacter[];
    cues: Array<Omit<SubsCue, "take"> & { take: SavedTake | null }>;
  };
};

let currentProject: { dir: string; name: string } | null = null;
let projectLoading = false;
let projectSaving = false;
let projectSaveAgain = false;
let projectSaveTimer: number | null = null;
let projectSavedAt = 0;
/** File name → the audio last written there (compared by reference: unchanged takes are not rewritten). */
let projectWritten = new Map<string, string>();

function projectAudioPath(file: string): string {
  return `${currentProject!.dir}\\audio\\${file}`;
}

function renderProjectPanel(state?: "saving" | "error", detail?: string): void {
  setText("#project-name", currentProject ? currentProject.name : t("No project"));
  const badge = el<HTMLElement>("#project-state");
  const label = !currentProject
    ? t("Not saved")
    : state === "saving" ? t("Saving…")
    : state === "error" ? t("Error")
    : projectSavedAt ? `${t("Saved")} ${new Date(projectSavedAt).toLocaleTimeString().slice(0, 5)}` : t("Open");
  badge.textContent = label;
  badge.classList.toggle("ok", Boolean(currentProject) && state !== "error");
  el("#project-detail").textContent = detail ?? (currentProject
    ? currentProject.dir
    : t("Work is kept only until the program closes. Create a project to keep it on disk."));
  el<HTMLButtonElement>("#project-save").disabled = !currentProject;
}

/** Saves the project a moment after the last change (changes come in bursts). */
function scheduleProjectSave(delay = 1500): void {
  if (!currentProject || projectLoading) return;
  if (projectSaveTimer) window.clearTimeout(projectSaveTimer);
  projectSaveTimer = window.setTimeout(() => {
    projectSaveTimer = null;
    void saveProject();
  }, delay);
}

async function writeProjectTake(file: string, wavBase64: string): Promise<void> {
  if (projectWritten.get(file) === wavBase64) return;
  await invoke("save_binary_file", { path: projectAudioPath(file), base64Data: wavBase64 });
  projectWritten.set(file, wavBase64);
}

async function saveProject(): Promise<void> {
  if (!currentProject || projectLoading) return;
  if (projectSaving) {
    projectSaveAgain = true;
    return;
  }
  projectSaving = true;
  renderProjectPanel("saving");
  try {
    await invoke("project_prepare_dir", { dir: currentProject.dir });
    const keep: string[] = [];
    const takeOf = async (file: string, result: GenerationResult & { seed?: number; stop?: string; seconds?: number }): Promise<SavedTake> => {
      await writeProjectTake(file, result.wavBase64);
      keep.push(file);
      return { file, seed: result.seed, stop: result.stop, seconds: result.seconds };
    };

    const pieces: SavedPiece[] = [];
    for (const piece of chapterPieces) {
      const { result, ...rest } = piece;
      pieces.push({ ...rest, status: rest.status === "generating" ? "waiting" : rest.status, take: result ? await takeOf(`chapter_${piece.id}.wav`, result) : null });
    }
    ensureBook();
    const activeChapter = bookChapters[bookActive];
    const chapterJoined = chapterResult ? (await takeOf(`chapter_joined_${activeChapter.id}.wav`, chapterResult)).file : null;
    bookChapters[bookActive] = {
      ...activeChapter,
      text: el<HTMLTextAreaElement>("#chapter-text").value,
      characters: chapterCharacters,
      pieces,
      joined: chapterJoined,
    };
    bookChapters.forEach((chapter, index) => {
      if (index === bookActive) return;
      for (const piece of chapter.pieces) if (piece.take) keep.push(piece.take.file);
      if (chapter.joined) keep.push(chapter.joined);
    });

    const lines: ProjectFile["scene"]["lines"] = [];
    for (let i = 0; i < sceneLines.length; i++) {
      lines.push({ reply: sceneLines[i].reply, take: await takeOf(`scene_${i + 1}.wav`, sceneLines[i].result) });
    }

    const clips: ProjectFile["montage"]["clips"] = [];
    for (const clip of montageClips) {
      clips.push({ id: clip.id, label: clip.label, speed: clip.speed, pauseAfter: clip.pauseAfter, take: await takeOf(`montage_${clip.id}.wav`, clip.result) });
    }
    const montageJoined = montageResult ? (await takeOf("montage_joined.wav", montageResult)).file : null;

    const cues: NonNullable<ProjectFile["subtitles"]>["cues"] = [];
    for (const cue of subsCues) {
      const { take, ...rest } = cue;
      cues.push({ ...rest, status: rest.status === "generating" ? "waiting" : rest.status, take: take ? await takeOf(`subs_${cue.id}.wav`, take) : null });
    }

    const file: ProjectFile = {
      format: PROJECT_FORMAT,
      version: 1,
      name: currentProject.name,
      savedAt: Date.now(),
      tts: { text: el<HTMLTextAreaElement>("#tts-text").value, voice: el<HTMLSelectElement>("#drama-voice").value },
      chapter: { settings: readChapterSettings(), characters: chapterCharacters, pieces, joined: chapterJoined },
      scene: { scene: dramaScene, lines, linesPause: sceneLinesPause, linesCharacters: sceneLinesCharacters },
      montage: {
        clips,
        joined: montageJoined,
        normalize: el<HTMLInputElement>("#montage-normalize").checked,
        speed: parseFloat(el<HTMLInputElement>("#montage-speed").value) || 1,
      },
      subtitles: { settings: readSubsSettings(), characters: subsCharacters, cues },
      book: { chapters: bookChapters, active: bookActive },
    };
    await invoke("save_text_file", { path: `${currentProject.dir}\\project.json`, content: JSON.stringify(file, null, 1) });
    await invoke("project_cleanup_audio", { dir: currentProject.dir, keep });
    for (const name of [...projectWritten.keys()]) if (!keep.includes(name)) projectWritten.delete(name);
    projectSavedAt = file.savedAt;
    renderProjectPanel();
  } catch (e) {
    renderProjectPanel("error", `${t("Could not save the project")}: ${e}`);
  } finally {
    projectSaving = false;
    if (projectSaveAgain) {
      projectSaveAgain = false;
      scheduleProjectSave(300);
    }
  }
}

/** Puts saved pieces (and the joined chapter) of a project into the Chapter tab; returns how many files are missing. */
async function loadSavedChapter(saved: SavedPiece[], joinedFile: string | null): Promise<number> {
  let missing = 0;
  chapterPieces = [];
  for (const piece of saved) {
    const { take, ...rest } = piece;
    let result: DramaGenerationResult | null = null;
    if (take) {
      try {
        result = dramaTake(take, await readProjectTake(take, {}));
        projectWritten.set(take.file, result.wavBase64);
      } catch {
        missing += 1;
      }
    }
    chapterPieces.push({ ...rest, result, status: result ? rest.status : "waiting" });
  }
  chapterResult = null;
  el("#chapter-output").classList.add("hidden");
  if (joinedFile) {
    try {
      const joined = await readProjectTake({ file: joinedFile }, {});
      projectWritten.set(joinedFile, joined.wavBase64);
      showChapterResult(joined);
    } catch {
      missing += 1;
    }
  }
  renderChapterPieces();
  return missing;
}

async function readProjectTake<T extends object>(take: SavedTake, extra: T): Promise<GenerationResult & T> {
  const wavBase64 = await invoke<string>("read_file_base64", { path: projectAudioPath(take.file) });
  const pcm = parseWavPcm(wavBase64);
  return { sampleRate: pcm.sampleRate, channels: pcm.channels, sampleCount: pcm.samples.length, wavBase64, ...extra };
}

function dramaTake(take: SavedTake, result: GenerationResult): DramaGenerationResult {
  return {
    ...result,
    seed: take.seed ?? 0,
    stop: take.stop ?? "complete",
    seconds: take.seconds ?? result.sampleCount / result.channels / result.sampleRate,
  };
}

/** Opens the project in `dir` (a folder with project.json), replacing the current work. */
async function openProject(dir: string, quiet = false): Promise<boolean> {
  let file: ProjectFile;
  try {
    file = JSON.parse(await invoke<string>("read_text_file", { path: `${dir}\\project.json` }));
    if (file.format !== PROJECT_FORMAT) throw new Error(t("not a Drama Studio project"));
  } catch (e) {
    if (!quiet) showToast(`${t("Could not open the project")}: ${e}`, "error");
    return false;
  }
  projectLoading = true;
  currentProject = { dir, name: file.name };
  projectWritten = new Map();
  renderProjectPanel(undefined, t("Opening the project…"));
  let missing = 0;
  try {
    // TTS
    el<HTMLTextAreaElement>("#tts-text").value = file.tts?.text || "";
    el<HTMLTextAreaElement>("#tts-text").dispatchEvent(new Event("input"));
    if (file.tts?.voice) selectDramaVoice(file.tts.voice);

    // Chapter
    loadChapterSettings(file.chapter.settings);
    renderChapterCharacterTools();
    chapterCharacters = file.chapter.characters || [];
    missing += await loadSavedChapter(file.chapter.pieces || [], file.chapter.joined);
    if (file.book?.chapters?.length) {
      bookChapters = file.book.chapters;
      bookActive = Math.min(bookChapters.length - 1, Math.max(0, file.book.active || 0));
    } else {
      bookChapters = [];
      ensureBook();
    }
    renderBook();
    renderChapterPieces();

    // Scene
    dramaScene = file.scene.scene;
    saveDramaScene(dramaScene);
    renderDramaScene();
    sceneLines = [];
    for (const line of file.scene.lines || []) {
      try {
        const result = dramaTake(line.take, await readProjectTake(line.take, {}));
        projectWritten.set(line.take.file, result.wavBase64);
        sceneLines.push({ reply: line.reply, result });
      } catch {
        missing += 1;
      }
    }
    sceneLinesPause = file.scene.linesPause ?? 0.35;
    sceneLinesCharacters = file.scene.linesCharacters || [];
    renderSceneLineResults();

    // Montage
    montageClips = [];
    for (const clip of file.montage.clips || []) {
      try {
        const result = await readProjectTake(clip.take, {});
        projectWritten.set(clip.take.file, result.wavBase64);
        montageClips.push({ id: clip.id, label: clip.label, speed: clip.speed, pauseAfter: clip.pauseAfter, result });
      } catch {
        missing += 1;
      }
    }
    el<HTMLInputElement>("#montage-normalize").checked = file.montage.normalize !== false;
    el<HTMLInputElement>("#montage-speed").value = String(file.montage.speed || 1);
    el<HTMLInputElement>("#montage-speed").dispatchEvent(new Event("input"));
    montageResult = null;
    el("#montage-output").classList.add("hidden");
    if (file.montage.joined) {
      try {
        const joined = await readProjectTake({ file: file.montage.joined }, {});
        projectWritten.set(file.montage.joined, joined.wavBase64);
        showMontageResult(joined);
      } catch {
        missing += 1;
      }
    }
    renderMontage();

    // Subtitles
    loadSubsSettings(file.subtitles?.settings ?? { text: "" });
    subsCharacters = file.subtitles?.characters || [];
    subsCues = [];
    for (const saved of file.subtitles?.cues || []) {
      const { take, ...rest } = saved;
      let result: DramaGenerationResult | null = null;
      if (take) {
        try {
          result = dramaTake(take, await readProjectTake(take, {}));
          projectWritten.set(take.file, result.wavBase64);
        } catch {
          missing += 1;
        }
      }
      subsCues.push({ ...rest, take: result, status: result ? rest.status : "waiting" });
    }
    subsTrack = null;
    el("#subs-output").classList.add("hidden");
    renderSubsCues();

    localStorage.setItem(LAST_PROJECT_STORAGE_KEY, dir);
    projectSavedAt = file.savedAt;
  } finally {
    projectLoading = false;
    renderProjectPanel();
  }
  if (missing > 0) showToast(`${t("Project opened, but some takes were not found")}: ${missing}`, "warning");
  else if (!quiet) showToast(`${t("Project opened")}: ${file.name}`);
  return true;
}

/** Makes `dir` the current project with the work that is open now, and saves it. */
async function startProject(dir: string, name: string): Promise<void> {
  currentProject = { dir, name };
  projectWritten = new Map();
  projectSavedAt = 0;
  localStorage.setItem(LAST_PROJECT_STORAGE_KEY, dir);
  await saveProject();
  showToast(`${t("Project saved")}: ${name}`);
}

/** Clears the Chapter, the scene's script and lines, and the Montage (characters stay). */
function clearWorkForNewProject(): void {
  bookChapters = [];
  bookActive = 0;
  chapterPieces = [];
  chapterCharacters = [];
  chapterResult = null;
  el<HTMLTextAreaElement>("#chapter-text").value = "";
  el("#chapter-output").classList.add("hidden");
  renderChapterPieces();
  ensureBook();
  renderBook();
  dramaScene.script = "";
  persistDramaScene();
  renderDramaScene();
  sceneLines = [];
  renderSceneLineResults();
  montageClips = [];
  montageResult = null;
  el("#montage-output").classList.add("hidden");
  renderMontage();
  subsCues = [];
  subsTrack = null;
  el<HTMLTextAreaElement>("#subs-text").value = "";
  el("#subs-output").classList.add("hidden");
  renderSubsCues();
}

async function newProject(): Promise<boolean> {
  const name = await askText(t("New project"), t("Name of the project (a book, a chapter, a video):"), "");
  if (!name) return false;
  const hasWork = chapterPieces.length > 0 || sceneLines.length > 0 || montageClips.length > 0 || el<HTMLTextAreaElement>("#chapter-text").value.trim() !== "";
  if (hasWork) {
    const answer = await askChoice(t("New project"), t("Take the work that is open now into the new project, or start empty?"), [
      { value: "cancel", label: t("Cancel") },
      { value: "empty", label: t("Start empty") },
      { value: "keep", label: t("Take the current work"), primary: true },
    ]);
    if (answer === "cancel" || answer === null) return false;
    if (answer === "empty") clearWorkForNewProject();
  }
  const dir = await invoke<string>("project_default_dir", { name });
  await startProject(dir, name);
  return true;
}

async function saveProjectAs(): Promise<void> {
  const selected = await open({ directory: true, multiple: false, title: t("Folder for the project") });
  const dir = Array.isArray(selected) ? selected[0] : selected;
  if (!dir) return;
  const name = await askText(t("Save as…"), t("Name of the project:"), currentProject?.name || dir.split(/[/\\]/).pop() || "");
  if (!name) return;
  await startProject(dir, name);
}

async function openProjectDialog(): Promise<void> {
  const selected = await open({ directory: true, multiple: false, title: t("Folder of a project") });
  const dir = Array.isArray(selected) ? selected[0] : selected;
  if (!dir) return;
  if (currentProject) await saveProject();
  await openProject(dir);
}

/** Before a long run without a project: offer to create one so nothing is lost. */
async function offerProjectBeforeLongRun(): Promise<void> {
  if (currentProject) return;
  const answer = await askChoice(t("Keep the chapter on disk?"), t("Without a project, the voiced pieces are lost when the program closes. Create a project? Then every piece is saved as soon as it is voiced."), [
    { value: "no", label: t("Without a project") },
    { value: "yes", label: t("Create a project"), primary: true },
  ]);
  if (answer === "yes") await newProject();
}

function initProjects(): void {
  el("#project-new").addEventListener("click", () => void newProject());
  el("#project-open").addEventListener("click", () => void openProjectDialog());
  el("#project-save").addEventListener("click", () => void saveProject());
  el("#project-save-as").addEventListener("click", () => void saveProjectAs());
  renderProjectPanel();
  const last = localStorage.getItem(LAST_PROJECT_STORAGE_KEY);
  if (last) void openProject(last, true);
}

function initMontage(): void {
  try {
    el<HTMLInputElement>("#montage-normalize").checked = localStorage.getItem(MONTAGE_NORMALIZE_STORAGE_KEY) !== "false";
  } catch {
    // Default stays on.
  }
  el("#montage-normalize").addEventListener("change", (event) => {
    localStorage.setItem(MONTAGE_NORMALIZE_STORAGE_KEY, String((event.target as HTMLInputElement).checked));
  });
  el<HTMLInputElement>("#montage-speed").addEventListener("input", (event) => {
    el("#montage-val-speed").textContent = `${parseFloat((event.target as HTMLInputElement).value).toFixed(2)}×`;
  });
  el("#montage-add-result").addEventListener("click", () => {
    if (!lastResult) {
      showToast(t("No result yet"), "warning");
      return;
    }
    addMontageClip(history[0]?.label || t("Result"), lastResult, "result");
  });
  el("#montage-add-history").addEventListener("click", () => {
    const id = el<HTMLSelectElement>("#montage-history-select").value;
    const entry = history.find((h) => h.id === id);
    if (entry) addMontageClip(entry.label, historyEntryResult(entry), "history");
  });
  el("#montage-add-file").addEventListener("click", () => void addMontageFiles());
  el("#montage-clear").addEventListener("click", () => {
    montageClips = [];
    montageClipPlayer.pause();
    montagePlayingId = "";
    renderMontage();
  });
  el("#montage-join").addEventListener("click", () => void joinMontage());

  const list = el<HTMLElement>("#montage-list");
  list.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    const clip = montageClips.find((c) => c.id === input.closest<HTMLElement>(".montage-row")?.dataset.id);
    if (!clip) return;
    if (input.dataset.field === "label") clip.label = input.value;
    if (input.dataset.field === "speed") {
      clip.speed = Math.min(SPEED_MAX, Math.max(SPEED_MIN, parseFloat(input.value) || 1));
      renderMontage();
    }
    if (input.dataset.field === "pause") clip.pauseAfter = Math.min(10, Math.max(0, parseFloat(input.value) || 0));
  });
  list.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-action]");
    if (!button) return;
    const index = montageClips.findIndex((c) => c.id === button.closest<HTMLElement>(".montage-row")?.dataset.id);
    const clip = montageClips[index];
    if (!clip) return;
    const action = button.dataset.action;
    if (action === "play") {
      void playMontageClip(clip);
    } else if (action === "edit") {
      editAudio(clip.label, clip.result.wavBase64, (edited) => {
        clip.result = edited;
        renderMontage();
      });
    } else if (action === "remove") {
      montageClips.splice(index, 1);
      renderMontage();
    } else {
      const target = action === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= montageClips.length) return;
      [montageClips[index], montageClips[target]] = [montageClips[target], montageClips[index]];
      renderMontage();
    }
  });

  montageWave = makeWavePanel("#montage-audio", showMontageResult);
  el("#montage-edit").addEventListener("click", () => {
    if (!montageResult) return;
    editAudio(t("Joined track"), montageResult.wavBase64, (edited) => showMontageResult(edited));
  });
  el("#montage-save-wav").addEventListener("click", () => {
    if (montageResult) void saveResultToFile(montageResult, "montage", "wav");
  });
  el("#montage-save-mp3").addEventListener("click", () => {
    if (montageResult) void saveResultToFile(montageResult, "montage", "mp3");
  });
  el("#montage-to-history").addEventListener("click", () => {
    if (!montageResult) return;
    addHistory("montage", `${t("Montage")}: ${montageClips.map((c) => c.label).join(" + ").slice(0, 60)}`, montageResult);
    showToast(t("Added to history"));
  });

  el("#output-to-montage-btn").addEventListener("click", () => {
    if (!lastResult) return;
    const label = history[0]?.label || modeLabel(isGenerationMode(currentMode) ? currentMode : "tts");
    addMontageClip(label, lastResult, "result");
  });
  el("#scene-lines-to-montage").addEventListener("click", () => {
    if (sceneLines.length === 0) return;
    sceneLines.forEach((line, i) => {
      const name = sceneLinesCharacters[line.reply.character]?.name || "";
      const clip = { label: `${i + 1}. ${name}: ${line.reply.text}`.slice(0, 80), result: line.result };
      addMontageClip(clip.label, clip.result, "scene", true);
      montageClips[montageClips.length - 1].pauseAfter = sceneLinesPause;
    });
    renderMontage();
    showToast(`${t("Added to montage")}: ${sceneLines.length}`);
  });
  renderMontage();
  renderMontageHistorySelect();
}

// ═══════════════════════════════════════════════════════════════════════════
// Download flow
// ═══════════════════════════════════════════════════════════════════════════

function modelDownloadTarget(url: string): { destDir: string; filename: string | null } {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/models\/([^/]+)\/([^/]+)$/);
    if (match) {
      return {
        destDir: `models/${decodeURIComponent(match[1])}`,
        filename: decodeURIComponent(match[2]),
      };
    }
  } catch {
    // The backend will report the invalid URL. Keep the fallback target simple.
  }
  return { destDir: "models", filename: null };
}

// Base URL (folder) of a file URL — used to fetch sibling config/tokenizer
// assets that live next to a pasted .gguf weight file.
function modelBaseUrl(url: string): string | null {
  const clean = url.split("?")[0];
  const idx = clean.lastIndexOf("/");
  return idx > 0 ? clean.slice(0, idx) : null;
}

function updateDownloadIndicator(status: DownloadProgressEvent["status"] = downloadPaused ? "paused" : "running"): void {
  const button = document.querySelector<HTMLButtonElement>("#download-status-button");
  if (button) {
    button.classList.toggle("hidden", !downloadActive);
    button.classList.toggle("downloading", downloadActive && status === "running");
    button.classList.toggle("paused", downloadActive && status === "paused");
    button.title = status === "paused" ? "Download paused. Click to reopen." : "Download running. Click to reopen.";
  }

  const fetchButton = document.querySelector<HTMLButtonElement>("#download-fetch-btn");
  const pauseButton = document.querySelector<HTMLButtonElement>("#download-pause-btn");
  const resumeButton = document.querySelector<HTMLButtonElement>("#download-resume-btn");
  const stopButton = document.querySelector<HTMLButtonElement>("#download-stop-btn");
  if (fetchButton) fetchButton.disabled = downloadActive;
  if (pauseButton) pauseButton.disabled = !downloadActive || status === "paused";
  if (resumeButton) resumeButton.disabled = !downloadActive || status !== "paused";
  if (stopButton) stopButton.disabled = !downloadActive;
}

function initDownload(): void {
  const trigger = el<HTMLButtonElement>("#download-trigger");
  const whisperTrigger = el<HTMLButtonElement>("#whisper-download-trigger");
  const engineTrigger = el<HTMLButtonElement>("#download-engine-btn");
  const statusButton = el<HTMLButtonElement>("#download-status-button");
  const popover = el<HTMLDivElement>("#download-popover");
  const urlInput = el<HTMLInputElement>("#download-url-input");
  const title = el<HTMLElement>("#download-title");
  const presetRow = el<HTMLElement>("#download-model-preset-row");
  const presetSelect = el<HTMLSelectElement>("#download-model-preset");
  const progressContainer = el<HTMLElement>("#download-progress-container");
  const fetchButton = el<HTMLButtonElement>("#download-fetch-btn");
  const pauseButton = el<HTMLButtonElement>("#download-pause-btn");
  const resumeButton = el<HTMLButtonElement>("#download-resume-btn");
  const stopButton = el<HTMLButtonElement>("#download-stop-btn");
  populateTtsDownloadPresetSelect();

  const setOpen = (open: boolean, kind: DownloadKind = activeDownloadKind) => {
    if (downloadActive) {
      kind = activeDownloadKind;
    }
    activeDownloadKind = kind;
    const whisperPreset = selectedWhisperPreset();
    title.textContent = kind === "whisper"
      ? t("Download Parakeet Model")
      : kind === "engine"
        ? t("Download Engine DLLs")
        : t("Download Model");
    urlInput.placeholder = kind === "whisper"
      ? t("Parakeet ONNX model repo…")
      : kind === "engine"
        ? t("Engine package URL…")
        : t("Paste HuggingFace GGUF URL…");
    presetRow.classList.toggle("hidden", kind !== "model");
    if (kind === "whisper") {
      // A Parakeet variant is a folder of files, not a single URL. Show the repo
      // folder for reference; the actual file set is resolved on fetch.
      urlInput.value = WHISPER_MODEL_TREE_URL;
      urlInput.title = `${whisperPreset.label} → ${whisperPresetDestDir(whisperPreset)} (${whisperPreset.files.length} files)`;
    } else if (kind === "engine") {
      urlInput.value = ENGINE_PACKAGE_URL;
      urlInput.title = "Downloads audiocpp_engine.dll plus required CUDA/MSVC runtime DLLs";
    } else {
      setTtsDownloadPreset(inferTtsPresetFromModelSelection(), !downloadActive);
    }
    popover.hidden = !open;
    updateDownloadIndicator();
  };

  const startDownload = async (kind: DownloadKind, url: string) => {
    if (downloadActive) {
      showToast("A download is already running. Use Pause, Resume, or Stop.", "warning");
      setOpen(true, activeDownloadKind);
      return;
    }
    activeDownloadKind = kind;
    downloadActive = true;
    downloadPaused = false;
    progressContainer.classList.remove("hidden");
    setProgress("#download-progress-bar", 0, 1);
    setText("#download-size-text", "0 / 0");
    setText("#download-speed-text", "0 MB/s");
    activeDownloadFileLabel = "";
    updateDownloadIndicator("running");

    try {
      if (kind === "engine") {
        const result = await invoke<{ path: string; size: number }>("download_engine_dll", { url });
        showToast(`Engine DLLs downloaded: ${result.path}`);
      } else if (kind === "whisper") {
        // Fetch the WHOLE ONNX file set into the variant folder. Downloading just
        // one file (e.g. the encoder without vocab.txt) makes the model fail to
        // load — same class of bug as the Higgs "missing config" case below.
        const preset = selectedWhisperPreset();
        const destDir = whisperPresetDestDir(preset);
        const entries = whisperPresetEntries(preset);
        let modelFolder = "";
        for (let index = 0; index < entries.length; index += 1) {
          const entry = entries[index];
          activeDownloadFileLabel = `File ${index + 1}/${entries.length}: ${entry.filename}`;
          setText("#download-speed-text", `${activeDownloadFileLabel} · 0 MB/s`);
          const result = await invoke<{ path: string; size: number }>("download_model", {
            request: { url: entry.url, destDir, filename: entry.filename },
          });
          // The model path is the FOLDER (parent of each downloaded file).
          if (!modelFolder) {
            modelFolder = result.path.replace(/[/\\][^/\\]+$/, "");
          }
        }
        localStorage.setItem("higgsAudio.whisperPreset", preset.id);
        if (modelFolder) setWhisperModelPath(modelFolder);
        showToast("Parakeet model downloaded");
      } else {
        const selectedPreset = ttsPresetById(presetSelect.value);
        const preset = ttsPresetFromModelDownloadUrl(url) ||
          (url === ttsPresetUrl(selectedPreset) ? selectedPreset : null);
        if (preset) {
          const entries = ttsPresetPackageEntries(preset);
          for (let index = 0; index < entries.length; index += 1) {
            const entry = entries[index];
            activeDownloadFileLabel = `File ${index + 1}/${entries.length}: ${entry.filename}`;
            setText("#download-speed-text", `${activeDownloadFileLabel} · 0 MB/s`);
            await invoke<{ path: string; size: number }>("download_model", {
              request: { url: entry.url, destDir: entry.destDir, filename: entry.filename },
            });
          }
          showToast(`${preset.label} folder downloaded`);
        } else {
          const target = modelDownloadTarget(url);
          // Always fetch the WHOLE model folder, not just the .gguf. The engine
          // needs config.json + the tokenizer files next to the weights or it
          // fails to load with "missing config". A pasted GGUF URL that doesn't
          // match a built-in preset used to download only the .gguf — this is
          // the root cause of the "downloaded but won't load" bug.
          const base = modelBaseUrl(url);
          const looksLikeGguf = /\.gguf(?:$|\?)/i.test(url);
          const entries: Array<{ url: string; destDir: string; filename: string | null }> = [
            { url, destDir: target.destDir, filename: target.filename },
          ];
          if (base && looksLikeGguf && target.destDir.startsWith("models/")) {
            for (const asset of HIGGS_MODEL_ASSET_FILES) {
              entries.push({ url: `${base}/${asset}`, destDir: target.destDir, filename: asset });
            }
          }
          for (let index = 0; index < entries.length; index += 1) {
            const entry = entries[index];
            activeDownloadFileLabel = `File ${index + 1}/${entries.length}: ${entry.filename ?? ""}`;
            setText("#download-speed-text", `${activeDownloadFileLabel} · 0 MB/s`);
            try {
              await invoke<{ path: string; size: number }>("download_model", {
                request: { url: entry.url, destDir: entry.destDir, filename: entry.filename },
              });
            } catch (assetErr) {
              // The weights (index 0) are mandatory; a missing sidecar asset
              // (some repos omit one) should warn, not abort the whole folder.
              if (index === 0) throw assetErr;
              console.warn(`Optional model asset failed: ${entry.url}`, assetErr);
            }
          }
          showToast(entries.length > 1 ? "Model folder downloaded" : "Download complete");
        }
        await refreshModelList();
      }
    } catch (e) {
      const message = String(e);
      if (message.toLowerCase().includes("cancel")) {
        showToast("Download stopped", "warning");
      } else {
        showToast(`Download failed: ${e}`, "error");
      }
    } finally {
      downloadActive = false;
      downloadPaused = false;
      activeDownloadFileLabel = "";
      updateDownloadIndicator("complete");
    }
  };

  trigger.addEventListener("click", (e) => { e.stopPropagation(); setOpen(popover.hidden, "model"); });
  whisperTrigger.addEventListener("click", (e) => { e.stopPropagation(); setOpen(popover.hidden, "whisper"); });
  engineTrigger.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(true, "engine");
    void startDownload("engine", ENGINE_PACKAGE_URL);
  });
  statusButton.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(true, activeDownloadKind);
  });

  presetSelect.addEventListener("change", () => {
    setTtsDownloadPreset(ttsPresetById(presetSelect.value), true);
  });

  const dlClose = document.querySelector<HTMLElement>("#download-close");
  if (dlClose) dlClose.addEventListener("click", (e) => { e.stopPropagation(); setOpen(false); });
  document.addEventListener("pointerdown", (event) => {
    const target = event.target as Node;
    if (!popover.hidden && !popover.contains(target) && !trigger.contains(target) && !whisperTrigger.contains(target) && !engineTrigger.contains(target) && !statusButton.contains(target)) {
      setOpen(false);
    }
  });

  pauseButton.addEventListener("click", async () => {
    await invoke("download_control", { action: "pause" });
    downloadPaused = true;
    updateDownloadIndicator("paused");
  });
  resumeButton.addEventListener("click", async () => {
    await invoke("download_control", { action: "resume" });
    downloadPaused = false;
    updateDownloadIndicator("running");
  });
  stopButton.addEventListener("click", async () => {
    await invoke("download_control", { action: "cancel" });
    downloadPaused = false;
    updateDownloadIndicator("cancelled");
  });

  fetchButton.addEventListener("click", async () => {
    const url = urlInput.value.trim();
    if (!url) {
      showToast(activeDownloadKind === "whisper" ? "Enter a Parakeet model URL" : "Enter a HuggingFace URL", "warning");
      return;
    }
    await startDownload(activeDownloadKind, url);
  });

  updateDownloadIndicator("complete");
}

// ═══════════════════════════════════════════════════════════════════════════
// Hardware monitor (port from SAM3DBody)
// ═══════════════════════════════════════════════════════════════════════════

const hardwareCanvas = document.querySelector<HTMLCanvasElement>("#hardware-graph")!;
const hardwareCtx = hardwareCanvas.getContext("2d")!;

function setMeter(barId: string, textId: string, current: number, total: number, text: string): void {
  setProgress(barId, current, total || current || 1);
  setText(textId, text);
}

function updateHardware(snapshot: HardwareSnapshot): void {
  hardwareHistory.push(snapshot);
  if (hardwareHistory.length > hardwareHistoryLimit) hardwareHistory.shift();

  setText("#hardware-detail", `${snapshot.gpuName} | ${snapshot.temperature || "−"} C | app RAM ${formatBytes(snapshot.processRam)}`);

  setMeter("#hw-vram-bar", "#hw-vram-text",
    snapshot.usedVram, snapshot.totalVram,
    `${formatBytes(snapshot.usedVram)} / ${formatBytes(snapshot.totalVram)}`);

  setMeter("#hw-gpu-bar", "#hw-gpu-text",
    snapshot.gpuUtilization, 100,
    `${snapshot.gpuUtilization || 0}%`);

  setMeter("#hw-power-bar", "#hw-power-text",
    snapshot.powerDraw, snapshot.powerLimit,
    snapshot.powerLimit ? `${snapshot.powerDraw.toFixed(0)} / ${snapshot.powerLimit.toFixed(0)} W` : "−");

  setMeter("#hw-ram-bar", "#hw-ram-text",
    snapshot.usedRam, snapshot.totalRam,
    `${formatBytes(snapshot.usedRam)} / ${formatBytes(snapshot.totalRam)}`);

  drawHardwareGraph();
}

function drawHardwareGraph(): void {
  const rect = hardwareCanvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (hardwareCanvas.width !== Math.floor(width * dpr)) {
    hardwareCanvas.width = Math.floor(width * dpr);
    hardwareCanvas.height = Math.floor(height * dpr);
  }
  hardwareCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  hardwareCtx.clearRect(0, 0, width, height);
  hardwareCtx.fillStyle = cssVar("--bg-inner", "#0d1013");
  hardwareCtx.fillRect(0, 0, width, height);

  const labelWidth = 38;
  const plotX = labelWidth;
  const plotWidth = Math.max(1, width - labelWidth - 4);

  // Grid lines + labels
  hardwareCtx.font = "10px Inter, sans-serif";
  hardwareCtx.fillStyle = cssVar("--text-muted", "#9ea8b3");
  hardwareCtx.textAlign = "right";
  hardwareCtx.textBaseline = "middle";
  for (const [pct, label] of [[1, "100%"], [0.5, "50%"], [0, "0%"]] as const) {
    const y = Math.round(height - pct * height) + 0.5;
    hardwareCtx.fillText(label, labelWidth - 7, Math.max(8, Math.min(height - 8, y)));
  }
  hardwareCtx.strokeStyle = cssVar("--border", "#1f262d");
  hardwareCtx.lineWidth = 1;
  for (const pct of [0, 0.25, 0.5, 0.75, 1]) {
    const y = Math.round(height * pct) + 0.5;
    hardwareCtx.beginPath();
    hardwareCtx.moveTo(plotX, y);
    hardwareCtx.lineTo(width, y);
    hardwareCtx.stroke();
  }

  // Determine visible window based on viewOffset
  const totalLen = hardwareHistory.length;
  const visibleStart = hardwareFollowLive
    ? Math.max(0, totalLen - hardwareGraphPoints)
    : Math.max(0, Math.min(totalLen - hardwareGraphPoints, totalLen - hardwareGraphPoints - hardwareViewOffset));
  const visibleEnd = Math.min(totalLen, visibleStart + hardwareGraphPoints);

  drawHardwareLine(plotX, plotWidth, height, "#e0a12b", (s) => s.totalVram ? s.usedVram / s.totalVram : 0, visibleStart, visibleEnd);
  drawHardwareLine(plotX, plotWidth, height, "#25b8ab", (s) => s.gpuUtilization / 100, visibleStart, visibleEnd);
  drawHardwareLine(plotX, plotWidth, height, "#c56cf0", (s) => s.powerLimit ? s.powerDraw / s.powerLimit : 0, visibleStart, visibleEnd);
  drawHardwareLine(plotX, plotWidth, height, "#6aa6ff", (s) => s.totalRam ? s.usedRam / s.totalRam : 0, visibleStart, visibleEnd);

  // Hover crosshair
  if (hardwareHover && !hardwareScrubDrag) {
    const hoverIdx = visibleStart + hardwareHover.idx;
    if (hoverIdx >= 0 && hoverIdx < totalLen) {
      const x = plotX + (hardwareHover.idx / Math.max(1, hardwareGraphPoints - 1)) * plotWidth;
      hardwareCtx.strokeStyle = cssVar("--text-muted", "#9ea8b3");
      hardwareCtx.lineWidth = 1;
      hardwareCtx.setLineDash([3, 3]);
      hardwareCtx.beginPath();
      hardwareCtx.moveTo(x, 0);
      hardwareCtx.lineTo(x, height);
      hardwareCtx.stroke();
      hardwareCtx.setLineDash([]);

      // Dots at each line's value for the hovered sample
      const snap = hardwareHistory[hoverIdx];
      const drawDot = (color: string, val: number) => {
        const y = height - Math.min(1, Math.max(0, val)) * height;
        hardwareCtx.fillStyle = color;
        hardwareCtx.beginPath();
        hardwareCtx.arc(x, y, 3, 0, Math.PI * 2);
        hardwareCtx.fill();
      };
      drawDot("#e0a12b", snap.totalVram ? snap.usedVram / snap.totalVram : 0);
      drawDot("#25b8ab", snap.gpuUtilization / 100);
      drawDot("#c56cf0", snap.powerLimit ? snap.powerDraw / snap.powerLimit : 0);
      drawDot("#6aa6ff", snap.totalRam ? snap.usedRam / snap.totalRam : 0);

      // Tooltip text in the detail line
      setText("#hardware-detail",
        `${formatBytes(snap.usedVram)} VRAM · ${snap.gpuUtilization.toFixed(0)}% GPU · ${snap.powerDraw.toFixed(0)}W` +
        (hardwareFollowLive ? "" : "  ◀ scrubbed"));
    }
  } else if (!hardwareFollowLive) {
    setText("#hardware-detail", `◀ Scrubbed view — drag to navigate, release at right edge to resume live`);
  }
}

function drawHardwareLine(
  start: number, width: number, height: number, color: string,
  valueFor: (sample: HardwareSnapshot) => number,
  visStart: number, visEnd: number,
): void {
  const count = visEnd - visStart;
  if (count < 2) return;
  const step = width / Math.max(1, hardwareGraphPoints - 1);
  hardwareCtx.beginPath();
  hardwareCtx.strokeStyle = color;
  hardwareCtx.lineWidth = 1.8;
  for (let i = 0; i < count; i++) {
    const sample = hardwareHistory[visStart + i];
    const value = Math.min(1, Math.max(0, valueFor(sample)));
    const x = start + step * i;
    const y = height - value * height;
    if (i === 0) hardwareCtx.moveTo(x, y);
    else hardwareCtx.lineTo(x, y);
  }
  hardwareCtx.stroke();
}

function scheduleGraphRedraw(): void {
  requestAnimationFrame(() => drawHardwareGraph());
}

function initHardwareScrubbing(): void {
  hardwareCanvas.style.cursor = "crosshair";

  hardwareCanvas.addEventListener("mousemove", (e) => {
    const rect = hardwareCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const plotX = 38;
    const plotWidth = Math.max(1, rect.width - plotX - 4);
    const slotIdx = Math.round(((x - plotX) / plotWidth) * (hardwareGraphPoints - 1));

    if (hardwareScrubDrag) {
      // Dragging — adjust viewOffset
      const dxPx = e.clientX - hardwareScrubDrag.startX;
      const ptsPerPx = hardwareGraphPoints / Math.max(1, plotWidth);
      const maxOffset = Math.max(0, hardwareHistory.length - hardwareGraphPoints);
      hardwareViewOffset = Math.max(0, Math.min(maxOffset,
        Math.round(hardwareScrubDrag.startOffset + dxPx * ptsPerPx)));
      scheduleGraphRedraw();
    } else {
      // Hovering — show crosshair
      const visStart = hardwareFollowLive
        ? Math.max(0, hardwareHistory.length - hardwareGraphPoints)
        : Math.max(0, Math.min(hardwareHistory.length - hardwareGraphPoints, hardwareHistory.length - hardwareGraphPoints - hardwareViewOffset));
      hardwareHover = { x, idx: Math.max(0, Math.min(hardwareGraphPoints - 1, slotIdx)) };
      scheduleGraphRedraw();
    }
  });

  hardwareCanvas.addEventListener("mouseleave", () => {
    if (!hardwareScrubDrag) {
      hardwareHover = null;
      scheduleGraphRedraw();
    }
  });

  hardwareCanvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    hardwareScrubDrag = { startX: e.clientX, startOffset: hardwareViewOffset };
    hardwareFollowLive = false;
    hardwareHover = null;
    hardwareCanvas.style.cursor = "grabbing";
  });

  document.addEventListener("mousemove", (e) => {
    if (!hardwareScrubDrag) return;
    const rect = hardwareCanvas.getBoundingClientRect();
    const plotWidth = Math.max(1, rect.width - 38 - 4);
    const dxPx = e.clientX - hardwareScrubDrag.startX;
    const ptsPerPx = hardwareGraphPoints / Math.max(1, plotWidth);
    const maxOffset = Math.max(0, hardwareHistory.length - hardwareGraphPoints);
    hardwareViewOffset = Math.max(0, Math.min(maxOffset,
      Math.round(hardwareScrubDrag.startOffset + dxPx * ptsPerPx)));
    scheduleGraphRedraw();
  });

  document.addEventListener("mouseup", () => {
    if (!hardwareScrubDrag) return;
    hardwareScrubDrag = null;
    hardwareCanvas.style.cursor = "crosshair";
    // Release near right edge → resume live
    if (hardwareViewOffset <= 1) {
      hardwareViewOffset = 0;
      hardwareFollowLive = true;
    }
    drawHardwareGraph();
  });
}

async function pollHardware(): Promise<void> {
  try {
    const snapshot = await invoke<HardwareSnapshot>("hardware_snapshot");
    updateHardware(snapshot);
  } catch {
    // ignore
  } finally {
    setTimeout(pollHardware, hardwarePollMs);
  }
}

function initHardwarePollRate(): void {
  const select = el<HTMLSelectElement>("#hardware-poll-rate");
  if (![250, 500, 1000, 1500].includes(hardwarePollMs)) hardwarePollMs = 1000;
  select.value = String(hardwarePollMs);
  select.addEventListener("change", () => {
    hardwarePollMs = parseInt(select.value, 10) || 1000;
    localStorage.setItem("higgsAudio.hardwarePollMs", String(hardwarePollMs));
  });
}

function initHardwareCollapse(): void {
  const panel = el<HTMLElement>("#hardware-panel");
  const toggle = el<HTMLButtonElement>("#hardware-toggle");
  toggle.addEventListener("click", () => {
    const collapsed = panel.classList.toggle("collapsed");
    toggle.textContent = collapsed ? "+" : "−";
    toggle.setAttribute("aria-label", collapsed ? "Expand hardware" : "Collapse hardware");
    drawHardwareGraph();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Event listeners (Tauri events from backend)
// ═══════════════════════════════════════════════════════════════════════════

async function initEventListeners(): Promise<void> {
  await listen<ModelStatusEvent>("model-status", (event) => {
    const status = event.payload;
    engineSupportsStreaming = Boolean(status.supportsStreaming);
    setText("#engine-chip", status.engineLoaded ? t("Engine loaded") : t("Engine unloaded"));
    el<HTMLElement>("#engine-chip").classList.toggle("active", status.engineLoaded);

    if (!status.modelLoaded) {
      setText("#model-state", t("Not loaded"));
      el("#model-state").classList.remove("ok");
      setText("#model-chip", t("No model"));
      el("#model-chip").classList.add("muted");
      el("#model-chip").classList.remove("active");
      el<HTMLButtonElement>("#unload-model-btn").disabled = true;
    } else if (status.displayName) {
      const uiName = selectedModelUiName();
      setText("#model-state", t("Loaded"));
      el("#model-state").classList.add("ok");
      setText("#model-chip", `${uiName} (${status.weightType || "default"})`);
      el("#model-chip").classList.remove("muted");
      el("#model-chip").classList.add("active");
      el<HTMLButtonElement>("#unload-model-btn").disabled = false;
    }
    // The topbar chips show the engine in use.
    if (activeEngine === "drama") renderDramaChips();
  });

  await listen<DramaStatus>("drama-status", (event) => {
    if (event.payload.phase === "loading") return;
    dramaStatus = event.payload;
    renderDramaStatus();
  });

  await listen<{ seconds: number }>("drama-progress", (event) => {
    if (!isGenerating || activeGenerationJob?.engine !== "drama") return;
    setGenerationElapsedLabel(`${dramaPartLabel}${t("Audio ready")}: ${event.payload.seconds.toFixed(1)} ${t("s")} · ${t("elapsed")}`);
  });

  await listen<ProgressEvent>("generation-progress", (event) => {
    const p = event.payload;
    const bar = el<HTMLElement>("#gen-progress-bar");
    const phase = p.phase.toLowerCase();
    const step = generationStepForPhase(phase);
    updateGenerationStep(step, step - 1);
    if (p.total > 1) {
      bar.classList.remove("indeterminate");
      setProgress("#gen-progress-bar", p.current, p.total);
    } else {
      bar.classList.add("indeterminate");
    }
    setGenerationElapsedLabel();
  });

  await listen<GenerationAudioChunkEvent>("generation-audio-chunk", (event) => {
    scheduleLiveAudioChunk(event.payload);
  });

  await listen<StudioJobEvent>("studio-job", (event) => {
    const job = event.payload;
    externalStudioJobs.set(job.id, job);
    renderQueuePanel();
    if (!isLiveStudioJob(job)) {
      window.setTimeout(() => {
        const latest = externalStudioJobs.get(job.id);
        if (latest && latest.status === job.status) {
          externalStudioJobs.delete(job.id);
          renderQueuePanel();
        }
      }, 5000);
    }
  });

  await listen<DownloadProgressEvent>("download-progress", (event) => {
    const p = event.payload;
    setProgress("#download-progress-bar", p.downloaded, p.total);
    setText("#download-size-text", `${formatBytes(p.downloaded)} / ${formatBytes(p.total)}`);
    downloadPaused = p.status === "paused";
    if (p.status === "paused") {
      setText("#download-speed-text", activeDownloadFileLabel ? `${activeDownloadFileLabel} · Paused` : "Paused");
    } else if (p.status === "cancelled") {
      setText("#download-speed-text", "Stopped");
    } else if (p.status === "complete") {
      setText("#download-speed-text", activeDownloadFileLabel ? `${activeDownloadFileLabel} · Complete` : "Complete");
    } else {
      const speed = `${p.speedMbps.toFixed(1)} MB/s`;
      setText("#download-speed-text", activeDownloadFileLabel ? `${activeDownloadFileLabel} · ${speed}` : speed);
    }
    updateDownloadIndicator(p.status);
  });

  // Очистка голоса: показать статус, пока сепаратор гоняет референс.
  await listen<{ phase: string; message?: string }>("voiceclean-progress", (event) => {
    const { phase, message } = event.payload;
    if (phase === "cleaning") showToast(t("Cleaning voice…"));
    else if (phase === "error") showToast(`${t("Voice cleaning failed, using reference as-is")}: ${message ?? ""}`, "warning");
  });

  await listen<ApiLogEvent>("api-log", (event) => {
    appendApiLog(event.payload);
    if (!apiRunning && event.payload.kind === "server" && event.payload.method === "START") {
      apiRunning = true;
      setApiVisualStatus("running", "Running");
    } else if (event.payload.kind === "server" && event.payload.method === "STOP") {
      apiRunning = false;
      setApiVisualStatus("stopped", "Stopped");
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Text input char counting
// ═══════════════════════════════════════════════════════════════════════════

function initTextCounting(): void {
  const ttsText = el<HTMLTextAreaElement>("#tts-text");
  const ttsCount = el<HTMLElement>("#tts-count");
  ttsText.addEventListener("input", () => {
    ttsCount.textContent = String(ttsText.value.length);
    scheduleProjectSave(3000);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Bootstrap
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  clearApiLogsForFreshSession();
  initTooltips();
  initSettings();
  initExternalLinks();
  initEngineDiagnosticModal();
  initWhisperPanel();
  initModeTabs();
  initApiPanel();
  initModelPanel();
  initDropzones();
  initSpeakerPersonas();
  initMultiSpeakerWorkflow();
  initTauriDropzones();
  initAdvancedOptions();
  initDramaEngine();
  initAudioEditing();
  initMontage();
  initSpeakerExtras();
  initVoiceMixAndLock();
  initChapter();
  initBook();
  initFoundVoices();
  initVoiceStudio();
  initSubtitles();
  initVideo();
  initProjects();
  initDictionary();
  initAudiobookExport();
  // Dev builds only (tauri dev): lets headless UI checks add fragments without the file dialog.
  if (import.meta.env.DEV) {
    (window as unknown as { __dramaStudioTest: unknown }).__dramaStudioTest = {
      addMontageClip,
      lastResult: () => lastResult,
      exportBookM4b,
      confirmDramaVram: () => confirmDramaVram(dramaPathsFromInputs().modelPath, dramaPathsFromInputs().device),
      montageResult: () => montageResult,
      applyGalleryReference,
      addSpeakerExtraRecordings,
      sceneLineAudio: () => sceneLines.map((l) => l.result.wavBase64),
      setVideo: (path: string) => {
        videoPath = path;
        const video = el<HTMLVideoElement>("#video-preview");
        video.src = convertFileSrc(path);
        video.classList.remove("hidden");
        video.load();
      },
      setVideoTrackFile: async (path: string) => {
        videoFileTrack = await invoke<GenerationResult>("read_audio_as_wav", { audioPath: path });
        el<HTMLSelectElement>("#video-track-source").value = "file";
        await refreshVideoTrack();
      },
      videoFfmpeg: () => videoFfmpeg,
      personas: () => speakerPersonas.map((p) => ({ id: p.id, name: p.name, refPath: p.refPath, refText: p.refText })),
    };
  }
  initGenerate();
  initAudioPlayer();
  initBatchTab();
  initTranscriptTab();
  setupRecLevelListener();
  void populateMicSelects();
  initDownload();
  initSetupWizard();
  initTextCounting();
  initHardwarePollRate();
  initHardwareCollapse();
  initHardwareScrubbing();
  await initEventListeners();

  renderHistory();
  pollHardware();

  // Auto-load engine AND the last-used model on startup, so the app is ready to
  // generate without clicking Load Engine / Load Model by hand.
  void autoStartupLoad();
  window.setTimeout(() => void maybeShowSetupWizard(), 500);

  window.addEventListener("resize", () => {
    drawHardwareGraph();
    drawWaveform();
    redrawAllRefPreviews();
  });
}

document.addEventListener("contextmenu", (e) => e.preventDefault());

// Localize the static markup before any init runs (default language: Russian).
document.documentElement.lang = getLang();
translateStaticDom();

if (new URLSearchParams(window.location.search).get("popout") === "api-command-centre") {
  void initApiCommandPopout();
} else {
  main();
}
