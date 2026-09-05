import { FlyerPath, PathFrame } from '../src/flyer/FlyerPath';
import { flyerTrackControls } from '../src/flyer/FlyerTracks';
import { FlyerRun } from '../src/flyer/FlyerRun';
import type { FlyerSceneId } from '../src/data/flyer';

const ids: FlyerSceneId[] = ['canyon', 'wormhole', 'yard', 'rift'];
const frame = new PathFrame();
let failed = false;

for (const id of ids) {
  const path = new FlyerPath(flyerTrackControls(id));
  const m = path.metrics();
  path.sample(0, frame);
  console.log(
    id,
    `len=${m.length.toFixed(0)}`,
    `lat=${m.lateral.toFixed(1)}`,
    `vert=${m.vertical.toFixed(1)}`,
    `pitch=${m.maxPitch.toFixed(2)}`,
    `minUpY=${m.minUpY.toFixed(2)}`,
    `startRightX=${frame.right.x.toFixed(2)}`,
    `startUpY=${frame.up.y.toFixed(2)}`
  );
  if (id === 'canyon' && (frame.right.x < 0.5 || frame.up.y < 0.5)) {
    console.error(`FAIL canyon start basis: right.x=${frame.right.x} up.y=${frame.up.y} (want +X / +Y)`);
    failed = true;
  }
  if (m.length < 200) {
    console.error(`FAIL ${id}: path too short`);
    failed = true;
  }
  if (m.lateral < 12 && m.vertical < 12) {
    console.error(`FAIL ${id}: path is effectively straight`);
    failed = true;
  }
}

const canyon = new FlyerPath(flyerTrackControls('canyon'));
const cm = canyon.metrics();
if (cm.minUpY > -0.2) {
  console.error(`FAIL canyon: expected inverted up on the loop, minUpY=${cm.minUpY}`);
  failed = true;
}

for (const id of ids) {
  const run = new FlyerRun(id);
  run.update(0.016, 1, -1, false, () => false);
  if (run.x <= 0 || run.y <= 0) {
    console.error(`FAIL ${id} stick: expected +right/+up, got x=${run.x} y=${run.y}`);
    failed = true;
  }
  run.dispose();
}

if (failed) process.exit(1);
console.log('ok');
