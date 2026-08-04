/**
 * Guided first-session tutorials:
 *  - Stage 1 basics (orbit → aim → destroy → open shop → first purchase)
 *  - Loadout weapon unlock (buy Arc Beam → equip)
 */
export type TutorialId = 'stage1' | 'loadout';

export type TutorialStepId =
  | 'welcome'
  | 'orbit'
  | 'aim'
  | 'destroy'
  | 'shop_hint'
  | 'shop_buy'
  | 'complete'
  | 'loadout_intro'
  | 'loadout_buy'
  | 'loadout_equip'
  | 'loadout_done';

export interface TutorialStep {
  id: TutorialStepId;
  title: string;
  body: string;
  /** Optional CSS selector to pulse-highlight */
  highlight?: string;
  /** Advance condition checked each frame */
  advance: 'tap' | 'orbit' | 'aim' | 'destroy' | 'shop_open' | 'purchase' | 'weapon_owned' | 'weapon_equipped' | 'auto';
  /** Optional progress target (e.g. blocks destroyed) */
  target?: number;
  cta?: string;
}

const STAGE1_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'WELCOME, PILOT',
    body: 'A hostile cube lattice threatens the grid. You orbit it. You destroy it. You upgrade.',
    advance: 'tap',
    cta: 'BEGIN',
  },
  {
    id: 'orbit',
    title: 'ORBIT',
    body: 'Drag the LEFT stick (or WASD) to circle the cube. Find a clear face.',
    highlight: '#joy-zone',
    advance: 'orbit',
    target: 0.55,
  },
  {
    id: 'aim',
    title: 'AIM',
    body: 'Use the RIGHT stick (or IJKL) to aim the main cannon. The neon crosshair shows your shot line.',
    highlight: '#aim-zone',
    advance: 'aim',
    target: 0.4,
  },
  {
    id: 'destroy',
    title: 'DESTROY',
    body: 'Weapons auto-fire. Melt blocks until you earn enough Data Fragments for your first upgrade.',
    advance: 'destroy',
    target: 12,
  },
  {
    id: 'shop_hint',
    title: 'UPGRADE READY',
    body: 'You can afford a shop upgrade. Tap SHOP on the right rail — power grows between sectors.',
    highlight: '#btn-tech',
    advance: 'shop_open',
    cta: 'OPEN SHOP',
  },
  {
    id: 'shop_buy',
    title: 'FIRST PURCHASE',
    body: 'Buy the highlighted upgrade (Pulse Amp or cheapest available). Every rank stacks.',
    advance: 'purchase',
  },
  {
    id: 'complete',
    title: 'SYSTEMS ONLINE',
    body: 'Tutorial complete. Clear the lattice, then expand loadouts when Arc Beam is in stock.',
    advance: 'tap',
    cta: 'ENGAGE',
  },
];

const LOADOUT_STEPS: TutorialStep[] = [
  {
    id: 'loadout_intro',
    title: 'HARDPOINT ONLINE',
    body: 'A modular weapon is available: Arc Beam — a continuous energy lance with bounce upgrades.',
    advance: 'tap',
    cta: 'CONTINUE',
  },
  {
    id: 'loadout_buy',
    title: 'ACQUIRE ARC BEAM',
    body: 'Open SHOP → LOADOUTS and purchase Arc Beam with Fragments. Equip it to Hardpoint 1.',
    highlight: '#btn-tech',
    advance: 'weapon_owned',
    cta: 'OPEN SHOP',
  },
  {
    id: 'loadout_equip',
    title: 'EQUIP',
    body: 'In LOADOUTS, select Hardpoint 1 and equip Arc Beam. Hold fire to stream the beam.',
    advance: 'weapon_equipped',
  },
  {
    id: 'loadout_done',
    title: 'BEAM ARMED',
    body: 'Upgrade bounce & refract branches later to ricochet energy across the lattice.',
    advance: 'tap',
    cta: 'GOT IT',
  },
];

export interface TutorialProgressCtx {
  orbitMag: number;
  aimMag: number;
  blocksDestroyedSession: number;
  shopOpen: boolean;
  purchasedThisSession: boolean;
  ownsArcBeam: boolean;
  hasEquippedWeapon: boolean;
  canAffordShop: boolean;
  canAffordArcBeam: boolean;
}

export class TutorialDirector {
  private root: HTMLElement;
  private active: TutorialId | null = null;
  private steps: TutorialStep[] = [];
  private index = 0;
  private orbitAccum = 0;
  private aimAccum = 0;
  private visible = false;
  private stage1Done: boolean;
  private loadoutDone: boolean;
  private pendingLoadout = false;

  onRequestShop: (() => void) | null = null;
  onComplete: ((id: TutorialId) => void) | null = null;

  constructor(
    root: HTMLElement,
    flags: { stage1Done: boolean; loadoutDone: boolean }
  ) {
    this.root = root;
    this.stage1Done = flags.stage1Done;
    this.loadoutDone = flags.loadoutDone;
    this.ensureDom();
  }

  get isActive(): boolean {
    return this.active !== null && this.visible;
  }

  get activeId(): TutorialId | null {
    return this.active;
  }

  get currentStep(): TutorialStep | null {
    if (!this.active) return null;
    return this.steps[this.index] ?? null;
  }

  /** Call when level 1 combat begins (after cinematic). */
  tryStartStage1(): void {
    if (this.stage1Done || this.active) return;
    this.begin('stage1', STAGE1_STEPS);
  }

  /** Call when player can afford Arc Beam and doesn't own it. */
  tryStartLoadout(): void {
    if (this.loadoutDone || this.active || this.pendingLoadout) return;
    if (this.stage1Done) {
      this.begin('loadout', LOADOUT_STEPS);
    } else {
      this.pendingLoadout = true;
    }
  }

  setFlags(stage1Done: boolean, loadoutDone: boolean): void {
    this.stage1Done = stage1Done;
    this.loadoutDone = loadoutDone;
  }

  update(dt: number, ctx: TutorialProgressCtx): void {
    if (!this.active || !this.visible) {
      // Queue loadout tutorial after stage1
      if (
        this.pendingLoadout &&
        this.stage1Done &&
        !this.loadoutDone &&
        !this.active &&
        ctx.canAffordArcBeam &&
        !ctx.ownsArcBeam
      ) {
        this.pendingLoadout = false;
        this.begin('loadout', LOADOUT_STEPS);
      }
      return;
    }

    const step = this.steps[this.index];
    if (!step) return;

    if (step.advance === 'orbit') {
      this.orbitAccum += ctx.orbitMag * dt;
      this.setProgress(this.orbitAccum / (step.target ?? 1));
      if (this.orbitAccum >= (step.target ?? 1)) this.advance();
      return;
    }
    if (step.advance === 'aim') {
      this.aimAccum += ctx.aimMag * dt;
      this.setProgress(this.aimAccum / (step.target ?? 1));
      if (this.aimAccum >= (step.target ?? 1)) this.advance();
      return;
    }
    if (step.advance === 'destroy') {
      const t = step.target ?? 10;
      this.setProgress(ctx.blocksDestroyedSession / t);
      if (ctx.blocksDestroyedSession >= t) this.advance();
      return;
    }
    if (step.advance === 'shop_open' && ctx.shopOpen) {
      this.advance();
      return;
    }
    if (step.advance === 'purchase' && ctx.purchasedThisSession) {
      this.advance();
      return;
    }
    if (step.advance === 'weapon_owned' && ctx.ownsArcBeam) {
      this.advance();
      return;
    }
    if (step.advance === 'weapon_equipped' && ctx.hasEquippedWeapon) {
      this.advance();
      return;
    }
    // Gate shop_hint until affordable
    if (step.id === 'shop_hint' && !ctx.canAffordShop) {
      this.setBody(
        'Keep destroying blocks to earn Fragments. Shop unlocks when you can afford an upgrade.'
      );
    }
  }

  hide(): void {
    this.visible = false;
    const card = this.root.querySelector('#tutorial-card');
    if (card) (card as HTMLElement).classList.add('panel-hidden');
    this.clearHighlight();
  }

  showIfActive(): void {
    if (!this.active) return;
    this.visible = true;
    this.renderStep();
  }

  private begin(id: TutorialId, steps: TutorialStep[]): void {
    this.active = id;
    this.steps = steps;
    this.index = 0;
    this.orbitAccum = 0;
    this.aimAccum = 0;
    this.visible = true;
    this.renderStep();
  }

  private advance(): void {
    this.index++;
    if (this.index >= this.steps.length) {
      this.finish();
      return;
    }
    // Skip shop_buy if already purchased mid-flow
    this.orbitAccum = 0;
    this.aimAccum = 0;
    this.renderStep();
  }

  private finish(): void {
    const id = this.active;
    if (id === 'stage1') this.stage1Done = true;
    if (id === 'loadout') this.loadoutDone = true;
    this.active = null;
    this.visible = false;
    this.hide();
    if (id) this.onComplete?.(id);
  }

  private ensureDom(): void {
    if (this.root.querySelector('#tutorial-card')) return;
    const el = document.createElement('div');
    el.id = 'tutorial-card';
    el.className = 'tutorial-card panel-hidden interactive';
    el.innerHTML = `
      <div class="tutorial-kicker">GUIDED BRIEFING</div>
      <div class="tutorial-title" id="tutorial-title"></div>
      <div class="tutorial-body" id="tutorial-body"></div>
      <div class="tutorial-progress panel-hidden" id="tutorial-progress">
        <i id="tutorial-progress-bar"></i>
      </div>
      <button type="button" class="tutorial-cta ui-btn" id="tutorial-cta">CONTINUE</button>
      <button type="button" class="tutorial-skip" id="tutorial-skip">Skip tutorial</button>
    `;
    this.root.appendChild(el);
    el.querySelector('#tutorial-cta')?.addEventListener('click', () => this.onCta());
    el.querySelector('#tutorial-skip')?.addEventListener('click', () => this.finish());
  }

  private onCta(): void {
    const step = this.currentStep;
    if (!step) return;
    if (step.advance === 'tap' || step.advance === 'auto') {
      this.advance();
      return;
    }
    if (
      step.advance === 'shop_open' ||
      step.id === 'loadout_buy' ||
      step.advance === 'weapon_owned'
    ) {
      this.onRequestShop?.();
    }
  }

  private renderStep(): void {
    this.ensureDom();
    const step = this.currentStep;
    const card = this.root.querySelector('#tutorial-card') as HTMLElement | null;
    if (!card || !step) return;
    card.classList.remove('panel-hidden');
    const title = card.querySelector('#tutorial-title');
    const body = card.querySelector('#tutorial-body');
    const cta = card.querySelector('#tutorial-cta') as HTMLButtonElement | null;
    const prog = card.querySelector('#tutorial-progress') as HTMLElement | null;
    if (title) title.textContent = step.title;
    if (body) body.textContent = step.body;
    if (cta) {
      const needsTap =
        step.advance === 'tap' ||
        step.advance === 'shop_open' ||
        step.advance === 'weapon_owned';
      cta.style.display = needsTap ? '' : 'none';
      cta.textContent = step.cta ?? 'CONTINUE';
    }
    if (prog) {
      const showProg =
        step.advance === 'orbit' ||
        step.advance === 'aim' ||
        step.advance === 'destroy';
      prog.classList.toggle('panel-hidden', !showProg);
      this.setProgress(0);
    }
    this.clearHighlight();
    if (step.highlight) {
      const target = document.querySelector(step.highlight);
      target?.classList.add('tutorial-highlight');
    }
  }

  private setProgress(t: number): void {
    const bar = this.root.querySelector('#tutorial-progress-bar') as HTMLElement | null;
    if (bar) bar.style.width = `${Math.min(100, Math.max(0, t * 100))}%`;
  }

  private setBody(text: string): void {
    const body = this.root.querySelector('#tutorial-body');
    if (body && body.textContent !== text) body.textContent = text;
  }

  private clearHighlight(): void {
    document.querySelectorAll('.tutorial-highlight').forEach((el) => {
      el.classList.remove('tutorial-highlight');
    });
  }

  dispose(): void {
    this.hide();
    this.root.querySelector('#tutorial-card')?.remove();
  }
}
