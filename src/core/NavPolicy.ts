/**
 * Pure overlay / menu navigation policy.
 * Game.ts is the only caller — this exists so close/open decisions
 * cannot silently reload a sector or drop the player into a new demo cube.
 */

export type OverlayCloseDest = 'resume' | 'pause' | 'menu' | 'clear';

export type GameNavMode =
  | 'menu'
  | 'intro'
  | 'cinematic'
  | 'playing'
  | 'core_death'
  | 'levelclear'
  | 'tech'
  | 'research'
  | 'levels'
  | 'loadout'
  | 'settings'
  | 'paused'
  | 'dying'
  | 'dead';

const LIVE_COMBAT_MODES: ReadonlySet<GameNavMode> = new Set([
  'playing',
  'intro',
  'paused',
]);

const OVERLAY_MODES: ReadonlySet<GameNavMode> = new Set([
  'tech',
  'research',
  'levels',
  'loadout',
  'settings',
]);

/** Modes where opening shop / settings / pause is allowed. */
export function canOpenOverlay(mode: GameNavMode): boolean {
  if (mode === 'core_death' || mode === 'dying' || mode === 'dead') return false;
  if (mode === 'cinematic') return false;
  return true;
}

/** True when HUD Menu should pause the live sector instead of extracting. */
export function shouldPauseInsteadOfExtract(mode: GameNavMode): boolean {
  return mode === 'playing' || mode === 'intro' || mode === 'paused';
}

/**
 * Opening settings / shop / sectors from a live seat (not the menu demo).
 * Menu demo has a populated cube — aliveBlocks must never imply combat.
 */
export function isFromCombatSeat(opts: {
  mode: GameNavMode;
  menuDemoActive: boolean;
  pendingReturnPlaying: boolean;
}): boolean {
  if (opts.menuDemoActive) return false;
  if (LIVE_COMBAT_MODES.has(opts.mode)) return true;
  if (OVERLAY_MODES.has(opts.mode) && opts.pendingReturnPlaying) return true;
  return false;
}

/**
 * Where an overlay Close / Back / Escape should land.
 * Settings must never fall through to a fresh startLevel / startMenuDemo.
 */
export function resolveOverlayClose(opts: {
  pendingReturnPlaying: boolean;
  menuDemoActive: boolean;
  returnToPause: boolean;
  returnToClear?: boolean;
}): OverlayCloseDest {
  // LEVEL CLEAR shop/loadout must restore the clear card — never resume a wiped cube.
  if (opts.returnToClear) return 'clear';
  if (opts.pendingReturnPlaying && !opts.menuDemoActive) {
    return opts.returnToPause ? 'pause' : 'resume';
  }
  return 'menu';
}

/**
 * Whether returning to the title screen may keep the existing demo cube.
 * Reloading the demo calls loadLevel() and looks like a new stage.
 */
export function shouldReloadMenuDemo(opts: {
  forceReload: boolean;
  leavingCombat: boolean;
  menuDemoActive: boolean;
  preserveDemo: boolean;
  hasDemoCube: boolean;
}): boolean {
  if (opts.forceReload) return true;
  if (opts.leavingCombat) return true;
  if (!opts.hasDemoCube) return true;
  if (opts.preserveDemo && opts.menuDemoActive) return false;
  if (opts.menuDemoActive) return false;
  return true;
}

/** Click-lock after remounting menu/pause so the closing tap cannot hit START / RESUME. */
export const UI_CLICK_LOCK_MS = 380;

/** Dev / adversarial invariant table. Throws if navigation policy regresses. */
export function assertNavPolicyInvariants(): void {
  const closeMenu = resolveOverlayClose({
    pendingReturnPlaying: false,
    menuDemoActive: true,
    returnToPause: false,
  });
  if (closeMenu !== 'menu') throw new Error(`settings-from-menu must return menu, got ${closeMenu}`);

  const closeCombat = resolveOverlayClose({
    pendingReturnPlaying: true,
    menuDemoActive: false,
    returnToPause: false,
  });
  if (closeCombat !== 'resume') throw new Error(`settings-from-combat must resume, got ${closeCombat}`);

  const closePause = resolveOverlayClose({
    pendingReturnPlaying: true,
    menuDemoActive: false,
    returnToPause: true,
  });
  if (closePause !== 'pause') throw new Error(`settings-from-pause must return pause, got ${closePause}`);

  const demoReload = shouldReloadMenuDemo({
    forceReload: false,
    leavingCombat: false,
    menuDemoActive: true,
    preserveDemo: true,
    hasDemoCube: true,
  });
  if (demoReload) throw new Error('closing settings on menu must NOT reload demo cube');

  const extractReload = shouldReloadMenuDemo({
    forceReload: true,
    leavingCombat: true,
    menuDemoActive: false,
    preserveDemo: false,
    hasDemoCube: false,
  });
  if (!extractReload) throw new Error('extract / first boot must load demo cube');

  if (isFromCombatSeat({ mode: 'menu', menuDemoActive: true, pendingReturnPlaying: false })) {
    throw new Error('menu demo must never count as combat');
  }
  if (!isFromCombatSeat({ mode: 'playing', menuDemoActive: false, pendingReturnPlaying: true })) {
    throw new Error('playing must count as combat seat');
  }
  if (shouldPauseInsteadOfExtract('playing') !== true) {
    throw new Error('HUD menu during play must pause');
  }
  if (shouldPauseInsteadOfExtract('menu') !== false) {
    throw new Error('title screen must not enter pause');
  }
  const closeClear = resolveOverlayClose({
    pendingReturnPlaying: true,
    menuDemoActive: false,
    returnToPause: false,
    returnToClear: true,
  });
  if (closeClear !== 'clear') throw new Error('clear-shop close must restore LEVEL CLEAR card');
}
