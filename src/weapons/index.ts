import type { WeaponFamily } from '../data/weapons';
import type { WeaponBehavior } from './WeaponBehavior';
import { MainBeamWeapon } from './MainBeamWeapon';
import { RocketWeapon } from './RocketWeapon';
import { MissileWeapon } from './MissileWeapon';
import { RailgunWeapon } from './RailgunWeapon';
import { FlakWeapon } from './FlakWeapon';
import { TorpedoWeapon } from './TorpedoWeapon';

export type { WeaponBehavior, WeaponFireContext } from './WeaponBehavior';
export { MainBeamWeapon } from './MainBeamWeapon';
export { RocketWeapon } from './RocketWeapon';
export { MissileWeapon } from './MissileWeapon';
export { RailgunWeapon } from './RailgunWeapon';
export { FlakWeapon } from './FlakWeapon';
export { TorpedoWeapon } from './TorpedoWeapon';

export function createWeaponBehavior(family: WeaponFamily | string): WeaponBehavior {
  switch (family) {
    case 'pulse':
    case 'beam':
      return new MainBeamWeapon();
    case 'rocket':
      return new RocketWeapon();
    case 'missile':
      return new MissileWeapon();
    case 'rail':
      return new RailgunWeapon();
    case 'flak':
      return new FlakWeapon();
    case 'torpedo':
      return new TorpedoWeapon();
    default:
      return new MainBeamWeapon();
  }
}
