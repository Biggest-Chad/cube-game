/**
 * Mobile display helpers: landscape lock, immersive fullscreen, safe-area CSS vars.
 * Works for PWA + Capacitor WebView. System chrome (status bar / nav buttons)
 * must not cover interactive HUD.
 */

const PORTRAIT_CLASS = 'orientation-portrait';

export function initDisplayChrome(): void {
  applySafeAreaCssVars();
  updateOrientationClass();
  void tryLockLandscape();

  window.addEventListener('resize', onViewportChange, { passive: true });
  window.addEventListener('orientationchange', onViewportChange, { passive: true });
  window.visualViewport?.addEventListener('resize', onViewportChange, { passive: true });
  window.visualViewport?.addEventListener('scroll', onViewportChange, { passive: true });

  // User-gesture friendly re-lock (some browsers only allow lock after interaction)
  const reentry = () => {
    void tryLockLandscape();
    void tryImmersiveFullscreen();
  };
  document.addEventListener('pointerdown', reentry, { passive: true, once: true });
  document.addEventListener('click', reentry, { passive: true });
}

function onViewportChange(): void {
  applySafeAreaCssVars();
  updateOrientationClass();
  void tryLockLandscape();
}

export function applySafeAreaCssVars(): void {
  const root = document.documentElement;
  const vv = window.visualViewport;
  // visualViewport can shrink under Android system bars; expose effective insets
  const layoutH = window.innerHeight;
  const layoutW = window.innerWidth;
  const vvH = vv?.height ?? layoutH;
  const vvW = vv?.width ?? layoutW;
  const vvTop = vv?.offsetTop ?? 0;
  const vvLeft = vv?.offsetLeft ?? 0;

  const bottomBleed = Math.max(0, layoutH - vvH - vvTop);
  const rightBleed = Math.max(0, layoutW - vvW - vvLeft);

  root.style.setProperty('--vv-top', `${vvTop}px`);
  root.style.setProperty('--vv-left', `${vvLeft}px`);
  root.style.setProperty('--vv-bottom', `${bottomBleed}px`);
  root.style.setProperty('--vv-right', `${rightBleed}px`);
  root.style.setProperty('--app-width', `${vvW}px`);
  root.style.setProperty('--app-height', `${vvH}px`);
}

function updateOrientationClass(): void {
  const portrait = window.innerHeight > window.innerWidth;
  document.documentElement.classList.toggle(PORTRAIT_CLASS, portrait);
  document.body?.classList.toggle(PORTRAIT_CLASS, portrait);
}

export async function tryLockLandscape(): Promise<void> {
  const orient = screen.orientation as ScreenOrientation & {
    lock?: (orientation: string) => Promise<void>;
  };
  if (!orient?.lock) return;
  try {
    await orient.lock('landscape');
  } catch {
    try {
      await orient.lock('landscape-primary');
    } catch {
      // Browser may refuse until fullscreen / user gesture — non-fatal
    }
  }
}

export async function tryImmersiveFullscreen(): Promise<void> {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  if (document.fullscreenElement) return;
  try {
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
  } catch {
    // Not available (iOS Safari, some WebViews) — safe areas still apply
  }

  // Hide mobile browser chrome where supported
  try {
    window.scrollTo(0, 1);
  } catch {
    /* ignore */
  }
}

export function ensureRotateOverlay(): void {
  if (document.getElementById('rotate-overlay')) return;
  const el = document.createElement('div');
  el.id = 'rotate-overlay';
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `
    <div class="rotate-card">
      <div class="rotate-icon" aria-hidden="true">⟳</div>
      <div class="rotate-title">LANDSCAPE ONLY</div>
      <div class="rotate-sub">Rotate your device to continue</div>
    </div>
  `;
  document.body.appendChild(el);
}
