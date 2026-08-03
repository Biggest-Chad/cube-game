/**
 * Backward-compatible re-export — Game.ts continues importing TechTreeUI.
 * Implementation lives in ShopUI (tabbed sequential shop + stat panel).
 */
export { ShopUI as TechTreeUI, ShopUI, buildStatsSnapshot } from './ShopUI';
export type { StatsSnapshot } from './ShopUI';
