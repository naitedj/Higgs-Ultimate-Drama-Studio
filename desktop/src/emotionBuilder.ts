// ─────────────────────────────────────────────────────────────────────────────
// Emotion builder window: Russian-labelled chips (emotion, intensity, voice,
// delivery, tempo, who speaks, sounds) and an own description in Russian are put
// together into an English Drama 3 direction, which is inserted at the cursor,
// set as a manner, or kept as a remark button.
// ─────────────────────────────────────────────────────────────────────────────

import { escapeHtml } from "./dom";
import { insertTagAtCursor } from "./drama";
import { buildEmotionTag, EMOTION_GROUPS, emotionLabel, saveUserWord, translateRu } from "./emotions";
import type { EmotionChoice } from "./emotions";
import { t } from "./i18n";

export type EmotionTarget =
  | { kind: "text"; textarea: HTMLTextAreaElement }
  | { kind: "manner"; input: HTMLInputElement; who: string };

type Deps = {
  toast: (message: string, tone?: "success" | "warning" | "error") => void;
  addRemark: (label: string, tag: string) => void;
};

/** More words than this in one direction and Drama 3 tends to ignore some. */
const MAX_WORDS = 4;

let deps: Deps;
let target: EmotionTarget | null = null;
let choice: EmotionChoice = {};
let modal: HTMLElement;

const q = <T extends HTMLElement>(selector: string) => modal.querySelector<T>(selector)!;

function renderChips(): void {
  const host = q<HTMLElement>(".emotion-groups");
  host.innerHTML = EMOTION_GROUPS.map((group) => `
    <div class="emotion-group">
      <span class="emotion-group-title">${escapeHtml(group.title)}</span>
      <div class="emotion-chips">
        ${group.items.map((item) => `<button type="button" class="emotion-chip${choice[group.id]?.includes(item.ru) ? " on" : ""}${group.sounds ? " sound" : ""}"
          data-group="${group.id}" data-ru="${escapeHtml(item.ru)}" title="${escapeHtml(item.en)}">${escapeHtml(item.ru)}</button>`).join("")}
      </div>
    </div>
  `).join("");
}

function update(): void {
  const own = q<HTMLInputElement>("#emotion-own").value;
  const translation = translateRu(own);
  q<HTMLElement>("#emotion-own-en").textContent = own.trim() ? `→ ${translation.en}` : "";
  const unknownHost = q<HTMLElement>("#emotion-unknown");
  unknownHost.innerHTML = translation.unknown.length === 0 ? "" : `
    <span class="emotion-unknown-title">${escapeHtml(t("Words the program does not know — type the English and press Remember:"))}</span>
    ${translation.unknown.map((word) => `
      <span class="emotion-unknown-row" data-word="${escapeHtml(word)}">
        <strong>${escapeHtml(word)}</strong> →
        <input class="text-input" type="text" spellcheck="false" placeholder="english" />
        <button class="compact-button" type="button" data-action="remember">${escapeHtml(t("Remember"))}</button>
      </span>`).join("")}
  `;
  const built = buildEmotionTag(choice, translation.en);
  q<HTMLInputElement>("#emotion-result").value = [built.tag, built.sounds].filter(Boolean).join(" ");
  const warn = q<HTMLElement>("#emotion-warn");
  warn.textContent = built.words > MAX_WORDS
    ? `${t("Words in the direction")}: ${built.words}. ${t("More than 3–4 and the model often ignores some — keep the most important ones.")}`
    : "";
}

function result(): string {
  return q<HTMLInputElement>("#emotion-result").value.trim();
}

function close(): void {
  modal.classList.add("hidden");
  target = null;
}

function apply(): void {
  const tag = result();
  if (!tag) {
    deps.toast(t("Choose an emotion or type a description first"), "warning");
    return;
  }
  if (!target) return;
  if (target.kind === "text") {
    const textarea = target.textarea;
    close();
    insertTagAtCursor(textarea, tag);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    const input = target.input;
    // A manner is one direction: sound tags belong in the text.
    const manner = tag.replace(/\s*\[(sigh|laughs|chuckles|giggles|sobs|crying|gasps|coughs|clears throat|yawns|scoffs|sniffs|hmm|inhales deeply)\]/g, "").trim();
    close();
    input.value = manner;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    deps.toast(t("Manner set"));
  }
}

export function openEmotionBuilder(next: EmotionTarget): void {
  target = next;
  // Each opening starts clean: a manner and a remark in the text are different things.
  choice = {};
  q<HTMLInputElement>("#emotion-own").value = "";
  const applyButton = q<HTMLButtonElement>("#emotion-apply");
  applyButton.textContent = next.kind === "text" ? t("Insert at the cursor") : t("Set as the manner");
  q<HTMLElement>("#emotion-target").textContent = next.kind === "text"
    ? t("The direction goes where the cursor is in the text and works from there to the next direction.")
    : `${t("The manner is put before every reply of")} ${next.who}.`;
  renderChips();
  update();
  modal.classList.remove("hidden");
}

export function initEmotionBuilder(dependencies: Deps): void {
  deps = dependencies;
  modal = document.createElement("div");
  modal.id = "emotion-modal";
  modal.className = "modal-backdrop hidden";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `
    <section class="modal-panel emotion-panel">
      <div class="modal-head">
        <div>
          <h3>${escapeHtml(t("Emotion builder"))}</h3>
          <span class="api-status-text" id="emotion-target"></span>
        </div>
        <button class="popover-close" type="button" data-action="close" aria-label="Close">✕</button>
      </div>
      <div class="emotion-body">
        <label class="emotion-own">
          <span class="emotion-group-title">${escapeHtml(t("In your own words, in Russian"))}</span>
          <input id="emotion-own" class="text-input" type="text" spellcheck="false" placeholder="${escapeHtml(t("e.g. tired, hoarse, almost in a whisper, with a slight smirk"))}" />
          <span id="emotion-own-en" class="emotion-own-en"></span>
        </label>
        <div id="emotion-unknown" class="emotion-unknown"></div>
        <label class="emotion-own">
          <span class="emotion-group-title">${escapeHtml(t("Direction for Drama 3 (you can correct it)"))}</span>
          <input id="emotion-result" class="text-input emotion-result" type="text" spellcheck="false" />
        </label>
        <span id="emotion-warn" class="emotion-warn"></span>
        <span class="api-status-text">${escapeHtml(t("Tip: 1–3 words work best. Sounds like [sigh] are separate tags and are put after the direction."))}</span>
        <div class="emotion-groups"></div>
      </div>
      <div class="modal-actions">
        <button class="compact-button" type="button" data-action="reset">${escapeHtml(t("Clear"))}</button>
        <button class="compact-button" type="button" data-action="copy">${escapeHtml(t("Copy"))}</button>
        <button class="compact-button" type="button" data-action="remark">${escapeHtml(t("+ To the remark buttons"))}</button>
        <button id="emotion-apply" class="compact-button primary" type="button"></button>
      </div>
    </section>
  `;
  document.body.appendChild(modal);

  modal.addEventListener("click", async (event) => {
    if (event.target === modal) {
      close();
      return;
    }
    const element = event.target as HTMLElement;
    const chip = element.closest<HTMLButtonElement>(".emotion-chip");
    if (chip) {
      const group = EMOTION_GROUPS.find((g) => g.id === chip.dataset.group)!;
      const ru = chip.dataset.ru!;
      const on = choice[group.id] || [];
      choice[group.id] = on.includes(ru) ? on.filter((x) => x !== ru) : group.single ? [ru] : [...on, ru];
      renderChips();
      update();
      return;
    }
    const action = element.closest<HTMLButtonElement>("[data-action]")?.dataset.action;
    if (action === "close") close();
    else if (action === "reset") {
      choice = {};
      q<HTMLInputElement>("#emotion-own").value = "";
      renderChips();
      update();
    } else if (action === "copy") {
      if (!result()) return;
      await navigator.clipboard.writeText(result()).catch(() => {});
      deps.toast(t("Copied"));
    } else if (action === "remark") {
      if (!result()) {
        deps.toast(t("Choose an emotion or type a description first"), "warning");
        return;
      }
      const label = emotionLabel(choice, q<HTMLInputElement>("#emotion-own").value) || result();
      deps.addRemark(label, result());
      deps.toast(`${t("Remark button added")}: ${label}`);
    } else if (action === "remember") {
      const row = element.closest<HTMLElement>(".emotion-unknown-row")!;
      const en = row.querySelector<HTMLInputElement>("input")!.value.trim();
      if (!en) return;
      saveUserWord(row.dataset.word!, en);
      update();
    }
  });
  q<HTMLButtonElement>("#emotion-apply").addEventListener("click", apply);
  q<HTMLInputElement>("#emotion-own").addEventListener("input", update);
  modal.addEventListener("keydown", (event) => {
    const input = event.target as HTMLElement;
    if (event.key === "Enter" && input.closest(".emotion-unknown-row")) {
      event.preventDefault();
      input.closest<HTMLElement>(".emotion-unknown-row")!.querySelector<HTMLButtonElement>("button")!.click();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) close();
  });
}
