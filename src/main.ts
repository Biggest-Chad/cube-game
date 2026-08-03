import './style.css';
import { Game } from './core/Game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
if (!canvas) {
  throw new Error('Missing #game-canvas');
}

// Prevent multi-touch page gestures on iOS/Android
document.addEventListener(
  'touchmove',
  (e) => {
    if ((e.target as HTMLElement)?.closest?.('.tech-scroll, .level-grid, .tech-panel, .level-panel')) {
      return;
    }
    e.preventDefault();
  },
  { passive: false }
);

const game = new Game(canvas);

// Expose for debug in devtools
(window as unknown as { __cubeGame: Game }).__cubeGame = game;
