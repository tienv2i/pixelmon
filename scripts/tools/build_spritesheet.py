#!/usr/bin/env python3
"""Công cụ cắt sprite sheet 4 hướng × N frame (đi bộ) thành sheet game.

Đọc ảnh nguồn PNG dạng lưới (4 hàng × 4 cột, nền trắng hoặc đã alpha),
cắt từng frame, tách nền → alpha, scale về frame_size và sinh sheet
theo layout chuẩn của game (hàng = hướng theo DIRS của PlayerSprite).

Nguồn phổ biến:
  - sprites_import/*.png   (ảnh raster nguyên bản 4×4, nền trắng)
  - sheet đã xử lý sẵn (nếu có alpha) → thêm --already-alpha

Output:
  packages/shared/assets/sprites/<name>.png  (frame_size * 4 × frame_size * 4)
  packages/shared/assets/sprites/<name>_32.png (tùy chọn, frame_size=32)

Sau khi sinh xem docs/sprite-import-guide.md để đăng ký frame trong BootScene.

Dùng:
  .venv/bin/python3 scripts/tools/build_spritesheet.py sprites_import/ninja-red.png \
      --name hero_64 --verify
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
    import numpy as np
except ImportError as e:  # pragma: no cover
    print(f"thiếu thư viện: {e} — dùng .venv/bin/python3", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT_DIR = ROOT / "packages/shared/assets/sprites"

# Nơi Express phục vụ file tĩnh. Sheet ở đây mới load được từ client theo URL
# (`/sprites/<tên>.png`) và gán cho user qua thư viện sprite trong admin.
SERVER_PUBLIC_SPRITES = ROOT / "apps/server/public/sprites"

# Thứ tự hàng chuẩn của game — PHẢI khớp DIRS trong
# apps/client/src/entities/PlayerSprite.ts và HERO_DIRS trong BootScene.ts
DEFAULT_DIR_ORDER = ["down", "up", "left", "right"]

# Thứ tự hàng của ẢNH NGUỒN trong repo này (sprites_import/*.png).
# Đã xác minh bằng mắt trên main.png + ninja-red.png: hàng 0 = mặt trước
# (down), hàng 3 = lưng (up). Hàng 1/2 là hai mặt bên.
#
# ⚠️ Đây là NƠI DỄ SAI NHẤT: nếu --dir-order sai thì tool vẫn sinh file hợp lệ
# (không lỗi, 16/64 frame đầy) nhưng sprite quay nhầm hướng khi chơi. Vì vậy
# luôn sinh --preview và mở ảnh kiểm tra trước khi báo ok.
SOURCE_DIR_ORDER = ["down", "left", "right", "up"]

# Ngưỡng tách nền trắng (xem unmatte_white)
BG, FG = 250.0, 235.0


# ── Phát hiện lưới ──────────────────────────────────────────────────────────
def detect_bands(mask_1d: np.ndarray) -> list[tuple[int, int]]:
    """Trả về các dải (start, end) gồm True trong mảng 1D."""
    bands: list[tuple[int, int]] = []
    start = None
    for i, v in enumerate(mask_1d):
        if v and start is None:
            start = i
        elif not v and start is not None:
            bands.append((start, i - 1))
            start = None
    if start is not None:
        bands.append((start, len(mask_1d) - 1))
    return bands


def detect_grid(rgba: np.ndarray, already_alpha: bool) -> tuple[list, list]:
    """Tìm 4 hàng + 4 cột frame trong ảnh nguồn.

    `rgba` là mảng đã chuẩn hoá RGBA (4 kênh).
    - already_alpha=True  → nguồn có alpha, ink = alpha > 16
    - already_alpha=False → nguồn RGB nền trắng, ink = luminance < 235
    """
    if already_alpha:
        ink = rgba[:, :, 3] > 16
    else:
        # 3 kênh RGB (đã unmatte xong nhưng alpha chưa dùng để dò lưới)
        ink = rgba[:, :, :3].mean(axis=2) < 235

    rows = detect_bands(ink.any(axis=1))
    cols = detect_bands(ink.any(axis=0))

    if len(rows) != 4 or len(cols) != 4:
        raise SystemExit(
            f"không phát hiện lưới 4×4 (thấy {len(rows)} hàng, {len(cols)} cột).\n"
            "  → ảnh nguồn phải là lưới 4 hàng × 4 cột hoặc dùng --rows/--cols tự khai."
        )
    return rows, cols


# ── Tách nền ────────────────────────────────────────────────────────────────
def unmatte_white(rgb: np.ndarray) -> np.ndarray:
    """Khôi phục màu thật + alpha từ ảnh nền trắng.

    Giả định: obs = a*C + (1-a)*255  →  a = (250 - L) / (250 - 235)
    C = (obs - 255*(1-a)) / a
    """
    L = rgb.mean(axis=2)
    a = np.clip((BG - L) / (BG - FG), 0.0, 1.0)
    a[L <= FG] = 1.0
    denom = np.maximum(a, 1e-3)[..., None]
    color = np.clip((rgb - 255.0 * (1.0 - denom)) / denom, 0, 255)
    return np.dstack([color, a * 255.0]).astype(np.uint8)


# ── Cắt 1 frame ─────────────────────────────────────────────────────────────
def cut_cell(
    rgba: np.ndarray,
    box: tuple[int, int, int, int],
    frame_size: int,
    scale_h: int,
    pad: int = 2,
) -> Image.Image:
    """Cắt theo box → cắt bbox ink → scale theo chiều cao cố định →
    canh chân đáy + canh giữa ngang trong frame_size."""
    y0, y1, x0, x1 = box
    cell = rgba[
        max(0, y0 - pad) : min(rgba.shape[0], y1 + 1 + pad),
        max(0, x0 - pad) : min(rgba.shape[1], x1 + 1 + pad),
    ]
    if cell.size == 0:
        return Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))

    ink = cell[:, :, 3] > 128
    if not ink.any():
        return Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))
    ys, xs = np.where(ink)
    cell = cell[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]

    ch, cw = cell.shape[:2]
    nw = max(1, int(round(cw * scale_h / ch)))
    nh = scale_h
    if nw > frame_size:
        nh = max(1, int(round(ch * frame_size / nw)))
        nw = frame_size
    small = np.asarray(Image.fromarray(cell).resize((nw, nh), Image.LANCZOS))

    frame = np.zeros((frame_size, frame_size, 4), np.uint8)
    frame[frame_size - nh : frame_size, (frame_size - nw) // 2 : (frame_size - nw) // 2 + nw] = small
    return Image.fromarray(frame, "RGBA")


def make_preview(sheet: Image.Image, frame_size: int, path: Path) -> None:
    """Sinh ảnh preview có nhãn hướng để KIỂM TRA BẰNG MẮT.

    Đây là bước bắt buộc — script verify chỉ kiểm tra frame KHÔNG TRỐNG,
    không phát hiện được hướng bị đảo. Luôn mở preview trước khi báo ok.
    """
    pad = 14          # chừa chỗ cho nhãn
    scale = 3
    W = sheet.width * scale
    H = sheet.height * scale + pad

    canvas = Image.new("RGB", (W, H), (24, 26, 32))
    # nền sọc để thấy alpha
    for y in range(pad, H, 8):
        for x in range(0, W, 8):
            if (x // 8 + y // 8) % 2 == 0:
                canvas.paste((34, 38, 46), (x, y, min(x + 8, W), min(y + 8, H)))

    big = sheet.resize((W, sheet.height * scale), Image.NEAREST)
    canvas.paste(big, (0, pad), big)

    try:
        from PIL import ImageDraw

        d = ImageDraw.Draw(canvas)
        for ri, name in enumerate(DEFAULT_DIR_ORDER):
            d.text((4 + ri * frame_size * scale, 1), f"{ri}:{name}", fill=(255, 220, 120))
        d.text((4 + 4 * frame_size * scale, 1), "cols 0..3", fill=(150, 200, 255))
    except Exception:
        pass  # không có font → bỏ nhãn, vẫn dùng được

    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)
    print(f"  preview: {path}  ← MỞ ẢNH NÀY ĐỂ KIỂM TRA HƯỚNG BẰNG MẮT")


# ── Build ───────────────────────────────────────────────────────────────────
def build_sheet(
    src_path: Path,
    out_path: Path,
    *,
    frame_size: int,
    dir_order: list[str],
    row_bands,
    col_bands,
    already_alpha: bool,
    verify: bool,
    preview_path: Path | None = None,
) -> None:
    im = Image.open(src_path)
    src_arr = np.asarray(im)

    # Bước 1: dò lưới trên ảnh GỐC (chưa unmatte) để logic khớp cờ --already-alpha
    if already_alpha and src_arr.shape[2] == 4:
        probe = src_arr
    else:
        probe = np.dstack([src_arr[:, :, :3], np.full(src_arr.shape[:2], 255, np.uint8)])

    rows = row_bands or None
    cols = col_bands or None
    if rows is None or cols is None:
        rows, cols = detect_grid(probe, already_alpha and src_arr.shape[2] == 4)
    if len(rows) != 4 or len(cols) != 4:
        raise SystemExit(f"cần đúng 4 hàng và 4 cột (nhận {len(rows)}×{len(cols)})")

    # Bước 2: chuẩn hoá sang RGBA để cắt
    if already_alpha and src_arr.shape[2] == 4:
        rgba = src_arr.astype(np.uint8)
    else:
        rgba = unmatte_white(src_arr[:, :, :3].astype(np.float32))

    scale_h = int(frame_size * 0.88)
    sheet = Image.new("RGBA", (frame_size * 4, frame_size * 4), (0, 0, 0, 0))

    # Vị trí hàng NGUỒN (dòng 0-3 của ảnh gốc) → giữ để dựng preview so sánh.
    # dir_order = nhãn hướng cho từng hàng theo THỨ TỰ ẢNH NGUỒN.
    # Sheet xuất ra LUÔN dùng DEFAULT_DIR_ORDER → cần remap hàng.
    dst_index = {d: i for i, d in enumerate(DEFAULT_DIR_ORDER)}

    for src_ri, direction in enumerate(dir_order):
        y0, y1 = rows[src_ri]
        dst_ri = dst_index[direction]
        for ci, (x0, x1) in enumerate(cols):
            frame = cut_cell(rgba, (y0, y1, x0, x1), frame_size, scale_h)
            sheet.paste(frame, (ci * frame_size, dst_ri * frame_size))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path)
    shown = out_path.relative_to(ROOT) if out_path.is_relative_to(ROOT) else out_path
    print(f"✓ {shown}  {sheet.size}  hàng(cuối)={DEFAULT_DIR_ORDER}")
    print(f"  nguồn: {dir_order}")

    if verify:
        empty = []
        for ri, d in enumerate(DEFAULT_DIR_ORDER):
            for ci in range(4):
                f = sheet.crop((ci * frame_size, ri * frame_size, ci * frame_size + frame_size, ri * frame_size + frame_size))
                if f.getchannel("A").getbbox() is None:
                    empty.append(f"{d} cột {ci}")
        if empty:
            raise SystemExit("✗ frame trống: " + ", ".join(empty))
        print(f"  verify: {frame_size * 4}², 16/16 frame có nội dung ✓")

    if preview_path:
        make_preview(sheet, frame_size, preview_path)


def parse_bands(spec: str) -> list[tuple[int, int]]:
    """'24-298,328-607,...' → [(24,298), ...]"""
    out = []
    for part in spec.split(","):
        a, b = part.strip().split("-")
        out.append((int(a), int(b)))
    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("src", type=Path, help="đường dẫn ảnh nguồn")
    p.add_argument("--name", default="hero_64", help="tên file output (không .png)")
    p.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    p.add_argument("--frame", type=int, default=64, help="size mỗi frame (mặc định 64)")
    p.add_argument("--dir-order", default=",".join(SOURCE_DIR_ORDER),
                   help="THỨ TỰ HÀNG CỦA ẢNH NGUỒN (mặc định: %s). "
                        "Tool sẽ tự đảo về %s cho đúng layout game."
                   % (",".join(SOURCE_DIR_ORDER), ",".join(DEFAULT_DIR_ORDER)))
    p.add_argument("--rows", help="y0-y1,... khai tay 4 hàng nếu auto-detect sai")
    p.add_argument("--cols", help="x0-x1,... khai tay 4 cột nếu auto-detect sai")
    p.add_argument("--already-alpha", action="store_true",
                   help="nguồn đã có alpha (bỏ qua unmatte nền trắng)")
    p.add_argument("--verify", action="store_true", help="kiểm tra không frame nào trống")
    p.add_argument("--also-32", action="store_true", help="xuất thêm sheet 32px")
    p.add_argument("--preview", type=Path, default=None,
                   help="ghi ảnh preview có nhãn hướng ra file này (NÊN dùng)")
    p.add_argument("--publish-name", default=None,
                   help="copy sheet vừa sinh sang apps/server/public/sprites/<tên>.png "
                        "để client load bằng URL và đăng ký vào thư viện sprite (admin)")
    args = p.parse_args()

    if not args.src.is_file():
        raise SystemExit(f"không thấy file: {args.src}")

    row_bands = parse_bands(args.rows) if args.rows else None
    col_bands = parse_bands(args.cols) if args.cols else None
    dir_order = [d.strip() for d in args.dir_order.split(",")]
    if len(dir_order) != 4:
        raise SystemExit("cần đúng 4 hướng")
    unknown = [d for d in dir_order if d not in DEFAULT_DIR_ORDER]
    if unknown:
        raise SystemExit(f"hướng không hợp lệ: {unknown} — chỉ nhận {list(DEFAULT_DIR_ORDER)}")

    build_sheet(
        args.src,
        args.out_dir / f"{args.name}.png",
        frame_size=args.frame,
        dir_order=dir_order,
        row_bands=row_bands,
        col_bands=col_bands,
        already_alpha=args.already_alpha,
        verify=args.verify,
        preview_path=args.preview,
    )

    if args.publish_name:
        src = args.out_dir / f"{args.name}.png"
        dst = SERVER_PUBLIC_SPRITES / f"{args.publish_name}.png"
        if not src.is_file():
            raise SystemExit(f"không thấy sheet vừa sinh: {src}")
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(src.read_bytes())
        print(f"  publish: /sprites/{args.publish_name}.png  ← {dst.relative_to(ROOT)}")

    if args.also_32:
        # hero_64 → hero_32 (bỏ hậu tố _64), để tên nhất quán với file cũ
        base = args.name[:-3] if args.name.endswith("_64") else args.name
        build_sheet(
            args.src,
            args.out_dir / f"{base}_32.png",
            frame_size=32,
            dir_order=dir_order,
            row_bands=row_bands,
            col_bands=col_bands,
            already_alpha=args.already_alpha,
            verify=args.verify,
        )


if __name__ == "__main__":
    main()