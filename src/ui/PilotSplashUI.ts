/**
 * Unlock splash: name / callsign / blurb / neon plate + CONTINUE.
 * Notify-once is owned by PilotState; this is presentation only.
 */
import type { PilotDef } from '../data/pilots';

export class PilotSplashUI {
  private host: HTMLElement;
  private card: HTMLElement | null = null;
  visible = false;
  onContinue: (() => void) | null = null;

  constructor(host: HTMLElement) {
    this.host = host;
  }

  show(def: PilotDef): void {
    this.ensure();
    if (!this.card) return;
    this.card.dataset.chrome = def.splashChrome;
    const plate = this.card.querySelector('#pilot-splash-plate') as HTMLImageElement | null;
    if (plate) {
      plate.src = def.portrait;
      plate.alt = def.callsign;
    }
    const call = this.card.querySelector('#pilot-splash-call');
    const name = this.card.querySelector('#pilot-splash-name');
    const blurb = this.card.querySelector('#pilot-splash-blurb');
    const passive = this.card.querySelector('#pilot-splash-passive');
    const active = this.card.querySelector('#pilot-splash-active');
    if (call) call.textContent = def.callsign;
    if (name) name.textContent = def.name.toUpperCase();
    if (blurb) blurb.textContent = def.blurb;
    if (passive) passive.textContent = `PASSIVE · ${def.passive.name}`;
    if (active) {
      active.textContent = def.active
        ? `ACTIVE · ${def.active.name}  ${def.active.duration}s / ${def.active.cooldown}s`
        : 'ACTIVE · NONE';
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
    el.id = 'pilot-splash';
    el.className = 'pilot-splash panel-hidden interactive';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-labelledby', 'pilot-splash-name');
    el.innerHTML = `
      <div class="pilot-splash-card">
        <div class="pilot-splash-kicker">DOCTRINE UNLOCKED</div>
        <img id="pilot-splash-plate" class="pilot-splash-plate" alt="" />
        <div class="pilot-splash-call" id="pilot-splash-call"></div>
        <div class="pilot-splash-name" id="pilot-splash-name"></div>
        <div class="pilot-splash-blurb" id="pilot-splash-blurb"></div>
        <div class="pilot-splash-kit">
          <span id="pilot-splash-passive"></span>
          <span id="pilot-splash-active"></span>
        </div>
        <button type="button" class="ui-btn pilot-splash-cta" id="pilot-splash-continue">CONTINUE</button>
      </div>
    `;
    this.host.appendChild(el);
    el.querySelector('#pilot-splash-continue')?.addEventListener('click', () => {
      this.hide();
      this.onContinue?.();
    });
    this.card = el;
  }
}
