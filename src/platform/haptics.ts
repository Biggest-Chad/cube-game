/**
 * Gentle damage pulses via navigator.vibrate (Android WebView).
 * No @capacitor/haptics — short ticks only, no settings toggle.
 */

export function playDamageHaptic(opts: {
  shieldDamage: number;
  hullDamage: number;
  maxShield: number;
  maxHull: number;
}): void {
  const absorbed = opts.shieldDamage + opts.hullDamage;
  if (absorbed <= 0) return;

  const poolMax =
    opts.shieldDamage > 0 && opts.hullDamage <= 0
      ? opts.maxShield
      : opts.hullDamage > 0 && opts.shieldDamage <= 0
        ? opts.maxHull
        : Math.max(opts.maxShield, opts.maxHull);
  const intensity = Math.min(1, Math.max(0, absorbed / Math.max(1, poolMax)));
  const ms = Math.min(36, Math.max(8, Math.round(8 + intensity * 28)));

  try {
    const vibrate = navigator.vibrate?.bind(navigator);
    if (!vibrate) return;
    if (intensity > 0.55) {
      vibrate([ms, 30, Math.max(6, Math.round(ms * 0.45))]);
    } else {
      vibrate(ms);
    }
  } catch {
    /* vibrate unsupported / denied */
  }
}
