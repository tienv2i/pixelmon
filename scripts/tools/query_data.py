#!/usr/bin/env python3
"""
CLI Tool: query_data.py
Truy xuất nhanh thông tin Pokémon, Moves, Items và Maps mà không cần nạp toàn bộ file JSON lớn vào context.
Giúp tiết kiệm hàng trăm ngàn tokens cho AI Agent / OpenCode.
"""

import sys
import os
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = ROOT / "packages" / "shared" / "data"

def load_json(filename):
    path = DATA_DIR / filename
    if not path.exists():
        print(f"Error: {path} not found", file=sys.stderr)
        sys.exit(1)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def find_item_in_collection(data, key_func, target):
    target_str = str(target).strip().lower()
    items = data.values() if isinstance(data, dict) else data
    for item in items:
        if key_func(item, target_str):
            return item
    return None

def cmd_species(query):
    data = load_json("species.json")
    def match(sp, t):
        if str(sp.get("id", "")).lower() == t:
            return True
        if str(sp.get("dexNum", "")) == t:
            return True
        if str(sp.get("name", "")).lower() == t:
            return True
        return False

    sp = find_item_in_collection(data, match, query)
    if not sp:
        print(f"Species not found: {query}", file=sys.stderr)
        sys.exit(1)

    # Return clean, compact representation
    learnset = sp.get("learnset", [])
    result = {
        "id": sp.get("id"),
        "dexNum": sp.get("dexNum"),
        "name": sp.get("name"),
        "category": sp.get("category"),
        "types": sp.get("types"),
        "baseStats": sp.get("baseStats"),
        "baseStatTotal": sp.get("baseStatTotal"),
        "abilities": sp.get("abilities"),
        "genderRatio": sp.get("genderRatio"),
        "catchRate": sp.get("catchRate"),
        "baseExperience": sp.get("baseExperience"),
        "learnset_count": len(learnset) if isinstance(learnset, list) else 0,
        "learnset_preview": learnset[:8] if isinstance(learnset, list) else []
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))

def cmd_move(query):
    data = load_json("moves.json")
    def match(m, t):
        return (
            str(m.get("id", "")).lower() == t
            or str(m.get("name", "")).lower() == t
            or str(m.get("id", "")).lower().replace("-", "") == t.replace("-", "").replace(" ", "")
        )

    m = find_item_in_collection(data, match, query)
    if not m:
        print(f"Move not found: {query}", file=sys.stderr)
        sys.exit(1)

    result = {
        "id": m.get("id"),
        "name": m.get("name"),
        "type": m.get("type"),
        "category": m.get("category"),
        "power": m.get("power"),
        "accuracy": m.get("accuracy"),
        "pp": m.get("pp"),
        "priority": m.get("priority"),
        "target": m.get("target"),
        "description": m.get("description")
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))

def cmd_item(query):
    data = load_json("items.json")
    def match(it, t):
        return (
            str(it.get("id", "")).lower() == t
            or str(it.get("name", "")).lower() == t
        )

    it = find_item_in_collection(data, match, query)
    if not it:
        print(f"Item not found: {query}", file=sys.stderr)
        sys.exit(1)

    result = {
        "id": it.get("id"),
        "name": it.get("name"),
        "category": it.get("category"),
        "price": it.get("price"),
        "description": it.get("description")
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))

def cmd_map(map_id):
    map_path = DATA_DIR / "maps" / "server" / f"{map_id}.json"
    if not map_path.exists():
        # Check without .json
        alt = list((DATA_DIR / "maps" / "server").glob(f"*{map_id}*.json"))
        if alt:
            map_path = alt[0]
        else:
            print(f"Map file not found for: {map_id}", file=sys.stderr)
            sys.exit(1)

    with open(map_path, "r", encoding="utf-8") as f:
        m = json.load(f)

    objects = m.get("objects", [])
    warps = [obj for obj in objects if obj.get("type") == "warp"]
    signs = [obj for obj in objects if obj.get("type") == "sign"]
    items = [obj for obj in objects if obj.get("type") == "item_ball"]
    encounters = m.get("encounters", [])

    result = {
        "mapId": m.get("mapId"),
        "name": m.get("name"),
        "width": m.get("width"),
        "height": m.get("height"),
        "tileWidth": m.get("tileWidth", 32),
        "tileHeight": m.get("tileHeight", 32),
        "objects_count": len(objects),
        "warps": [
            {"id": w.get("id"), "name": w.get("name"), "x": w.get("x"), "y": w.get("y"), "toMap": w.get("toMap"), "toX": w.get("toX"), "toY": w.get("toY")}
            for w in warps
        ],
        "signs": [
            {"id": s.get("id"), "name": s.get("name"), "x": s.get("x"), "y": s.get("y"), "text": s.get("text")}
            for s in signs
        ],
        "item_balls": [
            {"id": i.get("id"), "x": i.get("x"), "y": i.get("y"), "itemId": i.get("itemId"), "quantity": i.get("quantity")}
            for i in items
        ],
        "encounters_count": len(encounters),
        "encounters_preview": encounters[:6]
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))

def cmd_search(category, term):
    term = term.lower()
    matches = []
    if category in ("species", "pokemon"):
        data = load_json("species.json")
        items = data.values() if isinstance(data, dict) else data
        for s in items:
            name = str(s.get("name", "")).lower()
            sid = str(s.get("id", "")).lower()
            if term in name or term in sid:
                matches.append({"id": s.get("id"), "name": s.get("name"), "dexNum": s.get("dexNum")})
                if len(matches) >= 20: break
    elif category in ("move", "moves"):
        data = load_json("moves.json")
        items = data.values() if isinstance(data, dict) else data
        for m in items:
            name = str(m.get("name", "")).lower()
            mid = str(m.get("id", "")).lower()
            if term in name or term in mid:
                matches.append({"id": m.get("id"), "name": m.get("name"), "type": m.get("type")})
                if len(matches) >= 20: break
    elif category in ("item", "items"):
        data = load_json("items.json")
        items = data.values() if isinstance(data, dict) else data
        for it in items:
            name = str(it.get("name", "")).lower()
            iid = str(it.get("id", "")).lower()
            if term in name or term in iid:
                matches.append({"id": it.get("id"), "name": it.get("name")})
                if len(matches) >= 20: break
    elif category in ("map", "maps"):
        map_files = (DATA_DIR / "maps" / "server").glob("*.json")
        for mf in map_files:
            if term in mf.stem.lower():
                matches.append({"mapId": mf.stem})
                if len(matches) >= 20: break
    else:
        print(f"Unknown search category: {category}. Choose from species, move, item, map.", file=sys.stderr)
        sys.exit(1)

    print(json.dumps({"category": category, "term": term, "count": len(matches), "results": matches}, indent=2, ensure_ascii=False))

def print_help():
    print("""
Usage:
  python3 scripts/tools/query_data.py species <name_or_dex>   # Tra cứu loài (vd: pikachu, 25)
  python3 scripts/tools/query_data.py move <name_or_id>       # Tra cứu chiêu (vd: thunderbolt)
  python3 scripts/tools/query_data.py item <name_or_id>       # Tra cứu vật phẩm (vd: potion)
  python3 scripts/tools/query_data.py map <map_id>            # Tra cứu map (vd: pallet-town)
  python3 scripts/tools/query_data.py search <cat> <query>    # Tìm kiếm (cat: species|move|item|map)
""")

def main():
    if len(sys.argv) < 3:
        print_help()
        sys.exit(0)

    cmd = sys.argv[1].lower()
    arg = sys.argv[2]

    if cmd in ("species", "pokemon"):
        cmd_species(arg)
    elif cmd in ("move", "moves"):
        cmd_move(arg)
    elif cmd in ("item", "items"):
        cmd_item(arg)
    elif cmd in ("map", "maps"):
        cmd_map(arg)
    elif cmd == "search":
        if len(sys.argv) < 4:
            print("Usage: query_data.py search <species|move|item|map> <term>")
            sys.exit(1)
        cmd_search(arg, sys.argv[3])
    else:
        print_help()

if __name__ == "__main__":
    main()
