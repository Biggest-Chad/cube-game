/**
 * Tutorial-style briefing when Evolve goals are first met.
 * Does not force the player to prestige immediately.
 */
export class EvolveReadyUI {
  private root: HTMLElement;
  private card: HTMLElement | null = null;
  visible = false;

  onOpenShop: (() => void) | null = null;
  onDismiss: (() => void) | null = null;

  constructor(host: HTMLElement) {
    this.root = host;
  }

  show(opts: { cost: number; nextTier: number; fragPerCore: number }): void {
    this.ensure();
    if (!this.card) return;
    const title = this.card.querySelector('#evolve-ready-title');
    const body = this.card.querySelector('#evolve-ready-body');
    if (title) title.textContent = 'EVOLVE AVAILABLE';
    if (body) {
      body.textContent =
        `Ascension ${opts.nextTier} ready (${opts.cost.toLocaleString()} FRAG). ` +
        `Retrain shop, restart at beacon 5, skip cleared beacons. Surplus FRAG → CORE (${opts.fragPerCore.toLocaleString()}:1).`;
    }
    this.card.classList.remove('panel-hidden');
    this.visible = true;
  }

  hide(): void {
    this.card?.classList.add('panel-hidden');
    this.visible = false;
  }

  private ensure(): void {
    if (this.card) return;
    const el = document.createElement('div');
    el.id = 'evolve-ready-card';
    el.className = 'tutorial-card evolve-ready-card docked-actions-card panel-hidden interactive';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-labelledby', 'evolve-ready-title');
    el.innerHTML = `
      <div class="card-body">
        <div class="tutorial-kicker">ASCENSION READY</div>
        <div class="tutorial-title" id="evolve-ready-title">EVOLVE AVAILABLE</div>
        <div class="tutorial-body" id="evolve-ready-body"></div>
      </div>
      <div class="card-actions">
        <button type="button" class="tutorial-cta ui-btn" id="evolve-ready-shop">OPEN SHOP</button>
        <button type="button" class="tutorial-skip" id="evolve-ready-later">Not now</button>
      </div>
    `;
    this.root.appendChild(el);
    el.querySelector('#evolve-ready-shop')?.addEventListener('click', () => {
      this.hide();
      this.onOpenShop?.();
    });
    el.querySelector('#evolve-ready-later')?.addEventListener('click', () => {
      this.hide();
      this.onDismiss?.();
    });
    this.card = el;
  }
}
