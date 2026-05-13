"""풀 PNG 모두 한 장 grid로 composite. 알파는 흰 배경 위에 합성. 파일명 라벨링."""
import cv2
import numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POOLS = {
    "circle":   ROOT / "public/assets/3d/aihub_circle_pool",
    "square":   ROOT / "public/assets/3d/aihub_square_pool",
    "triangle": ROOT / "public/assets/3d/aihub_triangle_pool",
}

CELL = 240
COLS = 5
PAD = 8

cells = []
for pool_name, pdir in POOLS.items():
    for png in sorted(pdir.glob("*.png")):
        img = cv2.imread(str(png), cv2.IMREAD_UNCHANGED)
        if img is None or img.shape[2] != 4:
            continue
        # 알파를 흰 배경에 합성
        bgr = img[:, :, :3].astype(np.float32)
        alpha = img[:, :, 3:4].astype(np.float32) / 255.0
        white = np.ones_like(bgr) * 255
        comp = (bgr * alpha + white * (1 - alpha)).astype(np.uint8)
        # CELL 크기로 resize (정사각 fit, 라벨 공간 24 빼고)
        h, w = comp.shape[:2]
        max_h = CELL - 24 - PAD
        max_w = CELL - PAD * 2
        s = min(max_h / h, max_w / w)
        comp = cv2.resize(comp, (int(w*s), int(h*s)))
        ch, cw = comp.shape[:2]
        cell = np.full((CELL, CELL, 3), 240, dtype=np.uint8)
        ox = (CELL - cw) // 2
        oy = 24 + (CELL - 24 - ch) // 2
        cell[oy:oy+ch, ox:ox+cw] = comp
        # 라벨
        label = f"{pool_name[0]}: {png.stem[:20]}"
        cv2.putText(cell, label, (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.32, (0, 0, 0), 1)
        cells.append(cell)

rows = (len(cells) + COLS - 1) // COLS
canvas = np.full((rows * CELL, COLS * CELL, 3), 220, dtype=np.uint8)
for i, c in enumerate(cells):
    r, col = divmod(i, COLS)
    canvas[r*CELL:(r+1)*CELL, col*CELL:(col+1)*CELL] = c

out = ROOT / "scripts/pool_inspect.png"
cv2.imwrite(str(out), canvas)
print(f"saved {out} ({rows}x{COLS}, {len(cells)} tiles)")
