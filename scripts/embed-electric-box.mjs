#!/usr/bin/env node
/**
 * embed-electric-box.mjs
 *
 * assimp이 DAE→GLB 변환 시 외부 PBR 텍스처를 잃어버려서, 머티리얼 이름 기준으로
 * 매칭되는 텍스처 파일을 직접 임베드한다.
 *
 * 매핑 규칙: material `<NAME>` → `<NAME>_albedo.jpeg`(baseColor)
 *                            + `<NAME>_normal.png`(normal)
 * (metallic/roughness/AO는 PNG 채널 패킹이 필요해서 일단 생략 — 외관 톤에는 큰 영향 X)
 *
 * 사용법: node scripts/embed-electric-box.mjs <texDir> <inputGlb> <outputGlb>
 */
import { NodeIO } from '@gltf-transform/core';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const [, , TEX_DIR, INPUT, OUTPUT] = process.argv;
if (!TEX_DIR || !INPUT || !OUTPUT) {
  console.error('Usage: node embed-electric-box.mjs <texDir> <inputGlb> <outputGlb>');
  process.exit(1);
}

const io = new NodeIO();
const doc = await io.read(INPUT);
const root = doc.getRoot();

let attached = 0;
for (const material of root.listMaterials()) {
  const name = material.getName();

  const albedoPath =
    [`${name}_albedo.jpg`, `${name}_albedo.jpeg`, `${name}_albedo.png`]
      .map(f => path.join(TEX_DIR, f))
      .find(p => fs.existsSync(p));
  const normalPath =
    [`${name}_normal.png`, `${name}_normal.jpg`]
      .map(f => path.join(TEX_DIR, f))
      .find(p => fs.existsSync(p));

  if (albedoPath) {
    const mime = albedoPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const tex = doc.createTexture(`${name}_albedo`)
      .setImage(fs.readFileSync(albedoPath))
      .setMimeType(mime);
    material.setBaseColorTexture(tex);
    // 머티리얼 톤 정상화 — 텍스처 색을 그대로 보이게
    material.setBaseColorFactor([1, 1, 1, 1]);
    material.setAlphaMode('OPAQUE');
    attached++;
    console.log(`  ✓ ${name} ← albedo  (${path.basename(albedoPath)})`);
  }

  if (normalPath) {
    const mime = normalPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const tex = doc.createTexture(`${name}_normal`)
      .setImage(fs.readFileSync(normalPath))
      .setMimeType(mime);
    material.setNormalTexture(tex);
    console.log(`  ✓ ${name} ← normal  (${path.basename(normalPath)})`);
  }
}

await io.write(OUTPUT, doc);

const sz = (fs.statSync(OUTPUT).size / 1024).toFixed(1);
console.log(`\n✅ wrote ${OUTPUT} (${sz} KB) — ${attached} albedo textures attached`);
