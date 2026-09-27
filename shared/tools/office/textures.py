"""Floor / wall / ceiling textures (1024 px WebP, roughness at 512) and the HDRI for the client.

  python3 shared/tools/office/textures.py <src> client/public/office
"""
import os
import shutil
import sys

from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
SURFACES = {
    "carpet": "dirty_carpet",
    "wood": "herringbone_parquet",
    "tiles": "floor_tiles_06",
    "wall": "painted_plaster_wall",
    "ceiling": "ceiling_interior",
}
os.makedirs(os.path.join(OUT, "tex"), exist_ok=True)
for name, src in SURFACES.items():
    for kind, size in (("diffuse", 1024), ("nor_gl", 1024), ("rough", 512)):
        im = Image.open(os.path.join(SRC, "textures", f"{src}_{kind}.jpg")).convert("RGB")
        if kind == "rough":
            im = im.convert("L")
        im = im.resize((size, size), Image.LANCZOS)
        path = os.path.join(OUT, "tex", f"{name}_{kind}.webp")
        im.save(path, "WEBP", quality=82)
        print("TEXTURE", path, os.path.getsize(path) // 1024, "KB")
hdri = next(f for f in os.listdir(os.path.join(SRC, "hdri")) if f.endswith(".hdr"))
shutil.copy(os.path.join(SRC, "hdri", hdri), os.path.join(OUT, "env.hdr"))
print("HDRI", hdri)
