#!/usr/bin/env bash
#
# prep-model.sh — 외부 3D 모델 팩을 web-friendly GLB로 변환
#
# 입력 포맷: .glb / .obj
# 처리 단계:
#   1) OBJ면 obj2gltf로 GLB 변환
#   2) simplify (mesh decimation, --ratio 인자로 조절)
#   3) resize (텍스처 1024×1024로 다운스케일)
#   4) webp (PNG/JPEG → WebP, 대략 5~10× 압축)
#   5) draco compression (mesh)
# 출력: public/assets/models/<name>.glb
#
# 사용법:
#   scripts/prep-model.sh <input_path> <output_name> [simplify_ratio=0.1]
#
# 예시:
#   scripts/prep-model.sh /tmp/street-3d/wall-low-poly/source/wall.obj wall 1.0
#   scripts/prep-model.sh /tmp/street-3d/3d-scan-of-trashes-on-the-road-of-korea/source/textured_output.obj trash 0.05

set -euo pipefail

INPUT="${1:?Usage: prep-model.sh <input_path> <output_name> [simplify_ratio=0.1]}"
OUT_NAME="${2:?Usage: prep-model.sh <input_path> <output_name> [simplify_ratio=0.1]}"
SIMP_RATIO="${3:-0.1}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/public/assets/models"
TMPDIR="$(mktemp -d -t prep-model-XXXXXX)"
trap 'rm -rf "$TMPDIR"' EXIT

mkdir -p "$OUT_DIR"

# npx must resolve project-local deps — always run from project root.
cd "$ROOT"

echo "▶ input:   $INPUT"
echo "▶ output:  $OUT_DIR/$OUT_NAME.glb"
echo "▶ ratio:   $SIMP_RATIO"

# Step 1 — convert to GLB
case "$INPUT" in
  *.obj)
    echo "[1/5] obj2gltf …"
    npx obj2gltf -i "$INPUT" -o "$TMPDIR/in.glb" --binary
    ;;
  *.glb)
    echo "[1/5] copy GLB …"
    cp "$INPUT" "$TMPDIR/in.glb"
    ;;
  *)
    echo "❌ unsupported input format: $INPUT"
    exit 1
    ;;
esac

# Step 2 — simplify (skip if ratio >= 1.0)
if awk -v r="$SIMP_RATIO" 'BEGIN { exit !(r < 1.0) }'; then
  echo "[2/5] simplify @ ratio=$SIMP_RATIO …"
  npx gltf-transform simplify "$TMPDIR/in.glb" "$TMPDIR/sim.glb" \
    --ratio "$SIMP_RATIO" --error 0.01 || cp "$TMPDIR/in.glb" "$TMPDIR/sim.glb"
else
  echo "[2/5] skip simplify (ratio >= 1.0)"
  cp "$TMPDIR/in.glb" "$TMPDIR/sim.glb"
fi

# Step 3 — resize textures
echo "[3/5] resize textures → 1024px …"
npx gltf-transform resize "$TMPDIR/sim.glb" "$TMPDIR/rs.glb" --width 1024 --height 1024

# Step 4 — webp texture compression (PNG/JPEG → WebP)
echo "[4/5] webp compress …"
npx gltf-transform webp "$TMPDIR/rs.glb" "$TMPDIR/wp.glb" || cp "$TMPDIR/rs.glb" "$TMPDIR/wp.glb"

# Step 5 — draco mesh compression
echo "[5/5] draco compress …"
npx gltf-transform draco "$TMPDIR/wp.glb" "$OUT_DIR/$OUT_NAME.glb"

# Report
SIZE=$(du -h "$OUT_DIR/$OUT_NAME.glb" | cut -f1)
echo "✅ done — $OUT_DIR/$OUT_NAME.glb ($SIZE)"

# inspect the result
echo
echo "── inspection ──"
npx gltf-transform inspect "$OUT_DIR/$OUT_NAME.glb" 2>&1 | sed -n '/scenes/,/===/p' | head -40 || true
