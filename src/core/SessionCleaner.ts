/**
 * Session hygiene: tear down combat-world residue between levels / menu.
 *
 * Systems register dispose/reset callbacks; Game (or any orchestrator) calls
 * `sessionCleaner.resetCombatWorld()` before loading the next cube.
 *
 * Typical cleaners: projectiles, beams, particles, rings, floating text,
 * enemy units, temporary cube VFX, weapon heat/cooldowns.
 */
export class SessionCleaner {
  private cleaners: Array<() => void> = [];

  /** Register a zero-arg teardown callback. Safe to call multiple times. */
  register(fn: () => void): void {
    this.cleaners.push(fn);
  }

  /** Remove a previously registered cleaner (identity match). */
  unregister(fn: () => void): void {
    const i = this.cleaners.indexOf(fn);
    if (i >= 0) this.cleaners.splice(i, 1);
  }

  /** Clear all registered cleaners (e.g. full game dispose). */
  clear(): void {
    this.cleaners.length = 0;
  }

  /**
   * Run every registered cleaner. Errors in one cleaner do not block others.
   * Call before level clear UI continues into next sector / retry / menu.
   */
  resetCombatWorld(): void {
    for (const fn of this.cleaners) {
      try {
        fn();
      } catch (err) {
        console.warn('[SessionCleaner] cleaner failed', err);
      }
    }
  }
}

/** Process-wide singleton for combat session teardown. */
export const sessionCleaner = new SessionCleaner();
