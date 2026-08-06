/**
 * In-app purchase seam — Dummy grants Core immediately; real billing later.
 */
import { CORE_PACKS, type CorePackDef } from '../data/research';
import { bus } from '../core/EventBus';

export type IapResultStatus = 'purchased' | 'cancelled' | 'failed' | 'not_ready';

export interface IapResult {
  status: IapResultStatus;
  packId: string;
  reason?: string;
}

export interface IapProvider {
  readonly name: string;
  isReady(): boolean;
  purchase(pack: CorePackDef): Promise<IapResult>;
}

/** Dev / playtest provider — always succeeds after a short delay. */
export class DummyIapProvider implements IapProvider {
  readonly name = 'dummy';

  isReady(): boolean {
    return true;
  }

  async purchase(pack: CorePackDef): Promise<IapResult> {
    await new Promise((r) => setTimeout(r, 280));
    return { status: 'purchased', packId: pack.id };
  }
}

export class IapService {
  private provider: IapProvider;

  constructor(provider: IapProvider = new DummyIapProvider()) {
    this.provider = provider;
  }

  setProvider(provider: IapProvider): void {
    this.provider = provider;
  }

  getProviderName(): string {
    return this.provider.name;
  }

  listPacks(): CorePackDef[] {
    return CORE_PACKS.slice();
  }

  async buyCorePack(packId: string): Promise<{
    result: IapResult;
    coreGranted: number;
    pack: CorePackDef | null;
  }> {
    const pack = CORE_PACKS.find((p) => p.id === packId) ?? null;
    if (!pack) {
      return {
        result: { status: 'failed', packId, reason: 'unknown_pack' },
        coreGranted: 0,
        pack: null,
      };
    }
    if (!this.provider.isReady()) {
      return {
        result: { status: 'not_ready', packId, reason: 'provider' },
        coreGranted: 0,
        pack,
      };
    }
    const result = await this.provider.purchase(pack);
    if (result.status !== 'purchased') {
      return { result, coreGranted: 0, pack };
    }
    bus.emit('iap-core-purchased', { packId: pack.id, core: pack.core });
    return { result, coreGranted: pack.core, pack };
  }
}
