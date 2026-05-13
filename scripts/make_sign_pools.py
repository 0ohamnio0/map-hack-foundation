"""
표지판 JPG에서 사각/삼각/원 모양 자동 추출 + 알파 마스크 PNG 저장.
aihub_pool/*.jpg → aihub_square_pool/, aihub_triangle_pool/ (PNG)
원형은 이미 aihub_circle_pool에 7장 처리됨 — 여기선 사각·삼각만.
"""
import cv2
import numpy as np
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public/assets/3d/aihub_pool"
OUT_BASE = ROOT / "public/assets/3d"

SQUARE_DIR = OUT_BASE / "aihub_square_pool"
TRIANGLE_DIR = OUT_BASE / "aihub_triangle_pool"
SQUARE_DIR.mkdir(exist_ok=True)
TRIANGLE_DIR.mkdir(exist_ok=True)

square_entries = []
triangle_entries = []

# 표지판 시그니처 색 (HSV) — OpenCV H 범위 0~179
COLOR_RANGES = [
    # red (두 끝)
    (np.array([0, 80, 60]),    np.array([10, 255, 255])),
    (np.array([170, 80, 60]),  np.array([180, 255, 255])),
    # blue
    (np.array([95, 80, 60]),   np.array([130, 255, 255])),
    # yellow
    (np.array([18, 80, 100]),  np.array([35, 255, 255])),
    # green
    (np.array([40, 60, 50]),   np.array([85, 255, 255])),
]


def color_mask(hsv):
    m = np.zeros(hsv.shape[:2], dtype=np.uint8)
    for lo, hi in COLOR_RANGES:
        m = cv2.bitwise_or(m, cv2.inRange(hsv, lo, hi))
    return m


for jpg_path in sorted(SRC.glob("*.jpg")):
    img = cv2.imread(str(jpg_path))
    if img is None:
        continue
    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    # 표지판 시그니처 색 마스크 — 기둥(회색/검정)·배경은 제외됨
    mask = color_mask(hsv)
    # morph close로 표지판 영역 통합
    kernel = np.ones((7, 7), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=3)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        continue
    cnt = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(cnt)
    if area < (w * h) * 0.02:  # 2% 이하면 노이즈
        continue
    x, y, bw, bh = cv2.boundingRect(cnt)
    aspect = bw / bh if bh > 0 else 0
    # 기둥(세로 길쭉) 또는 가로 띠(전광·이정표) 모두 제외 — 표지판은 0.5~2.0 안
    if aspect < 0.55 or aspect > 1.8:
        continue
    peri = cv2.arcLength(cnt, True)
    approx = cv2.approxPolyDP(cnt, 0.04 * peri, True)
    n = len(approx)
    if n == 3:
        kind = "triangle"
    elif n == 4:
        kind = "square"
    else:
        continue
    # alpha mask
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.drawContours(mask, [cnt], -1, 255, -1)
    # RGBA 합치기
    bgra = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
    bgra[:, :, 3] = mask
    crop = bgra[y:y+bh, x:x+bw]
    # 정사각형 padding (plane 1.8x1.8 매핑용)
    side = max(bw, bh)
    pad = np.zeros((side, side, 4), dtype=np.uint8)
    ox = (side - bw) // 2
    oy = (side - bh) // 2
    pad[oy:oy+bh, ox:ox+bw] = crop
    stem = jpg_path.stem
    out_dir = SQUARE_DIR if kind == "square" else TRIANGLE_DIR
    out_path = out_dir / f"{stem}.png"
    cv2.imwrite(str(out_path), pad)
    entry = {"id": stem, "tex": f"/assets/3d/aihub_{kind}_pool/{stem}.png"}
    (square_entries if kind == "square" else triangle_entries).append(entry)
    print(f"  {kind:9s} | n={n} | {stem}")

with open(SQUARE_DIR / "manifest.json", "w") as f:
    json.dump(square_entries, f, indent=2, ensure_ascii=False)
with open(TRIANGLE_DIR / "manifest.json", "w") as f:
    json.dump(triangle_entries, f, indent=2, ensure_ascii=False)

print(f"\nsquare: {len(square_entries)}, triangle: {len(triangle_entries)}")
