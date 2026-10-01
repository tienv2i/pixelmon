#!/usr/bin/env python3
"""
CLI Tool: inspect_image.py
Kiểm tra chi tiết kích thước, format, bounding box và phân tích frame grid của file ảnh (Sprite, Tileset)
bằng Pillow mà không cần nạp base64 vào context model.
"""

import sys
import os
import json
from pathlib import Path
from PIL import Image

def inspect(image_path, tile_size=None):
    p = Path(image_path)
    if not p.is_absolute():
        p = Path.cwd() / p

    if not p.exists():
        print(f"Error: file not found: {p}", file=sys.stderr)
        sys.exit(1)

    with Image.open(p) as img:
        w, h = img.size
        mode = img.mode
        fmt = img.format

        bbox = img.getbbox() if "A" in mode or mode == "P" else (0, 0, w, h)

        info = {
            "path": str(p),
            "filename": p.name,
            "format": fmt,
            "mode": mode,
            "size": {"width": w, "height": h},
            "aspect_ratio": round(w / h, 3) if h > 0 else 0,
            "bounding_box_non_empty": {
                "left": bbox[0] if bbox else 0,
                "top": bbox[1] if bbox else 0,
                "right": bbox[2] if bbox else 0,
                "bottom": bbox[3] if bbox else 0,
                "content_width": (bbox[2] - bbox[0]) if bbox else 0,
                "content_height": (bbox[3] - bbox[1]) if bbox else 0,
            }
        }

        # Grids check
        grid_candidates = [tile_size] if tile_size else [16, 32, 48, 64]
        grids = {}
        for ts in grid_candidates:
            if ts:
                cols = w // ts
                rows = h // ts
                rem_w = w % ts
                rem_h = h % ts
                grids[f"{ts}x{ts}"] = {
                    "columns": cols,
                    "rows": rows,
                    "total_tiles": cols * rows,
                    "exact_fit": (rem_w == 0 and rem_h == 0),
                    "remainder": {"x": rem_w, "y": rem_h}
                }
        info["grid_analysis"] = grids

        # Sprite sheet heuristic (16 frames: 4 cols x 4 rows or 12 frames: 3 cols x 4 rows)
        if w % 4 == 0 and h % 4 == 0 and (w // 4) == (h // 4):
            info["spritesheet_suggestion"] = f"Standard 16-frame sheet (4x4): frame size {w//4}x{h//4}px"
        elif w % 3 == 0 and h % 4 == 0 and (w // 3) == (h // 4):
            info["spritesheet_suggestion"] = f"Standard 12-frame sheet (3x4): frame size {w//3}x{h//4}px"

        print(json.dumps(info, indent=2))

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/tools/inspect_image.py <image_path> [tile_size]")
        print("Example: python3 scripts/tools/inspect_image.py packages/shared/assets/tilesets/Outdoor.png 32")
        sys.exit(0)

    img_path = sys.argv[1]
    tile_size = int(sys.argv[2]) if len(sys.argv) > 2 else None
    inspect(img_path, tile_size)

if __name__ == "__main__":
    main()
