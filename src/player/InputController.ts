export class InputController {
  /** Joystick axes -1..1 */
  axisX = 0;
  axisY = 0;
  firing = false;
  autoFire = true;
  private keys = new Set<string>();
  private pointerId: number | null = null;
  private joyOriginX = 0;
  private joyOriginY = 0;
  private joyActive = false;
  private firePointerId: number | null = null;
  private pinchStartDist = 0;
  private zoomDelta = 0;
  private bound = false;

  private joyZone: HTMLElement | null = null;
  private stickEl: HTMLElement | null = null;
  private fireBtn: HTMLElement | null = null;

  bind(joyZone: HTMLElement, stickEl: HTMLElement, fireBtn: HTMLElement): void {
    this.joyZone = joyZone;
    this.stickEl = stickEl;
    this.fireBtn = fireBtn;
    if (this.bound) return;
    this.bound = true;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    joyZone.addEventListener('pointerdown', this.onJoyDown);
    joyZone.addEventListener('pointermove', this.onJoyMove);
    joyZone.addEventListener('pointerup', this.onJoyUp);
    joyZone.addEventListener('pointercancel', this.onJoyUp);

    fireBtn.addEventListener('pointerdown', this.onFireDown);
    fireBtn.addEventListener('pointerup', this.onFireUp);
    fireBtn.addEventListener('pointercancel', this.onFireUp);
    fireBtn.addEventListener('pointerleave', this.onFireUp);

    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('touchstart', this.onTouchStart, { passive: false });
    window.addEventListener('touchmove', this.onTouchMove, { passive: false });
    window.addEventListener('touchend', this.onTouchEnd);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
    if (e.code === 'Space') this.firing = true;
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
    if (e.code === 'Space') this.firing = false;
  };

  private onJoyDown = (e: PointerEvent): void => {
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.joyActive = true;
    this.joyOriginX = e.clientX;
    this.joyOriginY = e.clientY;
    this.joyZone?.setPointerCapture(e.pointerId);
    this.updateStick(0, 0);
  };

  private onJoyMove = (e: PointerEvent): void => {
    if (!this.joyActive || e.pointerId !== this.pointerId) return;
    const maxR = 48;
    let dx = e.clientX - this.joyOriginX;
    let dy = e.clientY - this.joyOriginY;
    const len = Math.hypot(dx, dy);
    if (len > maxR) {
      dx = (dx / len) * maxR;
      dy = (dy / len) * maxR;
    }
    this.axisX = dx / maxR;
    this.axisY = dy / maxR;
    this.updateStick(dx, dy);
  };

  private onJoyUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.joyActive = false;
    this.axisX = 0;
    this.axisY = 0;
    this.updateStick(0, 0);
  };

  private updateStick(dx: number, dy: number): void {
    if (this.stickEl) {
      this.stickEl.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }

  private onFireDown = (e: PointerEvent): void => {
    e.preventDefault();
    this.firePointerId = e.pointerId;
    this.firing = true;
    this.fireBtn?.classList.add('active');
    this.fireBtn?.setPointerCapture(e.pointerId);
  };

  private onFireUp = (e: PointerEvent): void => {
    if (this.firePointerId !== null && e.pointerId !== this.firePointerId) return;
    this.firePointerId = null;
    this.firing = false;
    this.fireBtn?.classList.remove('active');
  };

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
        const delta = (this.pinchStartDist - d) * 0.02;
        this.zoomDelta += delta;
        this.pinchStartDist = d;
      }
    }
  };

  private onTouchEnd = (): void => {
    if (!this.joyActive) {
      // keep
    }
  };

  /** Consume keyboard into axes each frame */
  update(): void {
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
  }

  consumeZoom(): number {
    const z = this.zoomDelta;
    this.zoomDelta = 0;
    return z;
  }

  get isFiring(): boolean {
    return this.firing || this.autoFire || this.keys.has('Space');
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('touchstart', this.onTouchStart);
    window.removeEventListener('touchmove', this.onTouchMove);
    window.removeEventListener('touchend', this.onTouchEnd);
  }
}
