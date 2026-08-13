/**
 * Dual-stick input: left orbit, right aim (heavy, spring-return).
 * Main cannon auto-fires; aim stick offsets the beam from cube center.
 */
export class InputController {
  /** Orbit stick −1..1 */
  axisX = 0;
  axisY = 0;
  /** Raw aim stick −1..1 while held */
  aimRawX = 0;
  aimRawY = 0;
  /** Smoothed aim offset −1..1 (heavy lag + spring to 0 when released) */
  aimX = 0;
  aimY = 0;
  autoFire = true;
  private keys = new Set<string>();
  private joyPointerId: number | null = null;
  private joyOriginX = 0;
  private joyOriginY = 0;
  private joyActive = false;
  private aimPointerId: number | null = null;
  private aimOriginX = 0;
  private aimOriginY = 0;
  private aimActive = false;
  private pinchStartDist = 0;
  private zoomDelta = 0;
  private bound = false;

  private joyZone: HTMLElement | null = null;
  private stickEl: HTMLElement | null = null;
  private aimZone: HTMLElement | null = null;
  private aimStickEl: HTMLElement | null = null;

  bind(
    joyZone: HTMLElement,
    stickEl: HTMLElement,
    aimZone: HTMLElement,
    aimStickEl: HTMLElement
  ): void {
    this.joyZone = joyZone;
    this.stickEl = stickEl;
    this.aimZone = aimZone;
    this.aimStickEl = aimStickEl;
    if (this.bound) return;
    this.bound = true;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    joyZone.addEventListener('pointerdown', this.onJoyDown);
    joyZone.addEventListener('pointermove', this.onJoyMove);
    joyZone.addEventListener('pointerup', this.onJoyUp);
    joyZone.addEventListener('pointercancel', this.onJoyUp);

    aimZone.addEventListener('pointerdown', this.onAimDown);
    aimZone.addEventListener('pointermove', this.onAimMove);
    aimZone.addEventListener('pointerup', this.onAimUp);
    aimZone.addEventListener('pointercancel', this.onAimUp);

    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('touchstart', this.onTouchStart, { passive: false });
    window.addEventListener('touchmove', this.onTouchMove, { passive: false });
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onJoyDown = (e: PointerEvent): void => {
    if (this.joyPointerId !== null) return;
    this.joyPointerId = e.pointerId;
    this.joyActive = true;
    this.joyOriginX = e.clientX;
    this.joyOriginY = e.clientY;
    this.joyZone?.setPointerCapture(e.pointerId);
    this.setStick(this.stickEl, 0, 0);
  };

  private onJoyMove = (e: PointerEvent): void => {
    if (!this.joyActive || e.pointerId !== this.joyPointerId) return;
    const { dx, dy, nx, ny } = this.clampStick(e.clientX - this.joyOriginX, e.clientY - this.joyOriginY, 52);
    this.axisX = nx;
    this.axisY = ny;
    this.setStick(this.stickEl, dx, dy);
  };

  private onJoyUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.joyPointerId) return;
    this.joyPointerId = null;
    this.joyActive = false;
    this.axisX = 0;
    this.axisY = 0;
    this.setStick(this.stickEl, 0, 0);
  };

  private onAimDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (this.aimPointerId !== null) return;
    this.aimPointerId = e.pointerId;
    this.aimActive = true;
    this.aimOriginX = e.clientX;
    this.aimOriginY = e.clientY;
    this.aimZone?.setPointerCapture(e.pointerId);
    this.aimZone?.classList.add('active');
    this.setStick(this.aimStickEl, 0, 0);
  };

  private onAimMove = (e: PointerEvent): void => {
    if (!this.aimActive || e.pointerId !== this.aimPointerId) return;
    const { dx, dy, nx, ny } = this.clampStick(
      e.clientX - this.aimOriginX,
      e.clientY - this.aimOriginY,
      48
    );
    this.aimRawX = nx;
    this.aimRawY = ny;
    this.setStick(this.aimStickEl, dx, dy);
  };

  private onAimUp = (e: PointerEvent): void => {
    if (this.aimPointerId !== null && e.pointerId !== this.aimPointerId) return;
    this.aimPointerId = null;
    this.aimActive = false;
    this.aimRawX = 0;
    this.aimRawY = 0;
    this.aimZone?.classList.remove('active');
    this.setStick(this.aimStickEl, 0, 0);
  };

  private clampStick(dx: number, dy: number, maxR: number) {
    const len = Math.hypot(dx, dy);
    if (len > maxR) {
      dx = (dx / len) * maxR;
      dy = (dy / len) * maxR;
    }
    return { dx, dy, nx: dx / maxR, ny: dy / maxR };
  }

  private setStick(el: HTMLElement | null, dx: number, dy: number): void {
    if (el) el.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  private onWheel = (e: WheelEvent): void => {
    this.zoomDelta += e.deltaY > 0 ? 1 : -1;
  };

  private onTouchStart = (e: TouchEvent): void => {
    if (e.touches.length === 2) {
      this.pinchStartDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (this.pinchStartDist > 0) {
        this.zoomDelta += (this.pinchStartDist - d) * 0.02;
        this.pinchStartDist = d;
      }
    }
  };

  /**
   * Per-frame: keyboard orbit + heavy aim spring.
   * @param dt seconds
   */
  update(dt = 1 / 60): void {
    let kx = 0;
    let ky = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ky -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ky += 1;
    if (!this.joyActive) {
      this.axisX = kx;
      this.axisY = ky;
    }

    // Keyboard fine-aim (IJKL)
    let tx = this.aimActive ? this.aimRawX : 0;
    let ty = this.aimActive ? this.aimRawY : 0;
    if (this.keys.has('KeyJ')) tx -= 1;
    if (this.keys.has('KeyL')) tx += 1;
    if (this.keys.has('KeyI')) ty -= 1;
    if (this.keys.has('KeyK')) ty += 1;
    tx = Math.max(-1, Math.min(1, tx));
    ty = Math.max(-1, Math.min(1, ty));

    // Heavy tracking when held; spring home when released
    const targetX = tx;
    const targetY = ty;
    const rate = this.aimActive || Math.abs(tx) > 0.01 || Math.abs(ty) > 0.01 ? 4.2 : 5.5;
    const k = 1 - Math.exp(-rate * dt);
    this.aimX += (targetX - this.aimX) * k;
    this.aimY += (targetY - this.aimY) * k;
    if (Math.abs(this.aimX) < 0.004) this.aimX = 0;
    if (Math.abs(this.aimY) < 0.004) this.aimY = 0;
  }

  /** Drop sticks / keys so pause / overlay cannot inherit a held orbit. */
  releaseAll(): void {
    this.joyPointerId = null;
    this.aimPointerId = null;
    this.joyActive = false;
    this.aimActive = false;
    this.axisX = 0;
    this.axisY = 0;
    this.aimRawX = 0;
    this.aimRawY = 0;
    this.aimX = 0;
    this.aimY = 0;
    this.zoomDelta = 0;
    this.keys.clear();
    this.setStick(this.stickEl, 0, 0);
    this.setStick(this.aimStickEl, 0, 0);
  }

  consumeZoom(): number {
    const z = this.zoomDelta;
    this.zoomDelta = 0;
    return z;
  }

  get isFiring(): boolean {
    // Auto-fire always; space still works as boost focus (same)
    return this.autoFire || this.keys.has('Space');
  }

  get isAiming(): boolean {
    return this.aimActive || Math.hypot(this.aimX, this.aimY) > 0.02;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('touchstart', this.onTouchStart);
    window.removeEventListener('touchmove', this.onTouchMove);
  }
}
