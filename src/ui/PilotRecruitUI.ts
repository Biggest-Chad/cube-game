/**
 * Lattice summon — brand-native champion recruit. Spend Core, roll a locked doctrine card.
 */
import { PILOTS, type PilotDef } from "../data/pilots";
import type { PilotState } from "../progression/PilotState";

export const PILOT_RECRUIT_COST = 90;

export class PilotRecruitUI {
  private host: HTMLElement;
  private card: HTMLElement | null = null;
  visible = false;
  onClose: (() => void) | null = null;
  onSummon: (() => void) | null = null;
  onEquip: ((id: string) => void) | null = null;

  constructor(host: HTMLElement) {
    this.host = host;
  }

  show(state: PilotState, core: number): void {
    this.ensure();
    if (!this.card) return;
    this.card.classList.remove("panel-hidden");
    this.visible = true;
    this.paint(state, core);
  }

  hide(): void {
    this.card?.classList.add("panel-hidden");
    this.visible = false;
  }

  paint(state: PilotState, core: number): void {
    if (!this.card) return;
    const locked = PILOTS.filter((p) => p.persistCampaign && !state.isUnlocked(p.id));
    const owned = PILOTS.filter((p) => p.persistCampaign && state.isUnlocked(p.id));
    const summon = this.card.querySelector("#recruit-summon") as HTMLButtonElement | null;
    if (summon) {
      summon.disabled = core < PILOT_RECRUIT_COST || locked.length === 0;
      summon.textContent = locked.length === 0 ? "ROSTER COMPLETE" : `SUMMON · ${PILOT_RECRUIT_COST} CORE`;
    }
    const coreEl = this.card.querySelector("#recruit-core");
    if (coreEl) coreEl.textContent = `${Math.floor(core)} CORE`;
    const grid = this.card.querySelector("#recruit-grid");
    if (grid) {
      grid.innerHTML = PILOTS.filter((p) => p.persistCampaign).map((p) => this.cardHtml(p, state)).join("");
      grid.querySelectorAll("[data-equip]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = (btn as HTMLElement).dataset.equip!;
          this.onEquip?.(id);
        });
      });
    }
    const note = this.card.querySelector("#recruit-note");
    if (note) {
      note.textContent = locked.length
        ? `${locked.length} doctrine${locked.length === 1 ? "" : "s"} still in the lattice.`
        : "Every champion is bound to the hull.";
    }
    void owned;
  }

  flash(def: PilotDef): void {
    const flash = this.card?.querySelector("#recruit-flash");
    if (!flash) return;
    flash.textContent = `${def.callsign} ANSWERS`;
    flash.classList.add("hot");
    window.setTimeout(() => flash.classList.remove("hot"), 1400);
  }

  private cardHtml(def: PilotDef, state: PilotState): string {
    const unlocked = state.isUnlocked(def.id);
    const equipped = state.equippedId === def.id;
    return `<button type="button" class="recruit-card ${unlocked ? "owned" : "sealed"} ${equipped ? "equipped" : ""}" data-equip="${unlocked ? def.id : ""}" ${unlocked ? "" : "disabled"}>
      <div class="recruit-call" style="color:${def.colors.primary}">${def.callsign}</div>
      <div class="recruit-name">${def.name}</div>
      <div class="recruit-blurb">${unlocked ? def.passive.name : "SEALED"}</div>
    </button>`;
  }

  private ensure(): void {
    if (this.card) return;
    const el = document.createElement("div");
    el.id = "pilot-recruit";
    el.className = "pilot-recruit panel-hidden interactive";
    el.innerHTML = `
      <div class="pilot-recruit-card">
        <div class="pilot-recruit-head">
          <div>
            <div class="pilot-recruit-kicker">LATTICE SUMMON</div>
            <div class="pilot-recruit-title">CHAMPIONS</div>
          </div>
          <div class="pilot-recruit-core" id="recruit-core">0 CORE</div>
          <button type="button" class="icon-btn" id="recruit-close" aria-label="Close">✕</button>
        </div>
        <p class="pilot-recruit-note" id="recruit-note"></p>
        <div class="recruit-grid" id="recruit-grid"></div>
        <div class="recruit-flash" id="recruit-flash"></div>
        <button type="button" class="menu-btn primary" id="recruit-summon">SUMMON</button>
      </div>`;
    this.host.appendChild(el);
    el.querySelector("#recruit-close")?.addEventListener("click", () => {
      this.hide();
      this.onClose?.();
    });
    el.querySelector("#recruit-summon")?.addEventListener("click", () => this.onSummon?.());
    this.card = el;
  }
}
