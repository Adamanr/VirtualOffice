"""Downloads the CC0 Poly Haven assets build.py turns into the office (1k versions).

  python3 shared/tools/office/fetch.py <dest>
"""
import json
import os
import sys
import urllib.request

DEST = sys.argv[1]
API = "https://api.polyhaven.com/files/"
UA = {"User-Agent": "VirtualOffice-asset-build"}

MODELS = [
    "sofa_03", "potted_plant_01", "potted_plant_02", "potted_plant_04", "modern_coffee_table_01",
    "round_wooden_table_01", "metal_office_desk", "wooden_display_shelves_01", "wall_clock",
    "fire_alarm", "vintage_microwave", "stationery_supplies",
]
TEXTURES = [
    "dirty_carpet", "laminate_floor_02", "floor_tiles_06", "ceiling_interior", "painted_plaster_wall",
    "fabric_pattern_05", "herringbone_parquet",
]
HDRI = "photo_studio_loft_hall"


def api(asset):
    with urllib.request.urlopen(urllib.request.Request(API + asset, headers=UA)) as r:
        return json.load(r)


def get(url, dest):
    if os.path.exists(dest):
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA)) as r, open(dest + ".part", "wb") as f:
        f.write(r.read())
    os.rename(dest + ".part", dest)
    print("got", dest, os.path.getsize(dest) // 1024, "K", flush=True)


for m in MODELS:
    g = api(m)["gltf"]["1k"]["gltf"]
    get(g["url"], f"{DEST}/models/{m}/{m}.gltf")
    for rel, f in g.get("include", {}).items():
        get(f["url"], f"{DEST}/models/{m}/{rel}")
for t in TEXTURES:
    files = api(t)
    for kind, names in (("diffuse", ("Diffuse", "diff", "Color", "col_01")), ("nor_gl", ("nor_gl",)), ("rough", ("Rough", "rough"))):
        key = next((n for n in names if n in files), None)
        if key is None:
            print("no", kind, "for", t, sorted(files), flush=True)
            continue
        get(files[key]["1k"]["jpg"]["url"], f"{DEST}/textures/{t}_{kind}.jpg")
get(api(HDRI)["hdri"]["1k"]["hdr"]["url"], f"{DEST}/hdri/{HDRI}_1k.hdr")
print("done")
