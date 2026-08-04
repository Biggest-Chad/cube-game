import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Gentle cinematic bloom — readable blocks, soft neon glow on emissives/VFX.
 * Adaptive strength for mid-range mobile.
 */
export class PostProcessing {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  private highStrength = 0.34;
  private lowStrength = 0.16;
  private highThreshold = 0.62;
  private lowThreshold = 0.78;
  private highRadius = 0.42;
  private lowRadius = 0.28;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    const size = renderer.getSize(new THREE.Vector2());
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      this.highStrength,
      this.highRadius,
      this.highThreshold
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w, h);
  }

  setQuality(high: boolean): void {
    this.bloom.strength = high ? this.highStrength : this.lowStrength;
    this.bloom.threshold = high ? this.highThreshold : this.lowThreshold;
    this.bloom.radius = high ? this.highRadius : this.lowRadius;
    this.bloom.enabled = true;
  }

  /** Slightly richer bloom during menu / cinematic (presentation). */
  setPresentation(boost: boolean): void {
    if (boost) {
      this.bloom.strength = this.highStrength * 1.15;
      this.bloom.threshold = Math.max(0.55, this.highThreshold - 0.05);
    }
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
  }
}
