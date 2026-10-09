#!/usr/bin/env python3
"""
Convert Pokémon Essentials RPG Maker XP Map (.rxdata) to Pixelmon Tiled TMJ (.tmj)
and Server Collision JSON (.json).
"""

import argparse
import json
import os
import struct
import sys
import rubymarshal.reader

ESSENTIALS_DEFAULT = "/mnt/data/Downloads/Pokemon Essentials v21.1 2023-07-30"
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ===== CollisionFlag bitmask (khớp packages/shared/src/data/contracts.ts) =====
# Ledge hướng được encode bằng 2-bit field (không one-hot) vì 10 flag không
# nhét vừa 8 bit. Một ô chỉ rơi được 1 hướng nên 2 bit là đủ và tiết kiệm 0x80 cho WARP.
WALKABLE = 0x01
WATER    = 0x02
BLOCKED  = 0x04
GRASS    = 0x08
LEDGE    = 0x10        # bit 4 = "có phải ledge"
DIR_DOWN  = 0x00       # dir field (bit 5-6) = 0
DIR_UP    = 0x20                              # = 1
DIR_LEFT  = 0x40                              # = 2
DIR_RIGHT = 0x60                              # = 3
LEDGE_DIR_MASK = 0x60
LEDGE_SOUTH = LEDGE | DIR_DOWN     # = 0x10
LEDGE_NORTH = LEDGE | DIR_UP       # = 0x30
LEDGE_WEST  = LEDGE | DIR_LEFT     # = 0x50
LEDGE_EAST  = LEDGE | DIR_RIGHT    # = 0x70
LEDGE_ANY   = LEDGE                # = 0x10 (test "có phải ledge")
WARP     = 0x80        # còn trống cho Phase 2/3 (warp object)

# ===== Event command 201 "Transfer Player" — params[4] = direction =====
# Đã đọc trực tiếp từ Essentials Scripts.rxdata (không đoán):
#   Interpreter_Commands#command_201 : $game_temp.player_new_direction = @parameters[4]
#   Scene_Map (dòng 80-86):
#       $game_player.moveto(x, y)
#       case $game_temp.player_new_direction
#       when 2 then $game_player.turn_down
#       when 4 then $game_player.turn_left
#       when 6 then $game_player.turn_right
#       when 8 then $game_player.turn_up
#       end
#   Compiler_MapsAndEvents (dòng 1298): "if params[4]==0 &&  # Retain direction"
# => Đây là HẸNG RMXP thô (@direction của Game_Character), KHÔNG phải 0..3:
#      0 = Retain (giữ hướng hiện tại — không set case nào ở trên)
#      2 = down, 4 = left, 6 = right, 8 = up
# Giá trị 0..3 không xuất hiện trong map data chuẩn, nên map sai sẽ ra hướng lạ.
ESSENTIALS_DIR_TO_DIRECTION = {
    2: "down",
    4: "left",
    6: "right",
    8: "up",
}

# Mapping terrain tag (Essentials @terrain_tags) → CollisionFlag.
# Đã suy ra EMPIRICALLY từ passage bits trong .rxdata gốc (không đoán).
# Script Essentials đã compile (MKXP) nên không đọc được PBTerrain module;
# suy ra bằng cách cross-reference terrain tag với @passages bits trên 69 map:
#   tag 10 = passage 0x40 (RMXP ledge-jump bit)  -> GRASS        (TallGrass - Lappet Town, 6 ô)
#   tag 1  = passage 0x07 (chặn từ hướng trên)   -> LEDGE down   (Route 2, 49 ô)
#   tag 2  = passage 0x40 (ledge bit)             -> GRASS        (Grass, Lappet Town)
#   tag 6  = passage 0x0f (chặn 4 hướng)          -> WATER        (Lappet Town pond — surf)
#   tag 8  = passage 0x0f (chặn 4 hướng)          -> WATER|BLOCKED (Route 8 — không surf)
#   tag 4  = passage 0x0f ~92%                    -> BLOCKED      (Rock Cave/solid)
#   tag 3  = passage 0x00                          -> WALKABLE     (Sand, Route 1, 1122 ô)
#   tag 12,13,16 = passage 0x00                   -> WALKABLE     (Ice/Neutral/Puddle)
#   tag 5,7 = WATER (DeepWater/Water) — không có trong data
#   tag 9 = WATER (WaterfallCrest) — không có trong data
#   tag 11 = WATER (UnderwaterGrass) — không có trong data
#   tag 14 = GRASS (SootGrass) — không có trong data
#   tag 15 = WALKABLE (Bridge) — không có trong data
# LEDGE direction: tag 1 = LEDGE_SOUTH (down, passage 0x07 — chặn hướng trên)
#   Không có ledges khác trong data hiện tại.
TERRAIN_TAG_TO_FLAG = {
    1:  WALKABLE | LEDGE_SOUTH,  # Ledge (jump down)   passage 0x07
    2:  GRASS,                   # Grass (encounter)   passage 0x40
    3:  WALKABLE,                # Sand                passage 0x00
    4:  BLOCKED,                 # Rock (chặn ~92%)     passage 0x0f
    5:  WATER,                   # DeepWater (surfable, không có trong data)
    6:  WATER,                   # StillWater (surfable) passage 0x0f
    7:  WATER,                   # Water (surfable, không có trong data)
    8:  WATER | BLOCKED,         # Waterfall (không surf) passage 0x0f
    9:  WATER,                   # WaterfallCrest (surfable, không có)
    10: GRASS,                   # TallGrass (deep_bush, encounter) passage 0x40
    11: WATER,                   # UnderwaterGrass (không có, dự phòng)
    12: WALKABLE,                # Ice                 passage 0x00 (1 tile Ice Cave)
    13: WALKABLE,                # Neutral             passage 0x00
    14: GRASS,                   # SootGrass (không có, dự phòng)
    15: WALKABLE,                # Bridge              passage 0x00
    16: WALKABLE,                # Puddle              passage 0x00
}


def _read_int16_array(raw):
    """Đọc mảng int16 từ _private_data (header <2I> + data)."""
    _, size = struct.unpack_from("<2I", raw, 0)
    return struct.unpack_from(f"<{size}h", raw, 8)

def convert(essentials_dir, map_id, slug, name, map_type="town", world="essen-classic"):
    tilesets_file = os.path.join(essentials_dir, "Data", "Tilesets.rxdata")
    map_file = os.path.join(essentials_dir, "Data", f"Map{map_id:03d}.rxdata")
    
    if not os.path.exists(map_file):
        print(f"Error: {map_file} not found")
        sys.exit(1)
        
    with open(tilesets_file, "rb") as f:
        tilesets = rubymarshal.reader.load(f)
        
    with open(map_file, "rb") as f:
        map_obj = rubymarshal.reader.load(f)
        
    attrs = map_obj.attributes
    w = attrs["@width"]
    h = attrs["@height"]
    tid = attrs["@tileset_id"]
    ts_data = tilesets[tid]
    
    raw = attrs["@data"]._private_data
    dim, xsize, ysize, zsize, size = struct.unpack_from("<5I", raw, 0)
    tiles = struct.unpack_from(f"<{size}h", raw, 20)
    
    passages_raw = ts_data.attributes["@passages"]._private_data
    p_dim, p_size = struct.unpack_from("<2I", passages_raw, 0)
    passages = struct.unpack_from(f"<{p_size}h", passages_raw, 8)

    terrain_tags = _read_int16_array(ts_data.attributes["@terrain_tags"]._private_data)

    prio_raw = ts_data.attributes["@priorities"]._private_data
    _, _, _, _, psz = struct.unpack_from("<5I", prio_raw, 0)
    priorities = struct.unpack_from(f"<{psz}h", prio_raw, 20)

    # Đọc tên tileset gốc từ RMXP để chọn đúng file ảnh (Outside / Interior general).
    raw_ts_name = ts_data.attributes.get("@tileset_name", "")
    ts_name = raw_ts_name.decode("utf-8", errors="ignore") if isinstance(raw_ts_name, bytes) else str(raw_ts_name)
    is_interior = (map_type == "interior") or ("interior" in ts_name.lower())
    if is_interior:
        tileset_image = "assets/tilesets/Interior general.png"
        tileset_name = "interior_general"
        tileset_w = 256
        tileset_h = 8032
        tileset_count = 2008
    else:
        tileset_image = "assets/tilesets/Outdoor.png"
        tileset_name = "outdoor"
        tileset_w = 256
        tileset_h = 16096
        tileset_count = 4024

    def _to_gid(tid_val, z_default=0):
        if tid_val == 0:
            return 0
        elif tid_val >= 384:
            return (tid_val - 384) + 1
        elif 240 <= tid_val < 288:
            return 411 if z_default == 0 else 5
        else:
            return 1 if z_default == 0 else 0

    ground_data = []
    deco_data = []
    overhead_data = []

    for y in range(h):
        for x in range(w):
            idx0 = 0 * (w * h) + y * w + x
            idx1 = 1 * (w * h) + y * w + x
            idx2 = 2 * (w * h) + y * w + x

            t0 = tiles[idx0]
            t1 = tiles[idx1]
            t2 = tiles[idx2]

            p0 = priorities[t0] if (0 <= t0 < len(priorities)) else 0
            p1 = priorities[t1] if (0 <= t1 < len(priorities)) else 0
            p2 = priorities[t2] if (0 <= t2 < len(priorities)) else 0

            # Ground: luôn là tile tầng 0 (sàn/đất)
            ground_data.append(_to_gid(t0, 0))

            # Decoration (priority == 0, vẽ dưới nhân vật):
            # Lấy tile từ z=2 nếu prio==0, nếu không lấy từ z=1 nếu prio==0
            d_tid = 0
            if t2 > 0 and p2 == 0:
                d_tid = t2
            elif t1 > 0 and p1 == 0:
                d_tid = t1
            deco_data.append(_to_gid(d_tid, 1) if d_tid > 0 else 0)

            # Overhead (priority > 0, vẽ trên đầu nhân vật - tán cây, mái nhà):
            # Lấy tile từ z=2 nếu prio > 0, nếu không lấy từ z=1 nếu prio > 0
            o_tid = 0
            if t2 > 0 and p2 > 0:
                o_tid = t2
            elif t1 > 0 and p1 > 0:
                o_tid = t1
            overhead_data.append(_to_gid(o_tid, 2) if o_tid > 0 else 0)

    layer_names = ["Ground", "Decoration", "Overhead"]
    layer_datas = [ground_data, deco_data, overhead_data]
    tmj_layers = []

    for z in range(3):
        tmj_layers.append({
            "data": layer_datas[z],
            "height": h,
            "id": z + 1,
            "name": layer_names[z],
            "opacity": 1,
            "type": "tilelayer",
            "visible": True,
            "width": w,
            "x": 0,
            "y": 0
        })
        
    events = map_obj.attributes.get("@events", {})
    tmj_objects = []       # Tiled TMJ: pixel coords (x*32), format chuẩn Tiled
    server_objects = []    # Server JSON: tile coords, type="warp"/"event", schema hợp lệ
    warp_positions = []    # (x, y) tile coords — ô có warp để set bit WARP
    warp_landing_positions = []  # (x, y) tile coords — ô landing của warp để set WALKABLE
    tmj_warp_props = {}    # event_id -> TMJ properties (toMap/toX/toY/direction) cho object type=warp

    # Map registry: RMXP map_id → project slug
    MAP_ID_TO_SLUG = {
        2: "lappet-town",
        3: "players-house",
        4: "pokemon-lab",
        5: "route-1",
        6: "kurts-house",
        7: "cedolan-city",
        8: "daisys-house",
        9: "cedolan-poke-center",
        10: "cedolan-gym",
        11: "pokemon-institute",
        12: "cedolan-condo",
        13: "game-corner",
        14: "cedolan-dept-1f",
    }

    for eid, ev in sorted(events.items()):
        eattrs = ev.attributes
        raw_name = eattrs.get("@name", "")
        ev_name = raw_name.decode("utf-8", errors="ignore") if isinstance(raw_name, bytes) else str(raw_name)
        ex = eattrs.get("@x", 0)
        ey = eattrs.get("@y", 0)

        # Trích warp từ @list của page[0] — lệnh code 201.
        warp_cmd = None
        pages = eattrs.get("@pages", [])
        if pages:
            page = pages[0]
            if hasattr(page, "attributes"):
                cmd_list = page.attributes.get("@list", [])
                for cmd in cmd_list:
                    if hasattr(cmd, "attributes") and cmd.attributes.get("@code") == 201:
                        params = cmd.attributes.get("@parameters", [])
                        if len(params) == 6:
                            warp_cmd = params
                        break

        # Tiled object (luôn thêm, format pixel coords)
        tmj_objects.append({
            "height": 32, "id": eid, "name": ev_name or f"Event_{eid}",
            "point": False, "rotation": 0, "type": "event", "visible": True,
            "width": 32, "x": ex * 32, "y": ey * 32,
            "properties": [{"name": "originalId", "type": "int", "value": eid}]
        })

        # Server object: warp nếu có code 201 và dest map nằm trong registry
        warp_target_slug = warp_to_x = warp_to_y = None
        warp_dir = None
        if warp_cmd:
            dest_id = warp_cmd[1]
            if dest_id in MAP_ID_TO_SLUG:
                warp_target_slug = MAP_ID_TO_SLUG[dest_id]
                warp_to_x, warp_to_y = warp_cmd[2], warp_cmd[3]
                dir_val = warp_cmd[4]
                # params[4] là hướng RMXP thô: 2=down, 4=left, 6=right, 8=up,
                # 0=retain (giữ hướng hiện tại). Giá trị ngoài set này = retain.
                warp_dir = {
                    0: None,  # retain (không set direction)
                    2: "down",
                    4: "left",
                    6: "right",
                    8: "up"
                }.get(dir_val)
                warp_positions.append((ex, ey))
                # Thêm landing tile (toX, toY) vào danh sách để set WALKABLE
                warp_landing_positions.append((warp_to_x, warp_to_y))
                obj = {
                    "id": eid, "name": ev_name or f"Warp_{eid}", "type": "warp",
                    "toMap": warp_target_slug, "toX": warp_to_x, "toY": warp_to_y,
                    "x": ex, "y": ey, "width": 1, "height": 1, "visible": True,
                }
                if warp_dir is not None:
                    obj["direction"] = warp_dir
                server_objects.append(obj)
                tmj_warp_props[eid] = [
                    {"name": "toMap", "type": "string", "value": warp_target_slug},
                    {"name": "toX", "type": "int", "value": warp_to_x},
                    {"name": "toY", "type": "int", "value": warp_to_y},
                ]
                if warp_dir is not None:
                    tmj_warp_props[eid].append({"name": "direction", "type": "string", "value": warp_dir})
                continue

        # Trích xuất NPC character nếu có graphic nhân vật hợp lệ
        gname = ""
        dialog_lines = []
        if pages:
            p0 = pages[0]
            if hasattr(p0, "attributes"):
                g = p0.attributes.get("@graphic")
                if g and hasattr(g, "attributes"):
                    raw_g = g.attributes.get("@character_name", "")
                    gname = raw_g.decode("utf-8", errors="ignore") if isinstance(raw_g, bytes) else str(raw_g)
                cmd_list = p0.attributes.get("@list", [])
                for cmd in cmd_list:
                    if hasattr(cmd, "attributes"):
                        code = cmd.attributes.get("@code")
                        params = cmd.attributes.get("@parameters", [])
                        if code in (101, 401) and params:
                            t = params[0]
                            if isinstance(t, bytes): t = t.decode("utf-8", errors="ignore")
                            import re
                            clean_t = re.sub(r'\\(?:[a-zA-Z]+(?=\[)|[a-zA-Z])(?:\[[^\]]*\])?', '', str(t)).strip()
                            if clean_t:
                                dialog_lines.append(clean_t)

        def _map_npc_sprite(g_val, n_val):
            if not g_val: return None
            g = g_val.lower()
            n = (n_val or "").lower()
            if g.startswith("doors") or g.startswith("object") or g.startswith("berrytree") or "ball" in g:
                return None
            if "brock" in g or "brock" in n: return "brock"
            if "mom" in n or "npc 28" in g: return "mom"
            if "prof" in n or "oak" in n or "phone001" in g: return "oak"
            if "daisy" in n or "npc 26" in g: return "daisy"
            if "kurt" in n or "npc 18" in g: return "kurt"
            if "nurse" in n or "joy" in n or "npc 16" in g: return "nurse"
            if "scientist" in g or "fossil" in n: return "scientist"
            if "name rater" in n or "namerater" in n: return "namerater"
            if "camper" in g or "youngster" in g or "youngster" in n: return "youngster"
            if "police" in g or "officer" in n: return "policeman"
            if "guide" in n or "explainer" in n or "gym guy" in n or "npc 15" in g or "npc 06" in g: return "guide"
            if g.startswith("trainer_") or "trainer" in n: return "youngster"
            if g.startswith("npc "): return "citizen"
            return None

        npc_sprite = _map_npc_sprite(gname, ev_name)
        if npc_sprite:
            import re
            is_trainer = False
            trainer_id = None
            g_low = gname.lower()
            n_low = ev_name.lower()
            if g_low.startswith("trainer_") or "trainer" in n_low or "brock" in n_low or "camper" in n_low:
                is_trainer = True
                if "brock" in n_low: trainer_id = "leader_brock_brock"
                elif "camper" in n_low: trainer_id = "camper_liam"
                elif "youngster" in n_low: trainer_id = "youngster_ben"

            npc_id = re.sub(r'[^a-z0-9_]+', '_', ev_name.lower()).strip('_') or f"npc_{eid}"
            npc_obj = {
                "id": eid,
                "name": ev_name or f"NPC_{eid}",
                "type": "npc_spawn",
                "npcId": npc_id,
                "sprite": npc_sprite,
                "x": ex,
                "y": ey,
                "width": 1,
                "height": 1,
                "trainer": is_trainer,
                "dialog": dialog_lines if dialog_lines else [f"Xin chào! Tôi là {ev_name}."],
                "team": [],
                "visible": True,
            }
            if trainer_id:
                npc_obj["trainerId"] = trainer_id
            server_objects.append(npc_obj)
            continue

        # Event generic (không phải warp hoặc dest map chưa convert)
        server_objects.append({
            "id": eid, "name": ev_name or f"Event_{eid}", "type": "event",
            "x": ex, "y": ey, "width": 1, "height": 1, "visible": True,
        })

    tmj_layers.append({
        "draworder": "topdown", "id": 4, "name": "Objects",
        "objects": tmj_objects, "opacity": 1, "type": "objectgroup",
        "visible": True, "x": 0,
        "y": 0
    })
    
    # ── Phase 4.1 (plan-tiled-first): TMJ giờ cũng chứa đủ dữ liệu cho build:map ──
    #
    # Trước đây TMJ CHỈ có tile graphics → build-server-map phải đoán collision
    # bằng layer heuristic → SAI 27% (không biết passage của từng tile).
    #
    # Giờ TMJ ghi thêm 2 thứ:
    #   (a) `tilesets[0].tiles[].properties` — passage + terrain_tag CHO TỪNG TILE
    #       (chỉ tile ĐANG DỤNG trong map này → giữ file nhỏ; thường 40-80 tile).
    #       build-server-map đọc qua "tầng B" → tái tạo đúng collision của converter.
    #   (b) object `type:"warp"` với properties toMap/toX/toY/direction
    #       (trước đây mọi object đều là type:"event" → build:map ra 0 warp).
    #
    # Chiến lược: viết TMJ SAI-CÓ-Ý (chỉ graphics), rồi patch lại TMJ để thêm 2 thứ
    # đó — KHÔNG đụng đến logic server JSON (vẫn giữ nguyên output gốc).

    def _prop_int(name, value):
        return {"name": name, "type": "int", "value": int(value)}

    def _prop_str(name, value):
        return {"name": name, "type": "string", "value": str(value)}

    # 1a. Các tile đang dùng trong map.
    #     Emit `passage` cho TẤT CẢ tile dùng (kể cả 0x00) — build-server-map cần
    #     biết "không chặn" một cách tường minh, nếu không ô Decoration có passage
    #     0x00 sẽ bị heuristic mặc định BLOCKED (sai — đó chính là lỗi mái nhà).
    used_tile_ids = set()
    for i in range(w * h * zsize):
        t = tiles[i]
        if t >= 384:
            used_tile_ids.add(t - 384)   # Tiled tile id (0-based, = gid - firstgid)

    tiles_props = []
    for tile_id in sorted(used_tile_ids):
        rmxp_tid = tile_id + 384
        pass_val = passages[rmxp_tid] if rmxp_tid < len(passages) else 0
        terrain_val = terrain_tags[rmxp_tid] if rmxp_tid < len(terrain_tags) else 0
        props = [_prop_int("passage", pass_val)]
        if terrain_val != 0:
            props.append(_prop_int("terrain_tag", terrain_val))
        tiles_props.append({"id": tile_id, "properties": props})

    # 1b. TMJ objects = warp thật (thay cho mọi object đều là "event")
    tmj_objects_for_tiled = []
    for so in server_objects:
        if so["type"] == "warp":
            tmj_objects_for_tiled.append({
                "height": 32, "id": so["id"], "name": so["name"], "point": False,
                "rotation": 0, "type": "warp", "visible": True, "width": 32,
                "x": so["x"] * 32, "y": so["y"] * 32,
                "properties": list(tmj_warp_props.get(so["id"]) or [])
            })
        elif so["type"] == "npc_spawn":
            props = [
                {"name": "npcId", "type": "string", "value": so["npcId"]},
                {"name": "sprite", "type": "string", "value": so["sprite"]},
                {"name": "trainer", "type": "bool", "value": so.get("trainer", False)},
                {"name": "originalId", "type": "int", "value": so["id"]},
            ]
            if "trainerId" in so:
                props.append({"name": "trainerId", "type": "string", "value": so["trainerId"]})
            if "dialog" in so and so["dialog"]:
                props.append({"name": "dialog", "type": "string", "value": "\n".join(so["dialog"])})
            tmj_objects_for_tiled.append({
                "height": 32, "id": so["id"], "name": so["name"], "point": False,
                "rotation": 0, "type": "npc_spawn", "visible": True, "width": 32,
                "x": so["x"] * 32, "y": so["y"] * 32,
                "properties": props
            })
        else:
            # Giữ object dạng event + originalId như cũ
            tmj_objects_for_tiled.append({
                "height": 32, "id": so["id"], "name": so["name"], "point": False,
                "rotation": 0, "type": "event", "visible": True, "width": 32,
                "x": so["x"] * 32, "y": so["y"] * 32,
                "properties": [{"name": "originalId", "type": "int", "value": so["id"]}]
            })
    # Thay object layer cũ (event-only) bằng bản có warp
    tmj_layers[-1]["objects"] = tmj_objects_for_tiled

    tmj_json = {
        "compressionlevel": -1,
        "height": h,
        "width": w,
        "infinite": False,
        "layers": tmj_layers,
        "nextlayerid": 5,
        "nextobjectid": len(tmj_objects_for_tiled) + 1,
        "orientation": "orthogonal",
        "properties": [
            _prop_str("name", name),
            _prop_str("mapType", map_type),
            _prop_str("music", slug),
            _prop_str("weather", "sunny"),
            _prop_str("description", f"{name} ported from Pokémon Essentials."),
        ],
        "renderorder": "right-down",
        "tiledversion": "1.10.2",
        "tileheight": 32,
        "tilewidth": 32,
        "tilesets": [
            {
                "columns": 8,
                "firstgid": 1,
                "image": tileset_image,
                "imageheight": tileset_h,
                "imagewidth": tileset_w,
                "margin": 0,
                "name": tileset_name,
                "spacing": 0,
                "tilecount": tileset_count,
                "tileheight": 32,
                "tilewidth": 32,
                # Phase 4.1: per-tile passage + terrain_tag cho build-server-map
                "tiles": tiles_props,
            }
        ],
        "type": "map",
        "version": "1.10"
    }
    
    collision_flags = []
    for y in range(h):
        for x in range(w):
            # 2) Terrain tag (ground layer z=0) — water/grass/ledge/...
            ground_tid = tiles[y * w + x]
            terrain_flag = 0
            if ground_tid >= 384 and ground_tid < len(terrain_tags):
                terrain_flag = TERRAIN_TAG_TO_FLAG.get(terrain_tags[ground_tid], 0)

            # 1) Passage bits (blocking) — kiểm tra mọi layer
            is_blocked = False
            for z in range(zsize):
                tid_val = tiles[z * (w * h) + y * w + x]
                if tid_val >= 384 and tid_val < len(passages):
                    pass_flag = passages[tid_val]
                    if (pass_flag & 0x0f) == 0x0f:
                        is_blocked = True
                        break

            # Ưu tiên BLOCKED từ terrain tag hơn WALKABLE từ passage.
            # Ô nước đã có bit WATER nên không cần thêm BLOCKED (isWalkable
            # đã chặn nước vì WATER; thêm BLOCKED sẽ khiến nước không surf được).
            if is_blocked:
                if terrain_flag & WATER:
                    flag = terrain_flag
                else:
                    flag = (terrain_flag & ~WALKABLE) | BLOCKED
            else:
                flag = terrain_flag | WALKABLE
            collision_flags.append(flag)

    # Set bit WARP (0x80) vào ô warp — đồng thời bỏ BLOCKED để player đi lên door tile được.
    # Nếu ô warp đã có WATER thì giữ nguyên (không set WARP để tránh conflict).
    for (wx, wy) in warp_positions:
        idx = wy * w + wx
        if 0 <= idx < len(collision_flags):
            f = collision_flags[idx]
            if f & WATER:
                continue  # nước — bỏ qua
            # Clear BLOCKED, giữ nguyên các bit khác, thêm WALKABLE + WARP
            f = (f & ~BLOCKED) | WALKABLE | WARP
            collision_flags[idx] = f

    # Set WALKABLE cho landing tiles (ô đích của warp) — trong Essentials,
    # door/stair tiles có thể bị BLOCKED ở tile data nhưng player vẫn đứng
    # được sau khi warp (ví dụ players-house (3,8) là ô tường nhưng player
    # đứng ở đó sau khi vào nhà).
    for (lx, ly) in warp_landing_positions:
        if lx < 0 or ly < 0 or lx >= w or ly >= h:
            continue
        idx = ly * w + lx
        if idx >= len(collision_flags):
            continue
        f = collision_flags[idx]
        if f & WATER:
            continue
        collision_flags[idx] = (f & ~BLOCKED) | WALKABLE

    # Cross-map landing tiles: patch các ô landing đến từ map khác
    # (đọc server JSON của các map khác đã convert trước)
    _patch_cross_map_landings(slug, collision_flags, w, h)

    server_json = {
        "mapId": slug,
        "name": name,
        "description": f"{name} ported from Pokémon Essentials.",
        "mapType": map_type,
        "music": slug,
        "weather": "sunny",
        "worldId": world,
        "width": w,
        "height": h,
        "tileWidth": 32,
        "tileHeight": 32,
        "collision": {
            "name": "collision",
            "width": w,
            "height": h,
            "flags": collision_flags
        },
        "objects": server_objects,
        "encounters": [],
        "requiredBadges": []
    }
    
    tiled_out = os.path.join(PROJECT_ROOT, "packages", "shared", "data", "maps", "worlds", world, "tiled", f"{slug}.tmj")
    server_out = os.path.join(PROJECT_ROOT, "packages", "shared", "data", "maps", "worlds", world, "server", f"{slug}.json")
    os.makedirs(os.path.dirname(tiled_out), exist_ok=True)
    os.makedirs(os.path.dirname(server_out), exist_ok=True)
    
    with open(tiled_out, "w") as f:
        json.dump(tmj_json, f, indent=2)
    with open(server_out, "w") as f:
        json.dump(server_json, f, indent=2)
        
    n_warp = sum(1 for o in server_objects if o["type"] == "warp")
    print(f"Successfully converted Map {map_id:03d} -> {slug} ({w}x{h}) | warps={n_warp} | events={len(server_objects) - n_warp}")

def _patch_cross_map_landings(target_slug, collision_flags, w, h):
    """Patch WALKABLE cho landing tiles từ warps của map khác trỏ đến target_slug."""
    import glob as _glob
    worlds_dir = os.path.join(PROJECT_ROOT, "packages", "shared", "data", "maps", "worlds")
    if not os.path.isdir(worlds_dir):
        return
    for world in sorted(os.listdir(worlds_dir)):
        server_dir = os.path.join(worlds_dir, world, "server")
        if not os.path.isdir(server_dir):
            continue
        for path in _glob.glob(os.path.join(server_dir, "*.json")):
            other_slug = os.path.splitext(os.path.basename(path))[0]
            if other_slug == target_slug:
                continue
            try:
                with open(path) as f:
                    other = json.load(f)
                if not isinstance(other, dict) or other.get("mapId") != other_slug:
                    continue
            except Exception:
                continue
            for o in other.get("objects", []):
                if o.get("type") != "warp" or o.get("toMap") != target_slug:
                    continue
                tx, ty = o.get("toX"), o.get("toY")
                if tx is None or ty is None or tx < 0 or ty < 0 or tx >= w or ty >= h:
                    continue
                idx = ty * w + tx
                if idx >= len(collision_flags):
                    continue
                f = collision_flags[idx]
                if f & WATER:
                    continue
                collision_flags[idx] = (f & ~BLOCKED) | WALKABLE

# Ghi chú cho developer Phase 1a:
# - Đây là SSO (single source of truth) va chạm. Client import static, server
#   validate bằng cùng file này qua mapLoader + mapruntime.isWalkable().
# - collision.flags là bitmask CollisionFlag (0x01 WALKABLE, 0x02 WATER,
#   0x04 BLOCKED, 0x08 GRASS, 0x10..0x40 LEDGE_*, 0x80 WARP).
# - Cùng tile có thể có nhiều bit (vd 0x11 = walkable + ledge-south).
# - isWalkable() trả false nếu có BLOCKED hoặc WATER (cần surf).
# - Directional ledge (LEDGE_N/W/E) sẽ được refine ở Phase 2 với sprite.
def main():
    parser = argparse.ArgumentParser(description="Convert Essentials Map to Pixelmon Tiled/Server format")
    parser.add_argument("map_id", type=int, help="Essentials map ID (e.g. 2, 5, 7)")
    parser.add_argument("slug", type=str, help="Target map slug (e.g. pallet-town, route-1)")
    parser.add_argument("name", type=str, help="Display name (e.g. 'Route 1')")
    parser.add_argument("--type", type=str, default="town", help="Map type (town, route, interior)")
    parser.add_argument("--world", type=str, default="essen-classic", help="Target world id")
    parser.add_argument("--essentials", type=str, default=ESSENTIALS_DEFAULT, help="Path to Essentials root")

    args = parser.parse_args()
    convert(args.essentials, args.map_id, args.slug, args.name, args.type, args.world)

if __name__ == "__main__":
    main()
