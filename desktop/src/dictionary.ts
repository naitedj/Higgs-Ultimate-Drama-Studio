// ─────────────────────────────────────────────────────────────────────────────
// Pronunciation dictionary: replacements applied to every text before it goes to
// Drama 3 — stress marks (з+амок → за́мок), names, abbreviations (т.е. → то есть).
// "+" before the stressed vowel puts the stress mark (U+0301) on that vowel.
// Directions in [brackets] and <|speaker|> tags are left untouched.
// ─────────────────────────────────────────────────────────────────────────────

export const DICTIONARY_STORAGE_KEY = "dramaStudio.dictionary";

export type DictionaryEntry = {
  from: string;
  to: string;
  /** Only whole words match ("кот" not inside "котёнок"). */
  wholeWord: boolean;
};

export const DEFAULT_DICTIONARY: DictionaryEntry[] = [
  { from: "т.е.", to: "то есть", wholeWord: true },
  { from: "т.д.", to: "так далее", wholeWord: true },
  { from: "т.п.", to: "тому подобное", wholeWord: true },
  { from: "т.к.", to: "так как", wholeWord: true },
  { from: "др.", to: "другие", wholeWord: true },
  { from: "см.", to: "смотри", wholeWord: true },
];

const STRESS = "́";
const VOWELS = "аеёиоуыэюяАЕЁИОУЫЭЮЯaeiouyAEIOUY";

export function loadDictionary(): DictionaryEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DICTIONARY_STORAGE_KEY) || "null");
    if (Array.isArray(raw)) {
      return raw
        .filter((e) => e && typeof e.from === "string" && typeof e.to === "string")
        .map((e) => ({ from: e.from, to: e.to, wholeWord: e.wholeWord !== false }));
    }
  } catch {
    // Defaults below.
  }
  return DEFAULT_DICTIONARY.map((e) => ({ ...e }));
}

export function saveDictionary(entries: DictionaryEntry[]): void {
  localStorage.setItem(DICTIONARY_STORAGE_KEY, JSON.stringify(entries));
}

/** "з+амок" → "за́мок": the stress mark after the vowel that follows "+". */
export function applyStressMarks(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === "+" && next && VOWELS.includes(next)) {
      out += next + STRESS;
      i += 1;
    } else {
      out += ch;
    }
  }
  return out;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The replacement keeps a capital first letter when the matched word had one. */
function matchCase(found: string, replacement: string): string {
  const first = found[0];
  if (first && first !== first.toLowerCase() && replacement[0] && replacement[0] === replacement[0].toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function applyToPlainText(text: string, entries: DictionaryEntry[]): string {
  let result = text;
  // Longer entries first, so "и т.д." wins over "т.д.".
  const sorted = [...entries].filter((e) => e.from.trim()).sort((a, b) => b.from.length - a.from.length);
  for (const entry of sorted) {
    const from = entry.from.trim();
    const body = escapeRegExp(from);
    // A word boundary that knows Cyrillic: no letter or digit right before / after.
    const startsWithWord = /^[\p{L}\d]/u.test(from);
    const endsWithWord = /[\p{L}\d]$/u.test(from);
    const before = entry.wholeWord && startsWithWord ? "(?<![\\p{L}\\d])" : "";
    const after = entry.wholeWord && endsWithWord ? "(?![\\p{L}\\d])" : "";
    const pattern = new RegExp(`${before}${body}${after}`, "giu");
    const to = applyStressMarks(entry.to);
    result = result.replace(pattern, (found) => matchCase(found, to));
  }
  return result;
}

/**
 * The text with the dictionary applied outside [directions] and <|tags|>, and "+"
 * stress marks written in the text itself turned into real ones.
 */
export function applyDictionary(text: string, entries: DictionaryEntry[]): string {
  const parts = text.split(/(\[[^\]]*\]|<\|[^|]*\|>)/u);
  return parts
    .map((part, i) => (i % 2 === 1 ? part : applyStressMarks(applyToPlainText(part, entries))))
    .join("");
}
