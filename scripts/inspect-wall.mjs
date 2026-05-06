import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });
const doc = await io.read('public/assets/models/wall.glb');

// Iterate through accessors with POSITION semantic to get bounds
let min = [Infinity, Infinity, Infinity];
let max = [-Infinity, -Infinity, -Infinity];

for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const bMin = pos.getMin([]);
    const bMax = pos.getMax([]);
    for (let i = 0; i < 3; i++) {
      if (bMin[i] < min[i]) min[i] = bMin[i];
      if (bMax[i] > max[i]) max[i] = bMax[i];
    }
  }
}

console.log('bounding min:', min);
console.log('bounding max:', max);
console.log('size:', [max[0]-min[0], max[1]-min[1], max[2]-min[2]]);
console.log('center:', [(min[0]+max[0])/2, (min[1]+max[1])/2, (min[2]+max[2])/2]);
