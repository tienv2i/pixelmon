#!/usr/bin/env python3
"""
Import script for Pokemon Essentials v21.1 into Pixelmon game data.
Source path: /home/huynhat/Shared Data/Downloads/Pokemon Essentials v21.1 2023-07-30
"""

import os
import sys
import json
import shutil
from pathlib import Path

ESSENTIALS_DIR = "/home/huynhat/Shared Data/Downloads/Pokemon Essentials v21.1 2023-07-30"
PBS_DIR = os.path.join(ESSENTIALS_DIR, "PBS")
GRAPHICS_DIR = os.path.join(ESSENTIALS_DIR, "Graphics")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SHARED_DATA_DIR = PROJECT_ROOT / "packages" / "shared" / "data"
SHARED_ASSETS_DIR = PROJECT_ROOT / "packages" / "shared" / "assets"
SERVER_PUBLIC_DIR = PROJECT_ROOT / "apps" / "server" / "public"

def parse_ini(filepath):
    secs = {}
    cur = None
    if not os.path.exists(filepath):
        print(f"Warning: File not found {filepath}")
        return secs
    with open(filepath, "r", encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("[") and line.endswith("]"):
                cur = line[1:-1]
                secs[cur] = {}
            elif cur and "=" in line:
                k, v = line.split("=", 1)
                secs[cur][k.strip()] = v.strip()
    return secs

def clean_id(s):
    return s.lower().replace(" ", "").replace("-", "").replace(".", "").replace("'", "")

# Valid enums in contracts.ts
VALID_GROWTH = {
    "Fast": "fast",
    "Medium": "mediumFast",
    "MediumFast": "mediumFast",
    "MediumSlow": "mediumSlow",
    "Parabolic": "mediumSlow",
    "Slow": "slow",
    "Fluctuating": "fluctuating",
    "Erratic": "erratic"
}

GENDER_RATIOS = {
    "AlwaysMale": 0.0,
    "FemaleOneEighth": 0.125,
    "Female25Percent": 0.25,
    "Female50Percent": 0.5,
    "Female75Percent": 0.75,
    "FemaleSevenEighths": 0.875,
    "AlwaysFemale": 1.0,
    "Genderless": 0.0
}

TARGET_MAP = {
    "NearOther": "one_opponent",
    "NearFoe": "one_opponent",
    "RandomNearFoe": "one_opponent",
    "Other": "one_opponent",
    "AllNearOthers": "all_except_user",
    "AllNearFoes": "all_opponents",
    "User": "user",
    "UserSide": "user_side",
    "UserAndAllies": "user_side",
    "UserOrNearAlly": "user_side",
    "AllAllies": "user_side",
    "NearAlly": "user_side",
    "FoeSide": "enemy_side",
    "AllBattlers": "everyone",
    "BothSides": "everyone",
    "None": "one_opponent"
}

POCKET_MAP = {
    "1": "misc",       # Items
    "2": "medicine",   # Medicine
    "3": "pokeball",   # Poké Balls
    "4": "misc",       # TMs & HMs
    "5": "berry",      # Berries
    "6": "misc",       # Mail
    "7": "misc",       # Battle Items
    "8": "key"         # Key Items
}

EVO_METHOD_MAP = {
    "Level": "level",
    "LevelDay": "level",
    "LevelNight": "level",
    "LevelMale": "level",
    "LevelFemale": "level",
    "LevelRain": "level",
    "LevelDarkInParty": "level",
    "AttackGreater": "level",
    "DefenseGreater": "level",
    "AtkDefEqual": "level",
    "Silcoon": "level",
    "Cascoon": "level",
    "Ninjask": "level",
    "Shedinja": "level",
    "Item": "item",
    "ItemMale": "item",
    "ItemFemale": "item",
    "Trade": "trade",
    "TradeItem": "trade",
    "TradeSpecies": "trade",
    "HasMove": "move",
    "HappinessMoveType": "move",
    "Happiness": "friendship",
    "HappinessDay": "friendship",
    "HappinessNight": "friendship"
}

def determine_rarity(species_id, bst, generation):
    legendaries = {
        "articuno", "zapdos", "moltres", "mewtwo", "mew",
        "raikou", "entei", "suicune", "lugia", "hooh", "celebi",
        "regirock", "regice", "registeel", "latias", "latios", "kyogre", "groudon", "rayquaza", "jirachi", "deoxys",
        "uxie", "mesprit", "azelf", "dialga", "palkia", "heatran", "regigigas", "giratina", "cresselia", "phione", "manaphy", "darkrai", "shaymin", "arceus",
        "victini", "cobalion", "terrakion", "virizion", "tornadus", "thundurus", "reshiram", "zekrom", "landorus", "kyurem", "keldeo", "meloetta", "genesect",
        "xerneas", "yveltal", "zygarde", "diancie", "hoopa", "volcanion",
        "tapukoko", "tapulele", "tapubulu", "tapufini", "cosmog", "cosmoem", "solgaleo", "lunala", "nihilego", "buzzwole", "pheromosa", "xurkitree", "celesteela", "kartana", "guzzlord", "necrozma", "magearna", "marshadow", "poipole", "naganadel", "stakataka", "blacephalon", "zeraora", "meltan", "melmetal",
        "zacian", "zamazenta", "eternatus", "kubfu", "urshifu", "zarude", "regieleki", "regidrago", "glastrier", "spectrier", "calyrex", "enamorus"
    }
    if species_id in legendaries:
        return "legendary" if bst >= 600 else "rare"
    if bst >= 530:
        return "rare"
    if bst >= 420:
        return "uncommon"
    return "common"

def import_species(pkmn_raw, forms_raw):
    species_list = []
    
    # Track dex number for ordering
    dex_num = 1
    for key, data in pkmn_raw.items():
        sid = clean_id(key)
        name = data.get("Name", key.capitalize())
        types_raw = [t.strip().lower() for t in data.get("Types", "NORMAL").split(",")]
        # BaseStats in Essentials: HP, Attack, Defense, Speed, SpAtk, SpDef
        stats_parts = [int(x.strip()) for x in data.get("BaseStats", "45,45,45,45,45,45").split(",")]
        hp = stats_parts[0] if len(stats_parts) > 0 else 45
        atk = stats_parts[1] if len(stats_parts) > 1 else 45
        defense = stats_parts[2] if len(stats_parts) > 2 else 45
        speed = stats_parts[3] if len(stats_parts) > 3 else 45
        spAtk = stats_parts[4] if len(stats_parts) > 4 else 45
        spDef = stats_parts[5] if len(stats_parts) > 5 else 45
        bst = hp + atk + defense + speed + spAtk + spDef

        # Growth Rate
        growth_raw = data.get("GrowthRate", "Medium")
        growth_rate = VALID_GROWTH.get(growth_raw, "mediumSlow" if "parabolic" in growth_raw.lower() else "mediumFast")

        # Gender Ratio
        gender_raw = data.get("GenderRatio", "Female50Percent")
        gender_ratio = GENDER_RATIOS.get(gender_raw, 0.5)

        # Base Exp & Catch Rate
        base_exp = max(1, int(data.get("BaseExp", "64")))
        catch_rate = min(255, max(1, int(data.get("CatchRate", "45"))))

        # Category & Description
        category = data.get("Category", "Pokémon")
        description = data.get("Pokedex", "")

        # Height & Weight
        height = float(data.get("Height", "1.0"))
        weight = float(data.get("Weight", "10.0"))
        color = data.get("Color", "Unknown")
        habitat = data.get("Habitat", "Unknown")
        generation = int(data.get("Generation", "1"))

        # Abilities
        abilities = []
        if "Abilities" in data:
            abilities.extend([clean_id(a.strip()) for a in data["Abilities"].split(",") if a.strip()])
        if "HiddenAbilities" in data:
            abilities.extend([clean_id(a.strip()) for a in data["HiddenAbilities"].split(",") if a.strip()])

        # LearnSet
        learn_set = []
        moves_raw = data.get("Moves", "")
        if moves_raw:
            parts = [p.strip() for p in moves_raw.split(",") if p.strip()]
            for i in range(0, len(parts), 2):
                if i + 1 < len(parts):
                    try:
                        lvl = max(1, min(100, int(parts[i])))
                        mv_id = clean_id(parts[i+1])
                        learn_set.append({"level": lvl, "move": mv_id})
                    except ValueError:
                        pass

        # Evolutions
        evolutions = []
        evos_raw = data.get("Evolutions", "")
        if evos_raw:
            parts = [p.strip() for p in evos_raw.split(",") if p.strip()]
            for i in range(0, len(parts), 3):
                if i + 2 < len(parts):
                    target_id = clean_id(parts[i])
                    raw_method = parts[i+1]
                    param = parts[i+2]
                    method = EVO_METHOD_MAP.get(raw_method, "level")
                    entry = {"to": target_id, "method": method}
                    if method == "level":
                        try:
                            entry["level"] = max(1, int(param))
                        except ValueError:
                            entry["level"] = 16
                    elif method == "item":
                        entry["item"] = clean_id(param)
                    elif method == "move":
                        entry["move"] = clean_id(param)
                    evolutions.append(entry)

        # Rarity
        rarity = determine_rarity(sid, bst, generation)

        sp_entry = {
            "id": sid,
            "dexNum": dex_num,
            "name": name,
            "category": category,
            "types": types_raw[:2],
            "baseStats": {
                "hp": hp,
                "attack": atk,
                "defense": defense,
                "spAttack": spAtk,
                "spDefense": spDef,
                "speed": speed
            },
            "baseStatTotal": bst,
            "baseExperience": base_exp,
            "rarity": rarity,
            "genderRatio": gender_ratio,
            "catchRate": catch_rate,
            "growthRate": growth_rate,
            "evolutions": evolutions,
            "learnSet": learn_set,
            "abilities": abilities,
            "description": description,
            "height": height,
            "weight": weight,
            "color": color,
            "habitat": habitat,
            "generation": generation,
            "iconUrl": f"/assets/icons/pokemon/{sid}.png",
            "spriteUrl": f"/assets/battlers/front/{sid}.png"
        }
        species_list.append(sp_entry)
        dex_num += 1

    return species_list

def import_moves(moves_raw):
    move_list = []
    for key, data in moves_raw.items():
        mid = clean_id(key)
        name = data.get("Name", key.capitalize())
        raw_type = data.get("Type", "NORMAL").lower()
        cat = data.get("Category", "Physical").lower()
        if cat not in ["physical", "special", "status"]:
            cat = "physical"
        
        # Power
        p_raw = data.get("Power", "0")
        power = None if p_raw in ["0", "None", ""] else int(p_raw)

        # Accuracy
        acc_raw = data.get("Accuracy", "100")
        accuracy = 100 if acc_raw in ["0", "None", ""] else min(100, max(1, int(acc_raw)))

        # PP
        pp = min(64, max(1, int(data.get("TotalPP", "20"))))

        # Target
        t_raw = data.get("Target", "NearOther")
        target = TARGET_MAP.get(t_raw, "one_opponent")

        flags = [f.strip() for f in data.get("Flags", "").split(",") if f.strip()]
        is_contact = "Contact" in flags
        sound_based = "Sound" in flags

        desc = data.get("Description", "")

        move_entry = {
            "id": mid,
            "name": name,
            "type": raw_type,
            "category": cat,
            "power": power,
            "accuracy": accuracy,
            "pp": pp,
            "priority": 0,
            "target": target,
            "description": desc,
            "effects": [],
            "selfEffects": [],
            "isContact": is_contact,
            "soundBased": sound_based
        }
        move_list.append(move_entry)
    return move_list

def import_items(items_raw):
    item_list = []
    for key, data in items_raw.items():
        iid = clean_id(key)
        name = data.get("Name", key.capitalize())
        pocket_raw = data.get("Pocket", "1")
        category = POCKET_MAP.get(pocket_raw, "misc")
        if "ball" in iid:
            category = "pokeball"
        elif "berry" in iid:
            category = "berry"

        price = int(data.get("Price", "0"))
        sell_price = price // 2
        buy_price = price

        desc = data.get("Description", "")

        item_entry = {
            "id": iid,
            "name": name,
            "category": category,
            "pocket": int(pocket_raw) if pocket_raw.isdigit() else 1,
            "description": desc,
            "stackable": True,
            "maxStack": 99,
            "sellPrice": sell_price,
            "buyPrice": buy_price,
            "iconUrl": f"/assets/icons/items/{iid}.png"
        }
        item_list.append(item_entry)
    return item_list

def import_abilities(abilities_raw):
    ability_list = []
    for key, data in abilities_raw.items():
        aid = clean_id(key)
        name = data.get("Name", key.capitalize())
        desc = data.get("Description", "")
        ability_list.append({
            "id": aid,
            "name": name,
            "description": desc
        })
    return ability_list

def import_types(types_raw):
    type_list = []
    chart = {}
    
    # Types list in proper order
    type_names = [clean_id(k) for k in types_raw.keys()]
    for t in type_names:
        chart[t] = {}
        for target in type_names:
            chart[t][target] = 1.0

    for key, data in types_raw.items():
        tid = clean_id(key)
        name = data.get("Name", key.capitalize())
        weaknesses = [clean_id(w.strip()) for w in data.get("Weaknesses", "").split(",") if w.strip()]
        resistances = [clean_id(r.strip()) for r in data.get("Resistances", "").split(",") if r.strip()]
        immunities = [clean_id(i.strip()) for i in data.get("Immunities", "").split(",") if i.strip()]

        for w in weaknesses:
            if w in chart and tid in chart[w]:
                chart[w][tid] = 2.0
        for r in resistances:
            if r in chart and tid in chart[r]:
                chart[r][tid] = 0.5
        for im in immunities:
            if im in chart and tid in chart[im]:
                chart[im][tid] = 0.0

        type_list.append({
            "id": tid,
            "name": name,
            "weaknesses": weaknesses,
            "resistances": resistances,
            "immunities": immunities
        })

    return {"types": type_list, "chart": chart}

def copy_assets():
    print("Copying assets from Pokemon Essentials...")
    pkm_icons_src = os.path.join(GRAPHICS_DIR, "Pokemon", "Icons")
    pkm_front_src = os.path.join(GRAPHICS_DIR, "Pokemon", "Front")
    items_src = os.path.join(GRAPHICS_DIR, "Items")

    # Destinations in shared/assets and server/public/assets
    dest_icons = SHARED_ASSETS_DIR / "icons" / "pokemon"
    dest_front = SHARED_ASSETS_DIR / "battlers" / "front"
    dest_items = SHARED_ASSETS_DIR / "icons" / "items"

    dest_icons.mkdir(parents=True, exist_ok=True)
    dest_front.mkdir(parents=True, exist_ok=True)
    dest_items.mkdir(parents=True, exist_ok=True)

    # Public destinations in server
    pub_icons = SERVER_PUBLIC_DIR / "assets" / "icons" / "pokemon"
    pub_front = SERVER_PUBLIC_DIR / "assets" / "battlers" / "front"
    pub_items = SERVER_PUBLIC_DIR / "assets" / "icons" / "items"

    pub_icons.mkdir(parents=True, exist_ok=True)
    pub_front.mkdir(parents=True, exist_ok=True)
    pub_items.mkdir(parents=True, exist_ok=True)

    copied_icons = 0
    if os.path.exists(pkm_icons_src):
        for f in os.listdir(pkm_icons_src):
            if f.endswith(".png"):
                base = f[:-4]
                clean = clean_id(base) + ".png"
                src_path = os.path.join(pkm_icons_src, f)
                shutil.copy2(src_path, dest_icons / clean)
                shutil.copy2(src_path, pub_icons / clean)
                copied_icons += 1

    copied_front = 0
    if os.path.exists(pkm_front_src):
        for f in os.listdir(pkm_front_src):
            if f.endswith(".png") and not "_female" in f:
                base = f[:-4]
                clean = clean_id(base) + ".png"
                src_path = os.path.join(pkm_front_src, f)
                shutil.copy2(src_path, dest_front / clean)
                shutil.copy2(src_path, pub_front / clean)
                copied_front += 1

    copied_items = 0
    if os.path.exists(items_src):
        for f in os.listdir(items_src):
            if f.endswith(".png"):
                base = f[:-4]
                clean = clean_id(base) + ".png"
                src_path = os.path.join(items_src, f)
                shutil.copy2(src_path, dest_items / clean)
                shutil.copy2(src_path, pub_items / clean)
                copied_items += 1

    print(f"Copied {copied_icons} pokemon icons, {copied_front} battler sprites, {copied_items} item icons.")

def main():
    print("=== POKEMON ESSENTIALS V21.1 DATA IMPORTER ===")
    pkmn_raw = parse_ini(os.path.join(PBS_DIR, "pokemon.txt"))
    forms_raw = parse_ini(os.path.join(PBS_DIR, "pokemon_forms.txt"))
    moves_raw = parse_ini(os.path.join(PBS_DIR, "moves.txt"))
    items_raw = parse_ini(os.path.join(PBS_DIR, "items.txt"))
    abilities_raw = parse_ini(os.path.join(PBS_DIR, "abilities.txt"))
    types_raw = parse_ini(os.path.join(PBS_DIR, "types.txt"))

    print(f"Found PBS definitions: {len(pkmn_raw)} Species, {len(forms_raw)} Forms, {len(moves_raw)} Moves, {len(items_raw)} Items, {len(abilities_raw)} Abilities, {len(types_raw)} Types.")

    species_list = import_species(pkmn_raw, forms_raw)
    moves_list = import_moves(moves_raw)
    items_list = import_items(items_raw)
    abilities_list = import_abilities(abilities_raw)
    types_data = import_types(types_raw)

    SHARED_DATA_DIR.mkdir(parents=True, exist_ok=True)

    with open(SHARED_DATA_DIR / "species.json", "w", encoding="utf-8") as f:
        json.dump(species_list, f, indent=2, ensure_ascii=False)
    print(f"✓ Saved {len(species_list)} species to species.json")

    with open(SHARED_DATA_DIR / "moves.json", "w", encoding="utf-8") as f:
        json.dump(moves_list, f, indent=2, ensure_ascii=False)
    print(f"✓ Saved {len(moves_list)} moves to moves.json")

    with open(SHARED_DATA_DIR / "items.json", "w", encoding="utf-8") as f:
        json.dump(items_list, f, indent=2, ensure_ascii=False)
    print(f"✓ Saved {len(items_list)} items to items.json")

    with open(SHARED_DATA_DIR / "abilities.json", "w", encoding="utf-8") as f:
        json.dump(abilities_list, f, indent=2, ensure_ascii=False)
    print(f"✓ Saved {len(abilities_list)} abilities to abilities.json")

    with open(SHARED_DATA_DIR / "types.json", "w", encoding="utf-8") as f:
        json.dump(types_data, f, indent=2, ensure_ascii=False)
    print(f"✓ Saved {len(types_data['types'])} types to types.json")

    # Generate Summary Report
    gen_counts = {}
    type_counts = {}
    for s in species_list:
        g = s.get("generation", 1)
        gen_counts[f"Gen {g}"] = gen_counts.get(f"Gen {g}", 0) + 1
        for t in s.get("types", []):
            type_counts[t] = type_counts.get(t, 0) + 1

    move_cat_counts = {}
    for m in moves_list:
        c = m.get("category", "physical")
        move_cat_counts[c] = move_cat_counts.get(c, 0) + 1

    item_cat_counts = {}
    for it in items_list:
        c = it.get("category", "misc")
        item_cat_counts[c] = item_cat_counts.get(c, 0) + 1

    summary = {
        "version": "Pokemon Essentials v21.1 (2023-07-30)",
        "importedAt": "2026-10-01T16:45:00.000Z",
        "counts": {
            "species": len(species_list),
            "forms": len(forms_raw),
            "moves": len(moves_list),
            "items": len(items_list),
            "abilities": len(abilities_list),
            "types": len(types_data["types"])
        },
        "breakdown": {
            "generations": gen_counts,
            "speciesTypes": type_counts,
            "moveCategories": move_cat_counts,
            "itemCategories": item_cat_counts
        }
    }

    with open(SHARED_DATA_DIR / "essentials_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    print(f"✓ Saved summary report to essentials_summary.json")

    # Copy icons & graphics
    copy_assets()

    print("=== IMPORT COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    main()
