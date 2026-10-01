#!/usr/bin/env python3
"""
RMXP Map Viewer Server
Renders RPG Maker XP / Pokémon Essentials maps (.rxdata) and serves an interactive web viewer.
"""

import http.server
import json
import os
import socketserver
import struct
import sys
import urllib.parse
from PIL import Image
import rubymarshal.reader

ESSENTIALS_PATH = "/home/huynhat/Downloads/Pokemon Essentials v21.1 2023-07-30"
SCRATCH_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "scratch", "rmxp_viewer")
PORT = 8088

os.makedirs(SCRATCH_DIR, exist_ok=True)

# Load tilesets metadata once
with open(os.path.join(ESSENTIALS_PATH, "Data", "Tilesets.rxdata"), "rb") as f:
    ALL_TILESETS = rubymarshal.reader.load(f)

MAP_CONFIGS = [
    {
        "id": 2,
        "label": "Map 002: Lappet Town (Pallet Town Ngoài Trời)",
        "description": "Bản đồ thị trấn khởi đầu nguyên bản Pokémon Essentials (Lappet = Pallet). Có nhà người chơi (Player's House), nhà đối thủ (Daisy's House), Viện nghiên cứu Giáo sư Oak (Pokémon Lab), hồ nước và đường nối phía Bắc lên Route 1.",
        "connections": "Phía Bắc nối Route 1 (Map 005), phía Nam nối Safari Zone (Map 066), Route 8 (Map 069)",
    },
    {
        "id": 3,
        "label": "Map 003: Player's House (Nhà nhân vật chính)",
        "description": "Nhà người chơi gồm phòng khách và phòng ngủ, chứa HealingSpot (điểm hồi sinh/hồi máu chính thức của Lappet Town).",
        "connections": "Cửa ra vào nối với Lappet Town tại toạ độ (8, 7)",
    },
    {
        "id": 4,
        "label": "Map 004: Pokémon Lab (Oak's Lab)",
        "description": "Viện nghiên cứu của Giáo sư Oak: Bàn giữa đặt 3 quả Pokéball khởi đầu (Hệ Cỏ, Lửa, Nước), máy hồi máu Pokémon bên trái, kệ sách nghiên cứu.",
        "connections": "Cửa ra vào nối với Lappet Town tại toạ độ (18, 13)",
    },
    {
        "id": 8,
        "label": "Map 008: Daisy's House (Nhà Daisy / Đối thủ)",
        "description": "Nhà của Daisy (chị gái của đối thủ Blue).",
        "connections": "Cửa ra vào nối với Lappet Town tại toạ độ (17, 7)",
    },
]

def load_map_data(map_id: int):
    map_file = os.path.join(ESSENTIALS_PATH, "Data", f"Map{map_id:03d}.rxdata")
    if not os.path.exists(map_file):
        return None
    with open(map_file, "rb") as f:
        map_obj = rubymarshal.reader.load(f)
    return map_obj

def get_events_info(map_obj):
    events_data = []
    events = map_obj.attributes.get("@events", {})
    for eid, ev in sorted(events.items()):
        attrs = ev.attributes
        raw_name = attrs.get("@name", "")
        if isinstance(raw_name, bytes):
            try:
                name = raw_name.decode("utf-8")
            except Exception:
                name = str(raw_name)
        else:
            name = str(raw_name)
        
        x = attrs.get("@x", 0)
        y = attrs.get("@y", 0)
        pages = attrs.get("@pages", [])
        char_name = ""
        if pages:
            g = pages[0].attributes.get("@graphic")
            if g:
                c = g.attributes.get("@character_name", "")
                if isinstance(c, bytes):
                    char_name = c.decode("utf-8", errors="ignore")
                else:
                    char_name = str(c)
        
        events_data.append({
            "id": eid,
            "name": name,
            "x": x,
            "y": y,
            "character": char_name,
        })
    return events_data

def render_map_images(map_id: int):
    map_obj = load_map_data(map_id)
    if not map_obj:
        return None

    attrs = map_obj.attributes
    w = attrs["@width"]
    h = attrs["@height"]
    tid = attrs["@tileset_id"]
    ts_data = ALL_TILESETS[tid]
    raw_ts_name = ts_data.attributes.get("@tileset_name", "")
    ts_name = raw_ts_name.decode("utf-8") if isinstance(raw_ts_name, bytes) else str(raw_ts_name)

    ts_path = os.path.join(ESSENTIALS_PATH, "Graphics", "Tilesets", f"{ts_name}.png")
    ts_img = Image.open(ts_path).convert("RGBA")

    flowers_path = os.path.join(ESSENTIALS_PATH, "Graphics", "Autotiles", "Flowers1.png")
    flowers_img = Image.open(flowers_path).convert("RGBA") if os.path.exists(flowers_path) else None

    raw = attrs["@data"]._private_data
    dim, xsize, ysize, zsize, size = struct.unpack_from("<5I", raw, 0)
    tiles = struct.unpack_from(f"<{size}h", raw, 20)

    composite = Image.new("RGBA", (w * 32, h * 32), (0, 0, 0, 0 if tid != 1 else 255))
    layer_images = []

    for z in range(zsize):
        layer_img = Image.new("RGBA", (w * 32, h * 32), (0, 0, 0, 0))
        for y in range(h):
            for x in range(w):
                tid_val = tiles[z * (w * h) + y * w + x]
                if tid_val == 0:
                    continue
                if tid_val >= 384:
                    idx = tid_val - 384
                    col = idx % 8
                    row = idx // 8
                    sx = col * 32
                    sy = row * 32
                    if sy + 32 <= ts_img.height:
                        tile = ts_img.crop((sx, sy, sx + 32, sy + 32))
                        layer_img.alpha_composite(tile, (x * 32, y * 32))
                        composite.alpha_composite(tile, (x * 32, y * 32))
                elif 240 <= tid_val < 288 and flowers_img:
                    flower_tile = flowers_img.crop((0, 0, 32, 32))
                    layer_img.alpha_composite(flower_tile, (x * 32, y * 32))
                    composite.alpha_composite(flower_tile, (x * 32, y * 32))
        
        layer_path = os.path.join(SCRATCH_DIR, f"map_{map_id:03d}_layer_{z+1}.png")
        layer_img.save(layer_path)
        layer_images.append(f"/images/map_{map_id:03d}_layer_{z+1}.png")

    composite_path = os.path.join(SCRATCH_DIR, f"map_{map_id:03d}_composite.png")
    composite.save(composite_path)

    events_info = get_events_info(map_obj)

    return {
        "id": map_id,
        "width": w,
        "height": h,
        "tileset_id": tid,
        "tileset_name": ts_name,
        "layers_count": zsize,
        "composite_url": f"/images/map_{map_id:03d}_composite.png",
        "layers_url": layer_images,
        "events": events_info,
    }

# Pre-render
MAP_CACHE = {}
for mcfg in MAP_CONFIGS:
    mid = mcfg["id"]
    data = render_map_images(mid)
    if data:
        data.update(mcfg)
        MAP_CACHE[mid] = data

HTML_PAGE = """<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Pokémon Essentials v21.1 — Pallet Town Map Viewer</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      --bg: #0f172a;
      --panel: #1e293b;
      --panel-border: #334155;
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --highlight: #f59e0b;
      --green: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    header {
      background: var(--panel);
      border-bottom: 1px solid var(--panel-border);
      padding: 10px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 15px;
      z-index: 10;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .badge {
      background: #0284c7;
      color: white;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      letter-spacing: 0.5px;
    }
    .title {
      font-size: 16px;
      font-weight: 600;
    }
    .controls {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    label {
      font-size: 13px;
      color: var(--text-muted);
    }
    select, button {
      background: #0f172a;
      color: var(--text);
      border: 1px solid var(--panel-border);
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 13px;
      cursor: pointer;
      outline: none;
      transition: all 0.15s ease;
    }
    select:hover, button:hover {
      background: #1e293b;
      border-color: #64748b;
    }
    button.active {
      background: var(--accent);
      border-color: var(--accent);
      color: white;
    }
    .main-container {
      display: flex;
      flex: 1;
      height: calc(100vh - 57px);
      overflow: hidden;
    }
    .viewport {
      flex: 1;
      position: relative;
      background: #090c10 radial-gradient(#1e293b 1px, transparent 1px);
      background-size: 24px 24px;
      overflow: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      user-select: none;
    }
    .canvas-container {
      position: relative;
      box-shadow: 0 10px 40px rgba(0,0,0,0.7);
      border: 1px solid #475569;
      background: #111;
      image-rendering: pixelated;
    }
    #map-image {
      display: block;
      image-rendering: pixelated;
      pointer-events: none;
    }
    #grid-canvas {
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
    }
    .event-pin {
      position: absolute;
      width: 32px;
      height: 32px;
      border: 2px solid #ef4444;
      background: rgba(239, 68, 68, 0.4);
      border-radius: 4px;
      box-sizing: border-box;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: bold;
      color: #fff;
      text-shadow: 0 1px 2px #000;
      transition: transform 0.15s, background 0.15s;
      z-index: 5;
    }
    .event-pin:hover {
      background: rgba(239, 68, 68, 0.85);
      transform: scale(1.15);
      z-index: 10;
    }
    .event-tooltip {
      position: absolute;
      bottom: 36px;
      left: 50%;
      transform: translateX(-50%);
      background: #0f172a;
      border: 1px solid #38bdf8;
      color: #f8fafc;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 12px;
      white-space: nowrap;
      pointer-events: none;
      display: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.6);
      z-index: 20;
    }
    .event-pin:hover .event-tooltip {
      display: block;
    }
    .sidebar {
      width: 360px;
      background: var(--panel);
      border-left: 1px solid var(--panel-border);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }
    .sidebar-section {
      padding: 16px;
      border-bottom: 1px solid var(--panel-border);
    }
    .sidebar-section h3 {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 10px;
    }
    .info-table {
      width: 100%;
      font-size: 13px;
      border-collapse: collapse;
    }
    .info-table td {
      padding: 5px 0;
      vertical-align: top;
    }
    .info-table td:first-child {
      color: var(--text-muted);
      width: 38%;
    }
    .info-table td:last-child {
      color: var(--text);
      font-weight: 500;
    }
    .event-item {
      background: #0f172a;
      border: 1px solid var(--panel-border);
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .event-item:hover {
      background: #1e293b;
      border-color: #38bdf8;
    }
    .event-item-title {
      font-size: 13px;
      font-weight: 600;
      color: #38bdf8;
      display: flex;
      justify-content: space-between;
    }
    .event-item-sub {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .hud {
      position: absolute;
      bottom: 15px;
      left: 15px;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid #334155;
      backdrop-filter: blur(4px);
      padding: 6px 14px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 13px;
      color: #38bdf8;
      pointer-events: none;
      z-index: 20;
    }
  </style>
</head>
<body>
  <header>
    <div class="header-left">
      <span class="badge">Essentials v21.1</span>
      <span class="title">RMXP Map Viewer</span>
    </div>
    <div class="controls">
      <select id="map-select"></select>
      <label>Layer:</label>
      <select id="layer-select">
        <option value="composite">Tất cả (Composite)</option>
        <option value="0">Layer 1 (Nền / Nước / Cỏ)</option>
        <option value="1">Layer 2 (Nhà / Cây / Tường)</option>
        <option value="2">Layer 3 (Mái / Ngọn cây / Trang trí)</option>
      </select>
      <button id="btn-grid" class="active">Grid 32×32</button>
      <button id="btn-events" class="active">Events</button>
      <button id="btn-zoom-in">+</button>
      <button id="btn-zoom-out">-</button>
      <button id="btn-zoom-reset">100%</button>
    </div>
  </header>

  <div class="main-container">
    <div class="viewport" id="viewport">
      <div class="canvas-container" id="container">
        <img id="map-image" src="" alt="Map">
        <canvas id="grid-canvas"></canvas>
        <div id="events-layer"></div>
      </div>
      <div class="hud" id="hud">Tile: --, -- | Pos: --, --</div>
    </div>

    <div class="sidebar">
      <div class="sidebar-section">
        <h3 id="map-title-label">Thông tin Map</h3>
        <p id="map-desc" style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px; line-height: 1.5;"></p>
        <table class="info-table">
          <tr><td>Map ID</td><td id="info-id">--</td></tr>
          <tr><td>Kích thước</td><td id="info-size">--</td></tr>
          <tr><td>Độ phân giải</td><td id="info-res">--</td></tr>
          <tr><td>Tileset</td><td id="info-tileset">--</td></tr>
          <tr><td>Kết nối Map</td><td id="info-conn" style="font-size: 12px; color: #94a3b8;">--</td></tr>
        </table>
      </div>

      <div class="sidebar-section" style="flex: 1;">
        <h3>Danh sách Events (<span id="event-count">0</span>)</h3>
        <div id="events-list"></div>
      </div>
    </div>
  </div>

  <script>
    const MAPS = %MAPS_JSON%;
    let currentMapId = 2;
    let currentLayer = "composite";
    let zoom = 1.0;
    let showGrid = true;
    let showEvents = true;

    const mapSelect = document.getElementById("map-select");
    const layerSelect = document.getElementById("layer-select");
    const mapImg = document.getElementById("map-image");
    const gridCanvas = document.getElementById("grid-canvas");
    const eventsLayer = document.getElementById("events-layer");
    const container = document.getElementById("container");
    const viewport = document.getElementById("viewport");
    const hud = document.getElementById("hud");

    // Populate select
    Object.values(MAPS).forEach(m => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.label;
      mapSelect.appendChild(opt);
    });

    mapSelect.value = currentMapId;
    mapSelect.addEventListener("change", (e) => {
      currentLayer = "composite";
      layerSelect.value = "composite";
      loadMap(parseInt(e.target.value));
    });

    layerSelect.addEventListener("change", (e) => {
      currentLayer = e.target.value;
      updateMapImage();
    });

    function updateMapImage() {
      const data = MAPS[currentMapId];
      if (!data) return;
      if (currentLayer === "composite") {
        mapImg.src = data.composite_url;
      } else {
        const idx = parseInt(currentLayer);
        mapImg.src = data.layers_url[idx] || data.composite_url;
      }
    }

    function loadMap(id) {
      currentMapId = id;
      const data = MAPS[id];
      if (!data) return;

      updateMapImage();
      document.getElementById("map-title-label").textContent = data.label;
      document.getElementById("map-desc").textContent = data.description;
      document.getElementById("info-id").textContent = `#${String(data.id).padStart(3, '0')}`;
      document.getElementById("info-size").textContent = `${data.width} × ${data.height} tiles`;
      document.getElementById("info-res").textContent = `${data.width * 32} × ${data.height * 32} px`;
      document.getElementById("info-tileset").textContent = data.tileset_name;
      document.getElementById("info-conn").textContent = data.connections || "Không có";
      document.getElementById("event-count").textContent = data.events.length;

      mapImg.onload = () => {
        const w = data.width * 32;
        const h = data.height * 32;
        container.style.width = w + "px";
        container.style.height = h + "px";
        gridCanvas.width = w;
        gridCanvas.height = h;
        renderGrid(data.width, data.height);
        renderEvents(data.events);
        applyZoom();
      };
    }

    function renderGrid(cols, rows) {
      const ctx = gridCanvas.getContext("2d");
      ctx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
      if (!showGrid) return;

      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 1;

      for (let x = 0; x <= cols; x++) {
        ctx.beginPath();
        ctx.moveTo(x * 32, 0);
        ctx.lineTo(x * 32, rows * 32);
        ctx.stroke();
      }
      for (let y = 0; y <= rows; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * 32);
        ctx.lineTo(cols * 32, y * 32);
        ctx.stroke();
      }
    }

    function renderEvents(events) {
      eventsLayer.innerHTML = "";
      const listEl = document.getElementById("events-list");
      listEl.innerHTML = "";

      events.forEach(ev => {
        const pin = document.createElement("div");
        pin.className = "event-pin";
        pin.style.left = (ev.x * 32) + "px";
        pin.style.top = (ev.y * 32) + "px";
        pin.style.display = showEvents ? "flex" : "none";
        pin.innerHTML = `<span>${ev.id}</span>
          <div class="event-tooltip">
            <strong>#${ev.id}: ${ev.name || '(Event)'}</strong><br>
            Tọa độ: (${ev.x}, ${ev.y})<br>
            ${ev.character ? 'Graphic: ' + ev.character : 'Trigger/Warp (Không sprite)'}
          </div>`;
        eventsLayer.appendChild(pin);

        const item = document.createElement("div");
        item.className = "event-item";
        item.innerHTML = `
          <div class="event-item-title">
            <span>#${ev.id} ${ev.name || '(Không tên)'}</span>
            <span style="font-family:monospace; color:#38bdf8;">(${ev.x}, ${ev.y})</span>
          </div>
          <div class="event-item-sub">Graphic: ${ev.character || 'Trigger / Warp / Sign'}</div>
        `;
        item.addEventListener("click", () => {
          pin.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
          pin.style.boxShadow = "0 0 15px 5px #f59e0b";
          setTimeout(() => { pin.style.boxShadow = ""; }, 1500);
        });
        listEl.appendChild(item);
      });
    }

    function applyZoom() {
      container.style.transform = `scale(${zoom})`;
      container.style.transformOrigin = "center center";
      document.getElementById("btn-zoom-reset").textContent = `${Math.round(zoom * 100)}%`;
    }

    document.getElementById("btn-zoom-in").addEventListener("click", () => {
      zoom = Math.min(zoom + 0.25, 3.0);
      applyZoom();
    });
    document.getElementById("btn-zoom-out").addEventListener("click", () => {
      zoom = Math.max(zoom - 0.25, 0.5);
      applyZoom();
    });
    document.getElementById("btn-zoom-reset").addEventListener("click", () => {
      zoom = 1.0;
      applyZoom();
    });

    document.getElementById("btn-grid").addEventListener("click", (e) => {
      showGrid = !showGrid;
      e.target.classList.toggle("active", showGrid);
      const data = MAPS[currentMapId];
      if (data) renderGrid(data.width, data.height);
    });

    document.getElementById("btn-events").addEventListener("click", (e) => {
      showEvents = !showEvents;
      e.target.classList.toggle("active", showEvents);
      document.querySelectorAll(".event-pin").forEach(p => {
        p.style.display = showEvents ? "flex" : "none";
      });
    });

    viewport.addEventListener("mousemove", (e) => {
      const rect = container.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left) / zoom;
      const mouseY = (e.clientY - rect.top) / zoom;
      const data = MAPS[currentMapId];
      if (!data) return;

      const tileX = Math.floor(mouseX / 32);
      const tileY = Math.floor(mouseY / 32);
      if (tileX >= 0 && tileX < data.width && tileY >= 0 && tileY < data.height) {
        hud.textContent = `Tile: (${tileX}, ${tileY}) | Pixel: (${Math.floor(mouseX)}, ${Math.floor(mouseY)})`;
      } else {
        hud.textContent = `Tile: --, -- | Pos: --, --`;
      }
    });

    loadMap(currentMapId);
  </script>
</body>
</html>
"""

class CustomHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def handle_request(self, is_head=False):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in ["/", "/index.html"]:
            rendered_html = HTML_PAGE.replace("%MAPS_JSON%", json.dumps(MAP_CACHE)).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(rendered_html)))
            self.end_headers()
            if not is_head:
                self.wfile.write(rendered_html)
        elif parsed.path.startswith("/images/"):
            fname = os.path.basename(parsed.path)
            fpath = os.path.join(SCRATCH_DIR, fname)
            if os.path.exists(fpath):
                fsize = os.path.getsize(fpath)
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Content-Length", str(fsize))
                self.end_headers()
                if not is_head:
                    with open(fpath, "rb") as f:
                        self.wfile.write(f.read())
            else:
                self.send_error(404, "File not found")
        elif parsed.path == "/api/maps":
            body = json.dumps(MAP_CACHE).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if not is_head:
                self.wfile.write(body)
        else:
            self.send_error(404, "Not found")

    def do_GET(self):
        self.handle_request(is_head=False)

    def do_HEAD(self):
        self.handle_request(is_head=True)

def run():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", PORT), CustomHTTPHandler) as httpd:
        print(f"RMXP Map Viewer Server running at http://localhost:{PORT}")
        print(f"Serving Map 002 (Lappet Town / Pallet Town), Map 003, Map 004, Map 008")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")

if __name__ == "__main__":
    run()
