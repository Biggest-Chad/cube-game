import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  getGraphicsPreset,
  type GraphicsQuality,
} from '../data/graphics';

/**
 * Quality-tiered bloom. Low skips the composer and draws the scene directly.
 */
export class PostProcessing {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  private quality: GraphicsQuality = 'medium';
  private presentationBoost = false;
  /** Session heat cut — applyPreset must not turn bloom back on. */
  private thermalBloomCut = false;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
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
    // Skip OutputPass — Game.ts already sets ACES on the renderer; a second tone-map washes/darkens.
    this.setQuality('medium');
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
    // Half-res bloom on medium/low — big mobile GPU win
    const scale =
      this.quality === 'high' ? 1 : this.quality === 'medium' ? 0.5 : 0.35;
    this.bloom.resolution.set(Math.max(1, w * scale), Math.max(1, h * scale));
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

  /** Once set, bloom stays off until clearThermalBloomCut (user graphics change). */
  setThermalBloomCut(cut: boolean): void {
    this.thermalBloomCut = cut;
    if (cut) this.bloom.enabled = false;
    else this.applyPreset();
  }

  /** Slightly richer bloom during menu / cinematic (presentation). */
  setPresentation(boost: boolean): void {
    this.presentationBoost = boost;
    this.applyPreset();
  }

  private applyPreset(): void {
    const p = getGraphicsPreset(this.quality);
    this.bloom.enabled = p.bloomEnabled && !this.thermalBloomCut;
    if (!this.bloom.enabled) return;
    let strength = p.bloomStrength;
    let threshold = p.bloomThreshold;
    if (this.presentationBoost && this.quality !== 'low') {
      strength *= 1.08;
      // Don't undo cheaper medium bloom by dropping threshold below 0.75.
      threshold = Math.max(this.quality === 'high' ? 0.55 : 0.75, threshold - 0.03);
    }
    this.bloom.strength = strength;
    this.bloom.threshold = threshold;
    this.bloom.radius = p.bloomRadius;
  }

  render(): void {
    // Low / bloom-off: skip the composer (extra full-screen targets = stutter).
    if (!this.bloom.enabled) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
  }
}
