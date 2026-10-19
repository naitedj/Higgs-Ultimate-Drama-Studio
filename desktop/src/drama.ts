// ─────────────────────────────────────────────────────────────────────────────
// Drama 3 (speech.cpp): settings, saved voice files and remark tags.
//
// The backend side lives in src-tauri/src/speech_engine.rs; main.ts wires these
// pieces into the UI. Option names are speech.cpp's own (top_k, max_seconds…), so
// they go to drama_generate as-is.
// ─────────────────────────────────────────────────────────────────────────────

export type EngineKind = "drama" | "higgs";

export const ENGINE_KIND_STORAGE_KEY = "dramaStudio.engine";
export const DRAMA_OPTIONS_STORAGE_KEY = "dramaStudio.dramaOptions";
export const DRAMA_LIBRARY_PATH_STORAGE_KEY = "dramaStudio.speechDllPath";
export const DRAMA_MODEL_PATH_STORAGE_KEY = "dramaStudio.dramaModelPath";
export const DRAMA_DEVICE_STORAGE_KEY = "dramaStudio.dramaDevice";
export const DRAMA_VOICE_FILES_STORAGE_KEY = "dramaStudio.voiceFiles";
export const DRAMA_SELECTED_VOICE_STORAGE_KEY = "dramaStudio.selectedVoice";

export type DramaOptions = {
  /** Empty = a random seed each time; the one used is shown after generation. */
  seed: string;
  topK: number;
  topP: number;
  temperature: number;
  maxSeconds: number;
  expertsOnCpu: boolean;
};

// top_k 4097 = no limit (top_p still applies). The model's own 30 makes it stall in
// "silence codes" for 10+ seconds on pauses.
export const DRAMA_DEFAULT_OPTIONS: DramaOptions = {
  seed: "",
  topK: 4097,
  topP: 0.9,
  temperature: 1,
  maxSeconds: 47.6,
  expertsOnCpu: true,
};

export const DRAMA_MAX_SECONDS_LIMIT = 95.1;

export function getEngineKind(): EngineKind {
  return localStorage.getItem(ENGINE_KIND_STORAGE_KEY) === "higgs" ? "higgs" : "drama";
}

export function setEngineKind(kind: EngineKind): void {
  localStorage.setItem(ENGINE_KIND_STORAGE_KEY, kind);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function loadDramaOptions(): DramaOptions {
  let saved: Partial<DramaOptions> = {};
  try {
    saved = JSON.parse(localStorage.getItem(DRAMA_OPTIONS_STORAGE_KEY) || "{}") || {};
  } catch {
    saved = {};
  }
  const d = DRAMA_DEFAULT_OPTIONS;
  return {
    seed: typeof saved.seed === "string" ? saved.seed : d.seed,
    topK: Math.round(clampNumber(saved.topK, 1, 4097, d.topK)),
    topP: clampNumber(saved.topP, 0.01, 1, d.topP),
    temperature: clampNumber(saved.temperature, 0.05, 2, d.temperature),
    maxSeconds: clampNumber(saved.maxSeconds, 1, DRAMA_MAX_SECONDS_LIMIT, d.maxSeconds),
    expertsOnCpu: typeof saved.expertsOnCpu === "boolean" ? saved.expertsOnCpu : d.expertsOnCpu,
  };
}

export function saveDramaOptions(options: DramaOptions): void {
  localStorage.setItem(DRAMA_OPTIONS_STORAGE_KEY, JSON.stringify(options));
}

/** Options for drama_generate, by speech.cpp's option names. No seed = random. */
export function dramaRequestOptions(options: DramaOptions): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {
    top_k: options.topK,
    top_p: options.topP,
    temperature: options.temperature,
    max_seconds: options.maxSeconds,
    experts_on_cpu: options.expertsOnCpu,
  };
  const seed = options.seed.trim();
  if (/^\d+$/.test(seed)) out.seed = Number(seed);
  return out;
}

/** Back from drama_generate options (a queued job being edited) to UI settings. */
export function dramaOptionsFromRequest(options: Record<string, unknown>): DramaOptions {
  const d = DRAMA_DEFAULT_OPTIONS;
  return {
    seed: typeof options.seed === "number" ? String(options.seed) : "",
    topK: Math.round(clampNumber(options.top_k, 1, 4097, d.topK)),
    topP: clampNumber(options.top_p, 0.01, 1, d.topP),
    temperature: clampNumber(options.temperature, 0.05, 2, d.temperature),
    maxSeconds: clampNumber(options.max_seconds, 1, DRAMA_MAX_SECONDS_LIMIT, d.maxSeconds),
    expertsOnCpu: typeof options.experts_on_cpu === "boolean" ? options.experts_on_cpu : d.expertsOnCpu,
  };
}

// ─── Voice files (.voice.gguf) added to the model ───────────────────────────

export type DramaVoiceFile = { name: string; path: string };

export function loadDramaVoiceFiles(): DramaVoiceFile[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAMA_VOICE_FILES_STORAGE_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((v) => v && typeof v.name === "string" && typeof v.path === "string");
  } catch {
    return [];
  }
}

export function saveDramaVoiceFiles(files: DramaVoiceFile[]): void {
  localStorage.setItem(DRAMA_VOICE_FILES_STORAGE_KEY, JSON.stringify(files));
}

/** Voice name from a file name: "luto.voice.gguf" → "luto". */
export function voiceNameFromPath(path: string): string {
  const file = path.split(/[/\\]/).pop() || "voice";
  return file.replace(/\.gguf$/i, "").replace(/\.voice$/i, "").trim() || "voice";
}

// ─── Remark tags ────────────────────────────────────────────────────────────
//
// Drama 3 reads bracketed English directions and applies them from where they
// stand. Labels are English source strings translated through i18n.

export type DramaRemark = {
  label: string;
  tag: string;
  /** Shown on hover. */
  tip?: string;
  kind?: "remark" | "voice" | "risky";
};

export const DRAMA_REMARKS: DramaRemark[] = [
  { label: "Sigh", tag: "[sigh]" },
  { label: "Laugh", tag: "[laughs]" },
  { label: "Chuckle", tag: "[chuckles]" },
  { label: "Whisper", tag: "[whispers]" },
  { label: "Tender", tag: "[tender, soft]" },
  { label: "Sad", tag: "[sad]" },
  { label: "Happy", tag: "[happy]" },
  { label: "Angry", tag: "[angry]" },
  { label: "Scared", tag: "[scared]" },
  { label: "Surprised", tag: "[surprised]" },
  { label: "Crying", tag: "[crying]" },
  { label: "Excited", tag: "[excited]" },
  { label: "Shout", tag: "[shouting]" },
  { label: "Slowly", tag: "[slowly]" },
  {
    label: "Pause",
    tag: "[short pause]",
    kind: "risky",
    tip: "Pause tags are risky: at the start of a line they can produce long silence.",
  },
  {
    label: "Male voice",
    tag: "[deep, low male voice]",
    kind: "voice",
    tip: "For the voice \"none\": put at the very start of the text to set the voice.",
  },
  {
    label: "Female voice",
    tag: "[warm, gentle female voice]",
    kind: "voice",
    tip: "For the voice \"none\": put at the very start of the text to set the voice.",
  },
];

export const DRAMA_REMARKS_STORAGE_KEY = "dramaStudio.remarks";

/** The remark buttons in use: the user's own set, or the defaults. */
export function loadDramaRemarks(): DramaRemark[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAMA_REMARKS_STORAGE_KEY) || "null");
    if (Array.isArray(raw)) {
      return raw
        .filter((r) => r && typeof r.label === "string" && typeof r.tag === "string")
        .map((r) => ({ label: r.label, tag: r.tag, tip: typeof r.tip === "string" ? r.tip : undefined, kind: r.kind }));
    }
  } catch {
    // Fall back to the defaults.
  }
  return DRAMA_REMARKS.map((r) => ({ ...r }));
}

export function saveDramaRemarks(remarks: DramaRemark[]): void {
  localStorage.setItem(DRAMA_REMARKS_STORAGE_KEY, JSON.stringify(remarks));
}

export function resetDramaRemarks(): DramaRemark[] {
  localStorage.removeItem(DRAMA_REMARKS_STORAGE_KEY);
  return DRAMA_REMARKS.map((r) => ({ ...r }));
}

/**
 * A direction as a tag: "tired, hoarse" → "[tired, hoarse]". Brackets the user typed
 * around it are kept as one pair; brackets inside are dropped, since Drama 3 would
 * read them as the end of the direction. "" for an empty direction.
 */
export function toDramaTag(direction: string): string {
  const inner = direction.trim().replace(/^\[+|\]+$/g, "").replace(/[[\]]/g, "").trim();
  return inner ? `[${inner}]` : "";
}

/**
 * Inserts `tag` at the textarea's cursor (replacing a selection), with a space on
 * either side where the neighbouring text needs one, and leaves the cursor after it.
 */
export function insertTagAtCursor(textarea: HTMLTextAreaElement, tag: string): void {
  const value = textarea.value;
  const start = textarea.selectionStart ?? value.length;
  const end = textarea.selectionEnd ?? start;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const lead = before.length > 0 && !/\s$/.test(before) ? " " : "";
  const trail = after.length === 0 || !/^\s/.test(after) ? " " : "";
  const insert = `${lead}${tag}${trail}`;
  textarea.value = `${before}${insert}${after}`;
  const cursor = before.length + insert.length;
  textarea.focus();
  textarea.setSelectionRange(cursor, cursor);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

// ─── Scene: several characters in one text ─────────────────────────────────
//
// A script of "Name: reply" lines becomes Drama 3 text with <|speaker:N|> tags,
// N being the character's place in the list. Characters with a voice file share one
// voice file made of them (each under its speaker); "none" characters get the
// model's voice of choice, steered by their description in square brackets.

export const DRAMA_SCENE_STORAGE_KEY = "dramaStudio.scene";
export const DRAMA_MAX_SPEAKERS = 16;
/** Text per request of a whole scene: well under the 95 s one request may last. */
export const DRAMA_SCENE_PART_CHARS = 700;

export type DramaCharacter = {
  id: string;
  name: string;
  /** "none" or the name of a Drama 3 voice (gallery or added file). */
  voice: string;
  /** For "none": how the voice sounds, in English. */
  description: string;
};

export type DramaSceneMode = "scene" | "lines";

export type DramaScene = {
  characters: DramaCharacter[];
  script: string;
  mode: DramaSceneMode;
  /** Seconds of silence between lines in line-by-line mode. */
  pause: number;
};

export type SceneReply = {
  /** Index in the character list = speaker number. */
  character: number;
  text: string;
  /** Script line (from 1) where the reply starts. */
  line: number;
};

let characterCounter = 0;

export function newDramaCharacter(name = ""): DramaCharacter {
  characterCounter += 1;
  return { id: `char_${Date.now().toString(36)}_${characterCounter}`, name, voice: "none", description: "" };
}

export function loadDramaScene(): DramaScene {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAMA_SCENE_STORAGE_KEY) || "null");
    if (raw && Array.isArray(raw.characters)) {
      return {
        characters: raw.characters
          .filter((c: any) => c && typeof c.name === "string")
          .map((c: any) => ({
            id: String(c.id || newDramaCharacter().id),
            name: c.name,
            voice: typeof c.voice === "string" && c.voice ? c.voice : "none",
            description: typeof c.description === "string" ? c.description : "",
          })),
        script: typeof raw.script === "string" ? raw.script : "",
        mode: raw.mode === "lines" ? "lines" : "scene",
        pause: Number.isFinite(raw.pause) ? Math.min(1.5, Math.max(0, raw.pause)) : 0.35,
      };
    }
  } catch {
    // Start empty.
  }
  return { characters: [], script: "", mode: "scene", pause: 0.35 };
}

export function saveDramaScene(scene: DramaScene): void {
  localStorage.setItem(DRAMA_SCENE_STORAGE_KEY, JSON.stringify(scene));
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

/**
 * "Name: text" → name and text, when the part before the colon could be a name:
 * at most three words, no brackets, no sentence punctuation.
 */
function splitNamePrefix(line: string): { name: string; text: string } | null {
  const match = /^\s*([^:[\]<>|.!?…"«»]{1,40}?)\s*:\s?(.*)$/.exec(line);
  if (!match) return null;
  const name = match[1].trim();
  if (!name || name.split(/\s+/).length > 3) return null;
  return { name, text: match[2] };
}

/** Whether an unknown "X:" prefix looks like a character name: every word capitalised. */
function looksLikeName(name: string): boolean {
  return name.split(/\s+/).every((word) => /^\p{Lu}/u.test(word));
}

/**
 * Splits a script into replies. A line starting with a character's name and a colon
 * starts that character's reply; any other line continues the reply before it (or,
 * at the start, is the first character's, as Drama 3 gives text before the first tag
 * to speaker 0). "Unknown" lists prefixes that look like names of no character.
 */
export function parseScene(script: string, characters: DramaCharacter[]): { replies: SceneReply[]; unknown: string[] } {
  const replies: SceneReply[] = [];
  const unknown = new Set<string>();
  script.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const prefix = splitNamePrefix(line);
    if (prefix) {
      const character = characters.findIndex((c) => c.name.trim() && sameName(c.name, prefix.name));
      if (character >= 0) {
        replies.push({ character, text: prefix.text.trim(), line: index + 1 });
        return;
      }
      if (looksLikeName(prefix.name)) unknown.add(prefix.name);
    }
    const last = replies[replies.length - 1];
    if (last) last.text = last.text ? `${last.text} ${line}` : line;
    else replies.push({ character: 0, text: line, line: index + 1 });
  });
  return { replies: replies.filter((r) => r.text), unknown: Array.from(unknown) };
}

/** Names before a colon in the script that are not characters yet, in order of appearance. */
export function sceneNameCandidates(script: string, characters: DramaCharacter[]): string[] {
  const found: string[] = [];
  for (const raw of script.split(/\r?\n/)) {
    const prefix = splitNamePrefix(raw);
    if (!prefix || !looksLikeName(prefix.name)) continue;
    if (characters.some((c) => sameName(c.name, prefix.name))) continue;
    if (found.some((n) => sameName(n, prefix.name))) continue;
    found.push(prefix.name);
  }
  return found;
}

/** "[description] " for a "none" character with a description, else "". */
export function characterVoiceHint(character: DramaCharacter | undefined): string {
  if (!character || character.voice !== "none") return "";
  const tag = toDramaTag(character.description);
  return tag ? `${tag} ` : "";
}

/** Drama 3 text of replies with speaker tags; a "none" character's description at its first reply. */
export function sceneText(replies: SceneReply[], characters: DramaCharacter[]): string {
  const described = new Set<number>();
  return replies
    .map((reply) => {
      const hint = described.has(reply.character) ? "" : characterVoiceHint(characters[reply.character]);
      described.add(reply.character);
      return `<|speaker:${reply.character}|>${hint}${reply.text}`;
    })
    .join(" ");
}

/** Replies grouped into parts of at most about `maxChars` characters, never splitting a reply. */
export function sceneParts(replies: SceneReply[], maxChars = DRAMA_SCENE_PART_CHARS): SceneReply[][] {
  const parts: SceneReply[][] = [];
  let current: SceneReply[] = [];
  let size = 0;
  for (const reply of replies) {
    if (current.length > 0 && size + reply.text.length > maxChars) {
      parts.push(current);
      current = [];
      size = 0;
    }
    current.push(reply);
    size += reply.text.length;
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

/** Short stable key of a text (FNV-1a), for naming a shared voice file. */
export function shortHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
