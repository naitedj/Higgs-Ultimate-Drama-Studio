// ─────────────────────────────────────────────────────────────────────────────
// Help window: table of contents, search, and the sections from help.ts. Opens
// at the section of the tab one is in (button ❓ in the header, or F1).
// ─────────────────────────────────────────────────────────────────────────────

import { escapeHtml } from "./dom";
import { HELP_SECTIONS } from "./help";

let modal: HTMLElement;

const q = <T extends HTMLElement>(selector: string) => modal.querySelector<T>(selector)!;
const norm = (text: string) => text.toLocaleLowerCase().replace(/ё/g, "е");

function showSection(id: string): void {
  const section = modal.querySelector<HTMLElement>(`[data-help="${id}"]`);
  if (!section) return;
  q<HTMLElement>(".help-content").scrollTop = section.offsetTop - q<HTMLElement>(".help-content").offsetTop - 8;
  for (const item of modal.querySelectorAll<HTMLElement>(".help-nav button")) item.classList.toggle("active", item.dataset.target === id);
}

function filter(): void {
  const query = norm(q<HTMLInputElement>(".help-search").value.trim());
  let shown = 0;
  for (const section of modal.querySelectorAll<HTMLElement>(".help-section")) {
    const match = !query || norm(section.textContent || "").includes(query);
    section.classList.toggle("hidden", !match);
    modal.querySelector<HTMLElement>(`.help-nav button[data-target="${section.dataset.help}"]`)?.classList.toggle("hidden", !match);
    if (match) shown += 1;
  }
  q<HTMLElement>(".help-empty").classList.toggle("hidden", shown > 0);
  q<HTMLElement>(".help-content").scrollTop = 0;
}

/** Opens the help, at the section of `mode` (a tab's data-mode) when there is one. */
export function openHelp(mode?: string): void {
  modal.classList.remove("hidden");
  const target = HELP_SECTIONS.find((s) => mode && s.modes?.includes(mode)) ?? HELP_SECTIONS[0];
  if (!q<HTMLInputElement>(".help-search").value) requestAnimationFrame(() => showSection(target.id));
  q<HTMLInputElement>(".help-search").focus();
}

function close(): void {
  modal.classList.add("hidden");
}

export function initHelp(currentMode: () => string): void {
  modal = document.createElement("div");
  modal.id = "help-modal";
  modal.className = "modal-backdrop hidden";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `
    <section class="modal-panel help-panel">
      <div class="modal-head help-head">
        <h3>❓ Справка</h3>
        <input class="text-input help-search" type="search" placeholder="Поиск по справке: например «пауза», «обложка», «ударение»" />
        <button class="popover-close" type="button" data-action="close" aria-label="Закрыть">✕</button>
      </div>
      <div class="help-body">
        <nav class="help-nav">
          ${HELP_SECTIONS.map((s) => `<button type="button" data-target="${s.id}">${escapeHtml(s.title)}</button>`).join("")}
        </nav>
        <div class="help-content">
          ${HELP_SECTIONS.map((s) => `<section class="help-section" data-help="${s.id}"><h3>${escapeHtml(s.title)}</h3>${s.html}</section>`).join("")}
          <p class="help-empty hidden">Ничего не найдено. Попробуйте другое слово.</p>
        </div>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) return close();
    const element = event.target as HTMLElement;
    if (element.closest('[data-action="close"]')) return close();
    const item = element.closest<HTMLButtonElement>(".help-nav button");
    if (item?.dataset.target) showSection(item.dataset.target);
  });
  q<HTMLInputElement>(".help-search").addEventListener("input", filter);
  // The table of contents follows the reading.
  q<HTMLElement>(".help-content").addEventListener("scroll", () => {
    const content = q<HTMLElement>(".help-content");
    let current = "";
    for (const section of modal.querySelectorAll<HTMLElement>(".help-section:not(.hidden)")) {
      if (section.offsetTop - content.offsetTop - 40 <= content.scrollTop) current = section.dataset.help || "";
    }
    for (const item of modal.querySelectorAll<HTMLElement>(".help-nav button")) item.classList.toggle("active", item.dataset.target === current);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "F1") {
      event.preventDefault();
      if (modal.classList.contains("hidden")) openHelp(currentMode());
      else close();
    } else if (event.key === "Escape" && !modal.classList.contains("hidden")) {
      close();
    }
  });
  document.getElementById("help-button")?.addEventListener("click", () => openHelp(currentMode()));
}
