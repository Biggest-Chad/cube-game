import { bus } from '../core/EventBus';

export class Currency {
  dataFragments = 0;
  coreEnergy = 0;
  prestigeTokens = 0;

  addFragments(amount: number, mul = 1): number {
    const n = Math.max(0, Math.round(amount * mul));
    if (n <= 0) return 0;
    this.dataFragments += n;
    bus.emit('currency-changed', this.snapshot());
    return n;
  }

  addCoreEnergy(amount: number, mul = 1): number {
    const n = Math.max(0, Math.round(amount * mul));
    if (n <= 0) return 0;
    this.coreEnergy += n;
    bus.emit('currency-changed', this.snapshot());
    return n;
  }

  spendFragments(amount: number): boolean {
    if (this.dataFragments < amount) return false;
    this.dataFragments -= amount;
    bus.emit('currency-changed', this.snapshot());
    return true;
  }

  spendCoreEnergy(amount: number): boolean {
    if (this.coreEnergy < amount) return false;
    this.coreEnergy -= amount;
    bus.emit('currency-changed', this.snapshot());
    return true;
  }

  snapshot() {
    return {
      dataFragments: this.dataFragments,
      coreEnergy: this.coreEnergy,
      prestigeTokens: this.prestigeTokens,
    };
  }

  load(df: number, ce: number, pt: number): void {
    this.dataFragments = df;
    this.coreEnergy = ce;
    this.prestigeTokens = pt;
  }
}
