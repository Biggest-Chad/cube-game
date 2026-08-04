import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  getGraphicsPreset,
  type GraphicsQuality,
} from '../data/graphics';

/**
 * Quality-tiered bloom. Low disables bloom (composer still used for consistency).
 */
export class PostProcessing {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  private quality: GraphicsQuality = 'medium';
  private presentationBoost = false;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    const size = renderer.getSize(new THREE.Vector2());
    const p = getGraphicsPreset('medium');
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      p.bloomStrength,
      p.bloomRadius,
      p.bloomThreshold
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.setQuality('medium');
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w, h);
  }

  setQuality(quality: GraphicsQuality | boolean): void {
    // Back-compat: boolean true → high, false → low
    if (typeof quality === 'boolean') {
      this.quality = quality ? 'high' : 'low';
    } else {
      this.quality = quality;
    }
    this.applyPreset();
  }

  getQuality(): GraphicsQuality {
    return this.quality;
  }

  /** Slightly richer bloom during menu / cinematic (presentation). */
  setPresentation(boost: boolean): void {
    this.presentationBoost = boost;
    this.applyPreset();
  }

  private applyPreset(): void {
    const p = getGraphicsPreset(this.quality);
    this.bloom.enabled = p.bloomEnabled;
    if (!p.bloomEnabled) return;
    let strength = p.bloomStrength;
    let threshold = p.bloomThreshold;
    if (this.presentationBoost && this.quality !== 'low') {
      strength *= 1.12;
      threshold = Math.max(0.52, threshold - 0.04);
    }
    this.bloom.strength = strength;
    this.bloom.threshold = threshold;
    this.bloom.radius = p.bloomRadius;
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
  }
}
