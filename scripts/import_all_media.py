#!/usr/bin/env python3
"""
import_all_media.py
Sao chép và chuẩn hoá toàn bộ tài nguyên Media (Audio + Graphics + PBS) từ:
  "/home/huynhat/Shared Data/Downloads/Pokemon Essentials v21.1 2023-07-30"
vào packages/shared/assets/ và packages/shared/data/pbs/ để dự trữ sử dụng lâu dài.
"""

import os
import shutil
import json
from pathlib import Path

SOURCE_ROOT = Path("/home/huynhat/Shared Data/Downloads/Pokemon Essentials v21.1 2023-07-30")
PROJECT_ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = PROJECT_ROOT / "packages" / "shared" / "assets"
PBS_DIR = PROJECT_ROOT / "packages" / "shared" / "data" / "pbs"

def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path

def copy_dir(src: Path, dst: Path, ext_filter=None, lower_case=True) -> int:
    if not src.exists():
        print(f"  [!] Thư mục nguồn không tồn tại: {src}")
        return 0
    ensure_dir(dst)
    count = 0
    for root, _, files in os.walk(src):
        for f in files:
            if f.startswith(".") or f.lower() == "desktop.ini":
                continue
            src_file = Path(root) / f
            ext = src_file.suffix.lower()
            if ext_filter and ext not in ext_filter:
                continue
            
            # Tính subpath nếu có
            rel = src_file.relative_to(src)
            if lower_case:
                target_rel = Path(str(rel).lower())
            else:
                target_rel = rel
            dst_file = dst / target_rel
            ensure_dir(dst_file.parent)
            
            try:
                shutil.copy2(src_file, dst_file)
                count += 1
            except Exception as e:
                print(f"    Lỗi sao chép {src_file.name}: {e}")
    return count

def main():
    print("=" * 60)
    print(" BẮT ĐẦU IMPORT TOÀN BỘ MEDIA TỪ POKEMON ESSENTIALS v21.1")
    print("=" * 60)

    if not SOURCE_ROOT.exists():
        print(f"[ERROR] Không tìm thấy thư mục nguồn: {SOURCE_ROOT}")
        return

    manifest = {
        "source": "Pokemon Essentials v21.1 (2023-07-30)",
        "audio": {},
        "graphics": {},
        "pbs": {},
    }

    # ─────────────────────────────────────────────────────────────
    # 1. AUDIO (Âm thanh)
    # ─────────────────────────────────────────────────────────────
    print("\n[1/3] Đang sao chép phần Âm thanh (Audio)...")
    audio_src = SOURCE_ROOT / "Audio"
    audio_dst = ASSETS_DIR / "audio"

    # Cries (Tiếng kêu Pokémon)
    cries_count = copy_dir(audio_src / "SE" / "Cries", audio_dst / "cries")
    print(f"  ✓ Tiếng kêu Pokémon (Cries): {cries_count} files")
    manifest["audio"]["cries"] = cries_count

    # BGM (Nhạc nền)
    bgm_count = copy_dir(audio_src / "BGM", audio_dst / "bgm")
    print(f"  ✓ Nhạc nền (BGM): {bgm_count} files")
    manifest["audio"]["bgm"] = bgm_count

    # ME (Nhạc hiệu ứng ngắn)
    me_count = copy_dir(audio_src / "ME", audio_dst / "me")
    print(f"  ✓ Nhạc hiệu ứng ngắn (ME): {me_count} files")
    manifest["audio"]["me"] = me_count

    # BGS (Âm thanh môi trường)
    bgs_count = copy_dir(audio_src / "BGS", audio_dst / "bgs")
    print(f"  ✓ Âm thanh môi trường (BGS): {bgs_count} files")
    manifest["audio"]["bgs"] = bgs_count

    # SE (Sound Effects) - trừ Cries đã tách riêng
    se_count = 0
    ensure_dir(audio_dst / "se")
    for f in (audio_src / "SE").iterdir():
        if f.is_file() and not f.name.startswith("."):
            shutil.copy2(f, audio_dst / "se" / f.name.lower())
            se_count += 1
    # SE Anim
    if (audio_src / "SE" / "Anim").exists():
        anim_se = copy_dir(audio_src / "SE" / "Anim", audio_dst / "se" / "anim")
        se_count += anim_se
    print(f"  ✓ Hiệu ứng âm thanh (SE): {se_count} files")
    manifest["audio"]["se"] = se_count

    # ─────────────────────────────────────────────────────────────
    # 2. GRAPHICS (Hình ảnh)
    # ─────────────────────────────────────────────────────────────
    print("\n[2/3] Đang sao chép phần Hình ảnh (Graphics)...")
    gfx_src = SOURCE_ROOT / "Graphics"

    # Battlers (Front, Back, Front Shiny, Back Shiny)
    bf_count = copy_dir(gfx_src / "Pokemon" / "Front", ASSETS_DIR / "battlers" / "front")
    bb_count = copy_dir(gfx_src / "Pokemon" / "Back", ASSETS_DIR / "battlers" / "back")
    bfs_count = copy_dir(gfx_src / "Pokemon" / "Front shiny", ASSETS_DIR / "battlers" / "front_shiny")
    bbs_count = copy_dir(gfx_src / "Pokemon" / "Back shiny", ASSETS_DIR / "battlers" / "back_shiny")
    eggs_count = copy_dir(gfx_src / "Pokemon" / "Eggs", ASSETS_DIR / "battlers" / "eggs")
    print(f"  ✓ Battler Sprites (Front: {bf_count}, Back: {bb_count}, Front Shiny: {bfs_count}, Back Shiny: {bbs_count}, Eggs: {eggs_count})")
    manifest["graphics"]["battlers"] = {
        "front": bf_count, "back": bb_count, "front_shiny": bfs_count, "back_shiny": bbs_count, "eggs": eggs_count
    }

    # Icons
    pkm_icons = copy_dir(gfx_src / "Pokemon" / "Icons", ASSETS_DIR / "icons" / "pokemon")
    pkm_icons_shiny = copy_dir(gfx_src / "Pokemon" / "Icons shiny", ASSETS_DIR / "icons" / "pokemon_shiny")
    footprints = copy_dir(gfx_src / "Pokemon" / "Footprints", ASSETS_DIR / "icons" / "footprints")
    item_icons = copy_dir(gfx_src / "Items", ASSETS_DIR / "icons" / "items")
    print(f"  ✓ Icons (Pokemon: {pkm_icons}, Shiny: {pkm_icons_shiny}, Items: {item_icons}, Footprints: {footprints})")
    manifest["graphics"]["icons"] = {
        "pokemon": pkm_icons, "pokemon_shiny": pkm_icons_shiny, "items": item_icons, "footprints": footprints
    }

    # Battlebacks (Bối cảnh sàn đấu)
    bb_backs = copy_dir(gfx_src / "Battlebacks", ASSETS_DIR / "battlebacks")
    print(f"  ✓ Bối cảnh sàn đấu (Battlebacks): {bb_backs} files")
    manifest["graphics"]["battlebacks"] = bb_backs

    # Characters (Nhân vật Overworld)
    char_count = copy_dir(gfx_src / "Characters", ASSETS_DIR / "characters")
    print(f"  ✓ Nhân vật Overworld (Characters): {char_count} files")
    manifest["graphics"]["characters"] = char_count

    # Trainers (Chân dung huấn luyện viên)
    trainers_count = copy_dir(gfx_src / "Trainers", ASSETS_DIR / "trainers")
    print(f"  ✓ Chân dung Trainers: {trainers_count} files")
    manifest["graphics"]["trainers"] = trainers_count

    # Tilesets & Autotiles (Bộ gạch bản đồ)
    tilesets_count = copy_dir(gfx_src / "Tilesets", ASSETS_DIR / "tilesets")
    autotiles_count = copy_dir(gfx_src / "Autotiles", ASSETS_DIR / "autotiles")
    print(f"  ✓ Tilesets: {tilesets_count} files | Autotiles: {autotiles_count} files")
    manifest["graphics"]["tilesets"] = tilesets_count
    manifest["graphics"]["autotiles"] = autotiles_count

    # Weather & Fogs (Thời tiết & Sương mù)
    weather_count = copy_dir(gfx_src / "Weather", ASSETS_DIR / "weather")
    fogs_count = copy_dir(gfx_src / "Fogs", ASSETS_DIR / "fogs")
    print(f"  ✓ Thời tiết (Weather): {weather_count} files | Sương mù (Fogs): {fogs_count} files")
    manifest["graphics"]["weather"] = weather_count
    manifest["graphics"]["fogs"] = fogs_count

    # Animations & Battle animations (Hiệu ứng chiêu thức)
    anim_count = copy_dir(gfx_src / "Animations", ASSETS_DIR / "animations" / "common")
    battle_anim_count = copy_dir(gfx_src / "Battle animations", ASSETS_DIR / "animations" / "battle")
    print(f"  ✓ Hiệu ứng kỹ năng (Animations): {anim_count + battle_anim_count} files")
    manifest["graphics"]["animations"] = anim_count + battle_anim_count

    # Town Map (Bản đồ vùng)
    townmap_src = gfx_src / "UI" / "Town Map"
    townmap_count = copy_dir(townmap_src, ASSETS_DIR / "maps" / "town_map")
    print(f"  ✓ Bản đồ khu vực (Town Map): {townmap_count} files")
    manifest["graphics"]["town_map"] = townmap_count

    # Transitions & Windowskins & UI
    trans_count = copy_dir(gfx_src / "Transitions", ASSETS_DIR / "ui" / "transitions")
    wskin_count = copy_dir(gfx_src / "Windowskins", ASSETS_DIR / "ui" / "windowskins")
    print(f"  ✓ UI Transitions: {trans_count} files | Windowskins: {wskin_count} files")
    manifest["graphics"]["ui"] = {"transitions": trans_count, "windowskins": wskin_count}

    # ─────────────────────────────────────────────────────────────
    # 3. PBS FILES (Dữ liệu cấu trúc gốc để dự trữ)
    # ─────────────────────────────────────────────────────────────
    print("\n[3/3] Đang sao chép toàn bộ PBS cấu trúc vào data/pbs/...")
    pbs_src = SOURCE_ROOT / "PBS"
    pbs_count = copy_dir(pbs_src, PBS_DIR, ext_filter=[".txt"], lower_case=False)
    print(f"  ✓ Lưu trữ PBS: {pbs_count} files cấu hình")
    manifest["pbs"]["total_files"] = pbs_count

    # Lưu manifest
    manifest_path = ASSETS_DIR / "assets_manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    print(f"\n[OK] Đã ghi nhận bản kê tài nguyên: {manifest_path}")

    print("\n" + "=" * 60)
    print(" HOÀN TẤT IMPORT TOÀN BỘ MEDIA VÀO DỰ ÁN PIXELMON!")
    print("=" * 60)

if __name__ == "__main__":
    main()
