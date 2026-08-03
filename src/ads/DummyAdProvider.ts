import type { AdPlacement, AdProvider, AdResult } from './AdProvider';

/**
 * Instant-success rewarded ads for development / offline builds.
 */
export class DummyAdProvider implements AdProvider {
  readonly name = 'dummy';

  isReady(_placement: AdPlacement): boolean {
    return true;
  }

  async showRewarded(placement: AdPlacement): Promise<AdResult> {
    // Simulate a tiny async boundary like a real SDK
    await Promise.resolve();
    return { status: 'rewarded', placement };
  }
}
