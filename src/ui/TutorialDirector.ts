import { FIRST_DRONE_COST } from '../data/drones';

/**
 * Guided first-session tutorials:
 *  - Stage 1: orbit → aim → destroy → open shop → buy first DRONE (only)
 *  - Fleet: expand to a 2nd drone on the DRONES tab
 *  - Loadout: buy Rocket Pod → equip (after stage 3 weapon unlock)
 */
export type TutorialId = 'stage1' | 'fleet' | 'loadout' | 'gun' | 'flyer';

export type TutorialStepId =
  | 'welcome'
  | 'orbit'
  | 'aim'
  | 'destroy'
  | 'shop_hint'
  | 'shop_drone'
  | 'complete'
  | 'fleet_hint'
  | 'fleet_expand'
  | 'fleet_done'
  | 'gun_farm'
  | 'gun_hint'
  | 'gun_buy'
  | 'gun_done'
  | 'loadout_intro'
  | 'loadout_buy'
  | 'loadout_equip'
  | 'loadout_done'
  | 'flyer_strafe'
  | 'flyer_gates'
  | 'flyer_banks';

export interface TutorialStep {
  id: TutorialStepId;
  title: string;
  body: string;
  /** Optional CSS selector to pulse-highlight */
  highlight?: string;
  /** Advance condition checked each frame */
  advance:
    | 'tap'
    | 'orbit'
    | 'aim'
    | 'destroy'
    | 'afford_drone'
    | 'shop_open'
    | 'drone_owned'
    | 'fleet_expanded'
    | 'afford_gun'
    | 'gun_owned'
    | 'weapon_owned'
    | 'weapon_equipped'
    | 'strafe'
    | 'flyer_lock'
    | 'time'
    | 'auto';
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
    body: 'Weapons auto-fire. Melt lattice blocks to earn Data Fragments for your first ally drone (100 FRAG).',
    advance: 'afford_drone',
    target: 100,
  },
  {
    id: 'shop_hint',
    title: 'DRONE READY',
    body: 'You can afford Ally Protocol — your first AI drone. Tap SHOP on the right rail.',
    highlight: '#btn-tech',
    advance: 'shop_open',
    cta: 'OPEN SHOP',
  },
  {
    id: 'shop_drone',
    title: 'BUY YOUR DRONE',
    body: 'Purchase Ally Protocol (DRONES tab or RECOMMENDED). That is your first upgrade — nothing else until the drone is online.',
    highlight: '.shop-reco, [data-id="drone_unlock"]',
    advance: 'drone_owned',
  },
  {
    id: 'complete',
    title: 'WINGMAN ONLINE',
    body: 'Tutorial complete. Your drone mines with you. Rocket Pods unlock from Sector 3 — master the main gun and upgrades first.',
    advance: 'tap',
    cta: 'ENGAGE',
  },
];

const FLEET_STEPS: TutorialStep[] = [
  {
    id: 'fleet_hint',
    title: 'EXPAND THE FLEET',
    body: 'You can field a second drone. Open SHOP → DRONES to buy another bay and assign a fighter.',
    highlight: '#btn-tech',
    advance: 'shop_open',
    cta: 'OPEN SHOP',
  },
  {
    id: 'fleet_expand',
    title: 'GROW THE WING',
    body: 'On the FLEET tab: unlock + BAY, then +1 Fighter and assign it. Two drones mine and fight together.',
    highlight: '#drone-bay-unlock, [data-buy-unit="fighter"], [data-drone-sub="stock"]',
    advance: 'fleet_expanded',
  },
  {
    id: 'fleet_done',
    title: 'SQUAD ONLINE',
    body: 'Keep buying bays and types as you earn FRAG. UPGRADES on the same tab boost hull, damage, and respawn.',
    advance: 'tap',
    cta: 'ENGAGE',
  },
];

const GUN_STEPS: TutorialStep[] = [
  {
    id: 'gun_farm',
    title: 'MAIN GUN',
    body: 'Farm 100 FRAG for a main-gun upgrade. Split Beam adds a concurrent bolt.',
    advance: 'afford_gun',
    target: 100,
  },
  {
    id: 'gun_hint',
    title: 'UPGRADE THE CANNON',
    body: 'Open SHOP → GUN and buy Split Beam (+1 concurrent bolt). It multiplies your output.',
    highlight: '#btn-tech',
    advance: 'shop_open',
    cta: 'OPEN SHOP',
  },
  {
    id: 'gun_buy',
    title: 'SPLIT BEAM',
    body: 'Purchase Split Beam on the GUN tab. Extra concurrent bolts chew faces faster.',
    highlight: '[data-id="off_multi_1"]',
    advance: 'gun_owned',
  },
  {
    id: 'gun_done',
    title: 'VOLLEY ONLINE',
    body: 'Further GUN ranks add more bolts, pierce, splash, and magazines. Keep firing.',
    advance: 'tap',
    cta: 'ENGAGE',
  },
];

const FLYER_STEPS: TutorialStep[] = [
  {
    id: 'flyer_strafe',
    title: 'STRAFE',
    body: 'LEFT stick slides you in the lane. Stick is screen-relative — the ship leans with the path.',
    highlight: '#joy-zone',
    advance: 'strafe',
    target: 0.45,
  },
  {
    id: 'flyer_gates',
    title: 'SHOOT THE GATES',
    body: 'RIGHT side fires. Pink lock diamond means a gate is in the pipe — shoot it for a clear line.',
    highlight: '#aim-zone',
    advance: 'flyer_lock',
  },
  {
    id: 'flyer_banks',
    title: 'BANKS AHEAD',
    body: 'The ribbon banks, sweeps, and loops. Hold the lane through the roll — walls hurt.',
    advance: 'time',
    target: 3.2,
    cta: 'FLY',
  },
];

const LOADOUT_STEPS: TutorialStep[] = [
  {
    id: 'loadout_intro',
    title: 'HARDPOINT ONLINE',
    body: 'Modular weapons are online. Rocket Pods drop from under the wings, ignite, and smash lattice clusters.',
    advance: 'tap',
    cta: 'CONTINUE',
  },
  {
    id: 'loadout_buy',
    title: 'ACQUIRE ROCKET POD',
    body: 'Open SHOP → LOADOUTS and purchase Rocket Pod with Fragments. Equip it to Hardpoint 1.',
    highlight: '#btn-tech',
    advance: 'weapon_owned',
    cta: 'OPEN SHOP',
  },
  {
    id: 'loadout_equip',
    title: 'EQUIP',
    body: 'In LOADOUTS, select Hardpoint 1 and equip Rocket Pod. Auto-fire releases heavy rockets from the wings.',
    advance: 'weapon_equipped',
  },
  {
    id: 'loadout_done',
    title: 'PODS ARMED',
    body: 'Upgrade Payload & Barrage branches later for bigger warheads and multi-rocket volleys.',
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
  /** Fragments >= first drone cost and not yet owned */
  canAffordDrone: boolean;
  ownsDrone: boolean;
  fragments: number;
  /** Can pay for a 2nd active drone (bay and/or unit). */
  canAffordSecondDrone: boolean;
  /** Two or more drones assigned to bays. */
  fleetExpanded: boolean;
  /** Owns Split Beam (off_multi_1). */
  ownsSplitBeam: boolean;
  /** Transit: stick magnitude this frame. */
  flyerStrafe?: number;
  /** Transit: gate lock diamond is hot. */
  flyerLock?: boolean;
  /** Transit: fire pulse this frame. */
  flyerFire?: boolean;
}

/** First drone tech node cost (Ally Protocol). */
export const TUTORIAL_DRONE_COST = FIRST_DRONE_COST;
export const TUTORIAL_DRONE_ID = 'drone_unlock';

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
  private fleetDone: boolean;
  private gunDone: boolean;
  private flyerDone: boolean;
  private pendingLoadout = false;
  private pendingFleet = false;
  private pendingGun = false;
  /** When true, card stays hidden (shop open) until notifyShopClosed. */
  private suppressCard = false;
  /** Purchase/equip completed while shop open — reveal next step on close. */
  private pendingPostShopReveal = false;

  onRequestShop: (() => void) | null = null;
  onComplete: ((id: TutorialId) => void) | null = null;

  constructor(
    root: HTMLElement,
    flags: {
      stage1Done: boolean;
      loadoutDone: boolean;
      fleetDone?: boolean;
      gunDone?: boolean;
      flyerDone?: boolean;
    }
  ) {
    this.root = root;
    this.stage1Done = flags.stage1Done;
    this.loadoutDone = flags.loadoutDone;
    this.fleetDone = !!flags.fleetDone;
    this.gunDone = !!flags.gunDone;
    this.flyerDone = !!flags.flyerDone;
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

  /** Call when player can afford Rocket Pod and doesn't own it (stage 3+). */
  tryStartLoadout(): void {
    if (this.loadoutDone || this.active || this.pendingLoadout) return;
    if (this.stage1Done) {
      this.begin('loadout', LOADOUT_STEPS);
    } else {
      this.pendingLoadout = true;
    }
  }

  /** Call when a second drone is affordable and the player already owns the first. */
  tryStartFleet(): void {
    if (this.fleetDone || this.active || this.pendingFleet) return;
    if (this.stage1Done) {
      this.begin('fleet', FLEET_STEPS);
    } else {
      this.pendingFleet = true;
    }
  }

  /** First transfer flight — strafe / gates / banks. */
  tryStartFlyer(): void {
    if (this.flyerDone || this.active) return;
    this.begin('flyer', FLYER_STEPS);
  }

  /** After 2 drones, when the player has 100 FRAG again — push Split Beam. */
  tryStartGun(): void {
    if (this.gunDone || this.active || this.pendingGun) return;
    if (this.stage1Done && this.fleetDone) {
      this.begin('gun', GUN_STEPS);
    } else {
      this.pendingGun = true;
    }
  }

  setFlags(
    stage1Done: boolean,
    loadoutDone: boolean,
    fleetDone = false,
    gunDone = false,
    flyerDone = false
  ): void {
    this.stage1Done = stage1Done;
    this.loadoutDone = loadoutDone;
    this.fleetDone = fleetDone;
    this.gunDone = gunDone;
    this.flyerDone = flyerDone;
  }

  update(dt: number, ctx: TutorialProgressCtx): void {
    if (!this.active || !this.visible) {
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
      if (
        this.pendingFleet &&
        this.stage1Done &&
        !this.fleetDone &&
        !this.active &&
        ctx.canAffordSecondDrone &&
        !ctx.fleetExpanded
      ) {
        this.pendingFleet = false;
        this.begin('fleet', FLEET_STEPS);
      }
      if (
        this.pendingGun &&
        this.stage1Done &&
        this.fleetDone &&
        !this.gunDone &&
        !this.active &&
        ctx.fragments >= 100 &&
        !ctx.ownsSplitBeam
      ) {
        this.pendingGun = false;
        this.begin('gun', GUN_STEPS);
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
    if (step.advance === 'strafe') {
      this.orbitAccum += (ctx.flyerStrafe ?? ctx.orbitMag) * dt;
      this.setProgress(this.orbitAccum / (step.target ?? 1));
      if (this.orbitAccum >= (step.target ?? 1)) this.advance();
      return;
    }
    if (step.advance === 'flyer_lock') {
      if (ctx.flyerLock) this.orbitAccum += dt * 1.2;
      if (ctx.flyerFire) this.orbitAccum += 0.35;
      this.setProgress(this.orbitAccum / 1.2);
      if ((ctx.flyerLock && ctx.flyerFire) || this.orbitAccum >= 1.2) this.advance();
      return;
    }
    if (step.advance === 'time') {
      this.orbitAccum += dt;
      this.setProgress(this.orbitAccum / (step.target ?? 1));
      if (this.orbitAccum >= (step.target ?? 1)) this.advance();
      return;
    }
    if (step.advance === 'destroy') {
      const t = step.target ?? 10;
      this.setProgress(ctx.blocksDestroyedSession / t);
      if (ctx.blocksDestroyedSession >= t) this.advance();
      return;
    }
    if (step.advance === 'afford_drone') {
      const need = step.target ?? TUTORIAL_DRONE_COST;
      this.ensureFarmChip(true);
      const val = this.root.querySelector('#tutorial-farm-val');
      if (val) {
        val.textContent = `${Math.floor(ctx.fragments)} / ${need}`;
      }
      // Only open the shop tutorial card once the purchase is actually affordable
      if (ctx.canAffordDrone || ctx.ownsDrone) {
        this.ensureFarmChip(false);
        this.advance();
      }
      return;
    }
    // shop_open is handled in notifyShopOpened (hide card immediately)
    if (step.advance === 'shop_open' && ctx.shopOpen) {
      this.completeShopOpenStep();
      return;
    }
    // Purchase/equip steps: advance silently while shopping; show next only after close
    if (step.advance === 'drone_owned' && ctx.ownsDrone) {
      this.advanceAfterShopGate();
      return;
    }
    if (step.advance === 'fleet_expanded' && ctx.fleetExpanded) {
      this.advanceAfterShopGate();
      return;
    }
    if (step.advance === 'afford_gun') {
      const need = step.target ?? 100;
      this.ensureFarmChip(true, 'GUN FUND', need);
      const val = this.root.querySelector('#tutorial-farm-val');
      if (val) val.textContent = `${Math.floor(ctx.fragments)} / ${need}`;
      if (ctx.fragments >= need || ctx.ownsSplitBeam) {
        this.ensureFarmChip(false);
        this.advance();
      }
      return;
    }
    if (step.advance === 'gun_owned' && ctx.ownsSplitBeam) {
      this.advanceAfterShopGate();
      return;
    }
    if (step.advance === 'weapon_owned' && ctx.ownsArcBeam) {
      this.advanceAfterShopGate();
      return;
    }
    if (step.advance === 'weapon_equipped' && ctx.hasEquippedWeapon) {
      this.advanceAfterShopGate();
      return;
    }
    // Gate shop_hint until drone is affordable
    if (step.id === 'shop_hint' && !ctx.canAffordDrone && !ctx.ownsDrone) {
      this.setBody(
        `Keep destroying blocks. Shop unlocks when you can afford your first drone (${TUTORIAL_DRONE_COST} FRAG).`
      );
    }
  }

  hide(): void {
    this.visible = false;
    const card = this.root.querySelector('#tutorial-card');
    if (card) (card as HTMLElement).classList.add('panel-hidden');
    this.ensureFarmChip(false);
    this.clearHighlight();
  }

  /** Hide only the briefing card (tutorial still active). */
  private hideCard(): void {
    const card = this.root.querySelector('#tutorial-card') as HTMLElement | null;
    if (card) card.classList.add('panel-hidden');
    this.clearHighlight();
    this.ensureFarmChip(false);
  }

  showIfActive(): void {
    if (!this.active) return;
    this.visible = true;
    // Don't pop a card over an open shop
    if (this.suppressCard) {
      this.hideCard();
      return;
    }
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
    this.orbitAccum = 0;
    this.aimAccum = 0;
    this.renderStep();
  }

  /** Advance while shop may be open — keep card hidden until shop closes. */
  private advanceAfterShopGate(): void {
    this.index++;
    if (this.index >= this.steps.length) {
      this.finish();
      return;
    }
    this.orbitAccum = 0;
    this.aimAccum = 0;
    if (this.suppressCard) {
      this.pendingPostShopReveal = true;
      this.hideCard();
      return;
    }
    this.renderStep();
  }

  private completeShopOpenStep(): void {
    if (this.currentStep?.advance !== 'shop_open') return;
    this.suppressCard = true;
    // Advance off shop_open; keep card hidden until shop closes
    this.index++;
    if (this.index >= this.steps.length) {
      this.finish();
      return;
    }
    this.orbitAccum = 0;
    this.aimAccum = 0;
    this.pendingPostShopReveal = true;
    this.hideCard();
  }

  private finish(): void {
    const id = this.active;
    if (id === 'stage1') this.stage1Done = true;
    if (id === 'loadout') this.loadoutDone = true;
    if (id === 'fleet') this.fleetDone = true;
    if (id === 'gun') this.gunDone = true;
    if (id === 'flyer') this.flyerDone = true;
    this.active = null;
    this.visible = false;
    this.suppressCard = false;
    this.pendingPostShopReveal = false;
    this.hide();
    if (id) this.onComplete?.(id);
  }

  private ensureDom(): void {
    if (this.root.querySelector('#tutorial-card')) return;
    const el = document.createElement('div');
    el.id = 'tutorial-card';
    el.className = 'tutorial-card docked-actions-card panel-hidden interactive';
    el.innerHTML = `
      <div class="card-body">
        <div class="tutorial-kicker">GUIDED BRIEFING</div>
        <div class="tutorial-title" id="tutorial-title"></div>
        <div class="tutorial-body" id="tutorial-body"></div>
        <div class="tutorial-progress panel-hidden" id="tutorial-progress">
          <i id="tutorial-progress-bar"></i>
        </div>
      </div>
      <div class="card-actions">
        <button type="button" class="tutorial-cta ui-btn" id="tutorial-cta">CONTINUE</button>
        <button type="button" class="tutorial-skip" id="tutorial-skip">Skip tutorial</button>
      </div>
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
      step.id === 'shop_drone' ||
      step.id === 'fleet_hint' ||
      step.id === 'fleet_expand' ||
      step.id === 'gun_hint' ||
      step.id === 'gun_buy' ||
      step.advance === 'weapon_owned' ||
      step.advance === 'drone_owned' ||
      step.advance === 'gun_owned'
    ) {
      // openTech → notifyShopOpened advances shop_open once; do not double-advance here
      this.onRequestShop?.();
    }
  }

  /**
   * Call when player opens the tech shop (any path).
   * Completes “open shop” steps and hides the briefing until the shop closes.
   */
  notifyShopOpened(): void {
    if (!this.active) return;
    this.suppressCard = true;
    this.hideCard();
    if (this.currentStep?.advance === 'shop_open') {
      this.completeShopOpenStep();
    }
    const next = this.currentStep;
    if (next?.highlight && (this.active === 'fleet' || this.active === 'gun')) {
      this.applyHighlight(next.highlight);
    }
  }

  /**
   * Call when the shop closes. Reveals the current (or next) briefing step.
   * Purchase gates should already have advanced via notifyPurchase / update().
   */
  notifyShopClosed(ctx?: {
    ownsDrone?: boolean;
    ownsArcBeam?: boolean;
    hasEquippedWeapon?: boolean;
    fleetExpanded?: boolean;
    ownsSplitBeam?: boolean;
  }): void {
    if (!this.active) return;
    this.suppressCard = false;

    // Catch up any purchase/equip that happened while shopping
    const step = this.currentStep;
    if (step) {
      if (
        (step.advance === 'drone_owned' || step.id === 'shop_drone') &&
        ctx?.ownsDrone
      ) {
        this.advanceAfterShopGate();
      } else if (step.advance === 'weapon_owned' && ctx?.ownsArcBeam) {
        this.advanceAfterShopGate();
      } else if (step.advance === 'weapon_equipped' && ctx?.hasEquippedWeapon) {
        this.advanceAfterShopGate();
      } else if (step.advance === 'fleet_expanded' && ctx?.fleetExpanded) {
        this.advanceAfterShopGate();
      } else if (step.advance === 'gun_owned' && ctx?.ownsSplitBeam) {
        this.advanceAfterShopGate();
      }
    }

    this.pendingPostShopReveal = false;
    this.visible = true;
    this.renderStep();
  }

  /**
   * Call on shop purchase. Stage-1 only advances on first drone (`drone_unlock`).
   * Pass `nodeId` when known so we can require Ally Protocol.
   * Does not show the next popup while the shop is still open.
   */
  notifyPurchase(nodeId?: string): void {
    if (!this.active) return;
    const step = this.currentStep;
    if (!step) return;

    if (step.advance === 'drone_owned' || step.id === 'shop_drone') {
      // Only complete when the drone was actually bought
      if (nodeId && nodeId !== TUTORIAL_DRONE_ID) return;
      this.advanceAfterShopGate();
      return;
    }
    if (step.advance === 'weapon_owned') {
      // Weapon shop purchase (Game passes defId, e.g. rocket_pod)
      if (nodeId) this.advanceAfterShopGate();
      return;
    }
    if (step.advance === 'gun_owned') {
      if (nodeId === 'off_multi_1') this.advanceAfterShopGate();
      return;
    }
  }

  /** Force-advance drone step when ownership is confirmed. */
  notifyDroneOwned(): void {
    if (!this.active) return;
    const step = this.currentStep;
    if (step && (step.advance === 'drone_owned' || step.id === 'shop_drone')) {
      this.advanceAfterShopGate();
    }
  }

  /** Second drone assigned — complete fleet expand step. */
  notifyFleetExpanded(): void {
    if (!this.active) return;
    const step = this.currentStep;
    if (step && (step.advance === 'fleet_expanded' || step.id === 'fleet_expand')) {
      this.advanceAfterShopGate();
    }
  }

  /** Equip hardpoint during loadout tutorial. */
  notifyWeaponEquipped(): void {
    if (!this.active) return;
    const step = this.currentStep;
    if (step && step.advance === 'weapon_equipped') {
      this.advanceAfterShopGate();
    }
  }

  /** True while stage-1 welcome (first popup) is still on screen. */
  isAwaitingWelcomeAck(): boolean {
    return this.active === 'stage1' && this.currentStep?.id === 'welcome';
  }

  /** True if stage-1 tutorial is running (any step). */
  isStage1Active(): boolean {
    return this.active === 'stage1';
  }

  completeIf(id: TutorialId): void {
    if (this.active === id) this.finish();
  }

  private renderStep(): void {
    this.ensureDom();
    const step = this.currentStep;
    const card = this.root.querySelector('#tutorial-card') as HTMLElement | null;
    if (!card || !step) return;

    // Never overlay briefing on the shop UI
    if (this.suppressCard) {
      this.hideCard();
      return;
    }

    // Farming for drone frags: no big popup — keep gameplay clear until purchase is ready
    if (step.advance === 'afford_drone' || step.advance === 'destroy' || step.advance === 'afford_gun') {
      card.classList.add('panel-hidden');
      this.clearHighlight();
      this.ensureFarmChip(
        true,
        step.advance === 'afford_gun' ? 'GUN FUND' : 'DRONE FUND',
        step.target ?? TUTORIAL_DRONE_COST
      );
      return;
    }
    this.ensureFarmChip(false);

    card.classList.toggle('flyer-brief', this.active === 'flyer');
    card.classList.remove('panel-hidden');
    const title = card.querySelector('#tutorial-title');
    const body = card.querySelector('#tutorial-body');
    const cta = card.querySelector('#tutorial-cta') as HTMLButtonElement | null;
    const prog = card.querySelector('#tutorial-progress') as HTMLElement | null;
    if (title) title.textContent = step.title;
    if (body) body.textContent = step.body;
    if (cta) {
      const show =
        !!step.cta ||
        step.advance === 'tap' ||
        step.advance === 'shop_open' ||
        step.advance === 'drone_owned' ||
        step.advance === 'weapon_owned' ||
        step.id === 'fleet_hint' ||
        step.id === 'gun_hint';
      cta.classList.toggle('panel-hidden', !show);
      cta.textContent = step.cta ?? 'CONTINUE';
    }
    if (prog) {
      const showProg =
        step.advance === 'orbit' ||
        step.advance === 'aim' ||
        step.advance === 'strafe' ||
        step.advance === 'time';
      prog.classList.toggle('panel-hidden', !showProg);
    }
    this.clearHighlight();
    // Only highlight in-world HUD targets when not shopping
    if (step.highlight && !step.highlight.includes('shop') && !step.highlight.includes('data-id')) {
      this.applyHighlight(step.highlight);
    } else if (step.highlight && step.advance === 'shop_open') {
      this.applyHighlight(step.highlight);
    }
  }

  /** Compact non-blocking FRAG progress while farming for first drone. */
  private ensureFarmChip(show: boolean, label = 'DRONE FUND', need = TUTORIAL_DRONE_COST): void {
    let chip = this.root.querySelector('#tutorial-farm-chip') as HTMLElement | null;
    if (!show) {
      chip?.classList.add('panel-hidden');
      return;
    }
    if (!chip) {
      chip = document.createElement('div');
      chip.id = 'tutorial-farm-chip';
      chip.className = 'tutorial-farm-chip';
      chip.innerHTML =
        `<span class="tfc-label">${label}</span><span class="tfc-val" id="tutorial-farm-val">0 / ${need}</span>`;
      this.root.appendChild(chip);
    } else {
      const lab = chip.querySelector('.tfc-label');
      if (lab) lab.textContent = label;
    }
    chip.classList.remove('panel-hidden');
  }

  private setProgress(p: number): void {
    const bar = this.root.querySelector('#tutorial-progress-bar') as HTMLElement | null;
    if (bar) bar.style.width = `${Math.min(100, Math.max(0, p * 100))}%`;
  }

  private setBody(text: string): void {
    const body = this.root.querySelector('#tutorial-body');
    if (body && body.textContent !== text) body.textContent = text;
  }

  private applyHighlight(sel: string): void {
    try {
      // Support comma-separated selectors
      for (const part of sel.split(',').map((s) => s.trim())) {
        document.querySelectorAll(part).forEach((el) => {
          el.classList.add('tutorial-highlight');
        });
      }
    } catch {
      /* ignore bad selectors */
    }
  }

  private clearHighlight(): void {
    document.querySelectorAll('.tutorial-highlight').forEach((el) => {
      el.classList.remove('tutorial-highlight');
    });
  }
}
