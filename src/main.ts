import './style.css';
import { Game } from './core/Game';
import {
  ensureRotateOverlay,
  initDisplayChrome,
  tryImmersiveFullscreen,
  tryLockLandscape,
} from './platform/display';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
if (!canvas) {
  throw new Error('Missing #game-canvas');
}

// Landscape lock, safe-area CSS vars, rotate-device overlay
initDisplayChrome();
ensureRotateOverlay();

// Prevent multi-touch page gestures on iOS/Android (allow panel scroll)
document.addEventListener(
  'touchmove',
  (e) => {
    if (
      (e.target as HTMLElement)?.closest?.(
        '.tech-scroll, .level-grid, .shop-scroll, .tech-panel, .level-panel, .shop-panel'
      )
    ) {
      return;
    }
    e.preventDefault();
  },
  { passive: false }
);

// Re-assert landscape + immersive when returning from background
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    void tryLockLandscape();
  }
});

const game = new Game(canvas);

// Expose for debug in devtools
(window as unknown as { __cubeGame: Game }).__cubeGame = game;

// Best-effort immersive after first interaction (Android browser chrome)
window.addEventListener(
  'pointerdown',
  () => {
    void tryLockLandscape();
    void tryImmersiveFullscreen();
  },
  { passive: true, once: true }
);
