/**
 * Dedicated Evolve confirmation modal — reset, Chronobeacon skip, FRAG→CORE preview.
 */
export class EvolveConfirmUI {
  private root: HTMLElement;
  private card: HTMLElement | null = null;
  visible = false;
  onConfirm: (() => boolean) | null = null;
  onCancel: (() => void) | null = null;

  constructor(host: HTMLElement) {
    this.root = host;
  }

  show(opts: {
    cost: number;
    nextTier: number;
    grant: number;
    leftover: number;
    convertCores: number;
    fragPerCore: number;
    resetSector: number;
    furthestBeacon: number;
    canConfirm: boolean;
    reason?: string;
  }): void {
    this.ensure();
    if (!this.card) return;
    const set = (id: string, html: string) => {
      const el = this.card!.querySelector(`#${id}`);
      if (el) el.innerHTML = html;
    };
    set('evo-modal-tier', `ASCENSION ${opts.nextTier}`);
    set(
      'evo-modal-cost',
      `Spend <strong>${opts.cost.toLocaleString()} FRAG</strong> · grant <strong>+${opts.grant} CORE</strong>`
    );
    set(
      'evo-modal-convert',
      opts.convertCores > 0
        ? `Leftover <strong>${opts.leftover.toLocaleString()} FRAG</strong> converts to <strong>${opts.convertCores} CORE</strong> (${opts.fragPerCore.toLocaleString()} : 1). Remainder stays as FRAG.`
        : `Leftover FRAG convert at ${opts.fragPerCore.toLocaleString()} : 1 CORE after the spend. Nothing extra this time.`
    );
    const furthest = Math.max(opts.resetSector, opts.furthestBeacon);
    set(
      'evo-modal-diagram',
      this.diagram(opts.resetSector, furthest)
    );
    const btn = this.card.querySelector('#evo-modal-confirm') as HTMLButtonElement | null;
    if (btn) btn.disabled = !opts.canConfirm;
    const warn = this.card.querySelector('#evo-modal-warn');
    if (warn) warn.textContent = opts.reason ?? '';
    this.card.classList.remove('panel-hidden');
    this.visible = true;
  }

  hide(): void {
    this.card?.classList.add('panel-hidden');
    this.visible = false;
  }

  private diagram(reset: number, furthest: number): string {
    const nodes = [5, 10, 15, 20, 25, 30];
    const cells = nodes
      .map((n) => {
        const cls =
          n === reset ? 'reset' : n <= furthest ? 'skip' : 'later';
        const label = n === reset ? 'START' : n <= furthest ? 'SKIP' : 'PLAY';
        return `<div class="evo-node ${cls}"><span class="evo-node-n">${n}</span><span class="evo-node-l">${label}</span></div>`;
      })
      .join('<div class="evo-arrow">→</div>');
    return `
      <div class="evo-diagram" aria-hidden="true">
        <div class="evo-track">${cells}</div>
        <p class="evo-diagram-cap">
          Run resets to Chronobeacon <strong>${reset}</strong>. You skip every beacon you have already cleared
          (up to ${furthest || reset}), then sequential sectors resume.
        </p>
      </div>`;
  }

  private ensure(): void {
    if (this.card) return;
    const el = document.createElement('div');
    el.id = 'evolve-confirm-modal';
    el.className = 'evo-modal-root panel-hidden interactive';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `
      <div class="evo-modal-scrim" data-evo-cancel></div>
      <div class="evo-modal-card">
        <div class="evo-modal-kicker">HULL EVOLUTION</div>
        <h2 class="evo-modal-title" id="evo-modal-tier">ASCENSION</h2>
        <p class="evo-modal-lead" id="evo-modal-cost"></p>
        <ul class="evo-modal-list">
          <li>Combat shop ranks reset. You retrain them with a higher rank cap (10 → 20 → 30…).</li>
          <li>Loadout branch ranks, drone shop ranks, and base weapon ranks reset the same way. Owned weapons, research, and pad/bay unlocks stay.</li>
          <li>Campaign progress on this run returns to Chronobeacon 5. Lifetime checkpoints are kept so you skip 10 / 15 / 20… until the furthest beacon you have cleared.</li>
        </ul>
        <div id="evo-modal-diagram"></div>
        <p class="evo-modal-convert" id="evo-modal-convert"></p>
        <div class="evo-modal-actions">
          <button type="button" class="menu-btn" data-evo-cancel>Cancel</button>
          <button type="button" class="menu-btn primary" id="evo-modal-confirm">CONFIRM EVOLVE</button>
        </div>
        <div class="evolve-warn" id="evo-modal-warn"></div>
      </div>
    `;
    this.root.appendChild(el);
    el.querySelectorAll('[data-evo-cancel]').forEach((n) => {
      n.addEventListener('click', () => {
        this.hide();
        this.onCancel?.();
      });
    });
    el.querySelector('#evo-modal-confirm')?.addEventListener('click', () => {
      if (this.onConfirm?.()) this.hide();
    });
    this.card = el;
  }
}
