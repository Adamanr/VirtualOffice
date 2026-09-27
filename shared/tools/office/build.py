"""
Builds the office's furniture models and surface textures for the web client.

  python3 shared/tools/office/fetch.py <src>          # CC0 assets from Poly Haven
  blender -b --factory-startup --python shared/tools/office/build.py -- <src> client/public/office [only...]

Two kinds of models, all written as <out>/<name>.glb (glTF +Z = the front):
  * Poly Haven models, normalized: standing on the floor, centred, heavy ones
    decimated, textures resized to 1024 px WebP.
  * Office furniture Poly Haven doesn't have (swivel chairs, desks with
    monitors, cubicles, vending machine, copier…), modelled here from bevelled
    primitives with PBR materials. Their dimensions match the procedural level
    (client/src/scene/levelGeometry.ts), so interactive overlays still line up.

Floor / wall / ceiling textures and the environment HDRI: textures.py.
"""

import math
import os
import sys

import bmesh
import bpy
import mathutils

argv = sys.argv[sys.argv.index("--") + 1 :]
SRC, OUT = argv[0], argv[1]
ONLY = set(argv[2:])
os.makedirs(OUT, exist_ok=True)
TEX = os.path.join(SRC, "textures")


# --- scene helpers ---------------------------------------------------------------------------


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, color=(0.8, 0.8, 0.8), rough=0.6, metal=0.0, tex=None, tint=None, emission=None, alpha=None):
    """Principled material; `tex` = Poly Haven texture set name (diffuse / nor_gl / rough)."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if tex:
        img = load(f"{tex}_diffuse.jpg")
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        if tint:
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 1.0
            nt.links.new(t.outputs["Color"], mix.inputs["A"])
            mix.inputs["B"].default_value = (*tint, 1)
            nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
        else:
            nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = load(f"{tex}_nor_gl.jpg", non_color=True)
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = 0.6
        nt.links.new(n.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
        rtex = nt.nodes.new("ShaderNodeTexImage")
        rtex.image = load(f"{tex}_rough.jpg", non_color=True)
        nt.links.new(rtex.outputs["Color"], bsdf.inputs["Roughness"])
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = 1.0
    if alpha is not None:
        bsdf.inputs["Alpha"].default_value = alpha
    return m


def load(file, non_color=False):
    img = bpy.data.images.get(file) or bpy.data.images.load(os.path.join(TEX, file))
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


def box_uv(obj, tile):
    """World-scale box mapping: textures keep their size whatever the object's dimensions."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for loop in f.loops:
            co = obj.matrix_world @ loop.vert.co
            u, v = [(co.y, co.z), (co.x, co.z), (co.x, co.y)][ax]
            loop[uv].uv = (u / tile, v / tile)
    bm.to_mesh(me)
    bm.free()


def finish(obj, mat, bevel, segments, tile):
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier="bevel")
    for p in obj.data.polygons:
        p.use_smooth = bool(bevel)
    if tile:
        box_uv(obj, tile)
    return obj


def box(size, loc, mat, bevel=0.006, segments=2, tile=None, rot=(0, 0, 0)):
    """size/loc in metres, Blender axes: x right, y back (the front is -y), z up."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return finish(o, mat, bevel, segments, tile)


def cyl(r, h, loc, mat, verts=24, bevel=0.004, rot=(0, 0, 0), r2=None, tile=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, vertices=verts, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=h, location=loc, vertices=verts, rotation=rot)
    return finish(bpy.context.active_object, mat, bevel, 2, tile)


def sphere(r, loc, mat, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=16, ring_count=8)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return finish(o, mat, 0, 0, None)


def export(name, image_format="WEBP"):
    for o in bpy.context.scene.objects:
        o.select_set(o.type == "MESH")
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_image_format=image_format,
        export_image_quality=80,
        export_jpeg_quality=82,
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_animations=False,
    )
    tris = sum(len(p.vertices) - 2 for o in bpy.context.scene.objects if o.type == "MESH" for p in o.data.polygons)
    print(f"MODEL {name}: {tris} tris, {os.path.getsize(path) // 1024} KB", flush=True)


def wanted(name):
    return not ONLY or name in ONLY


# --- shared materials --------------------------------------------------------------------------

def mats():
    return {
        "black_plastic": material("black_plastic", (0.02, 0.02, 0.022), 0.45),
        "dark_plastic": material("dark_plastic", (0.06, 0.065, 0.07), 0.5),
        "grey_plastic": material("grey_plastic", (0.55, 0.56, 0.57), 0.5),
        "white_plastic": material("white_plastic", (0.85, 0.85, 0.83), 0.45),
        "steel": material("steel", (0.62, 0.63, 0.64), 0.32, 1.0),
        "chrome": material("chrome", (0.8, 0.8, 0.82), 0.15, 1.0),
        "painted_metal": material("painted_metal", (0.52, 0.53, 0.5), 0.45, 0.35),
        "screen": material("screen", (0.01, 0.012, 0.015), 0.12),
        "wood": material("wood", tex="laminate_floor_02", rough=0.5),
        "fabric": material("fabric", tex="fabric_pattern_05", tint=(0.55, 0.58, 0.63)),
        "chair_fabric": material("chair_fabric", tex="fabric_pattern_05", tint=(0.16, 0.18, 0.21)),
        "countertop": material("countertop", (0.78, 0.76, 0.72), 0.35),
        "glass": material("glass", (0.55, 0.7, 0.8), 0.05, alpha=0.35),
        "light": material("light", (1, 1, 1), 0.5, emission=(1.0, 0.98, 0.94)),
    }


# --- Poly Haven models -------------------------------------------------------------------------

POLYHAVEN = {
    # name in the client: (source asset, max triangles or None)
    "plant_tall": ("potted_plant_01", 16000),
    "plant_leafy": ("potted_plant_02", 14000),
    "succulent": ("potted_plant_04", 3000),
    "sofa": ("sofa_03", None),
    "coffee_table": ("modern_coffee_table_01", None),
    "cafe_table": ("round_wooden_table_01", None),
    "manager_desk": ("metal_office_desk", None),
    "bookshelf": ("wooden_display_shelves_01", None),
    "clock": ("wall_clock", None),
    "fire_alarm": ("fire_alarm", None),
    "microwave": ("vintage_microwave", None),
    "stationery": ("stationery_supplies", None),
}


def polyhaven(name, asset, max_tris):
    reset()
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, "models", asset, asset + ".gltf"))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in bpy.context.scene.objects:
        o.select_set(o.type == "MESH")
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    tris = sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons)
    if max_tris and tris > max_tris:
        for o in meshes:
            mod = o.modifiers.new("dec", "DECIMATE")
            mod.ratio = max_tris / tris
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier="dec")
    # Stand on the floor, centred on the origin (wall items: back against the wall).
    pts = [o.matrix_world @ mathutils.Vector(c) for o in meshes for c in o.bound_box]
    lo = mathutils.Vector([min(p[i] for p in pts) for i in range(3)])
    hi = mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
    shift = mathutils.Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    for o in meshes:
        o.location += shift
    for img in list(bpy.data.images):
        if img.size[0] > 1024:
            img.scale(1024, 1024 * img.size[1] // img.size[0])
        if img.is_float:
            to_8bit(img)
    # The exporter packs roughness into a one-channel image, which WebP can't hold.
    export(name, image_format="JPEG")


def to_8bit(img):
    """16-bit PNGs load as float buffers; the exporter wants 8-bit images."""
    w, h = img.size
    byte = bpy.data.images.new(img.name + "_8", w, h, alpha=img.alpha_mode != "NONE", float_buffer=False)
    byte.colorspace_settings.name = img.colorspace_settings.name
    byte.pixels.foreach_set(tuple(img.pixels))
    byte.pack()
    img.user_remap(byte)


# --- modelled furniture ------------------------------------------------------------------------


def office_chair(M):
    """Swivel chair; seat centre 0.46 m above the floor, back towards +y (glTF -z)."""
    box((0.48, 0.47, 0.08), (0, 0, 0.46), M["chair_fabric"], bevel=0.03, segments=4)
    box((0.46, 0.07, 0.56), (0, 0.23, 0.8), M["chair_fabric"], bevel=0.03, segments=4, rot=(math.radians(-8), 0, 0))
    box((0.3, 0.04, 0.3), (0, 0.24, 0.6), M["black_plastic"], bevel=0.01)  # back bracket
    box((0.36, 0.34, 0.04), (0, 0, 0.405), M["black_plastic"], bevel=0.01)  # seat pan
    cyl(0.028, 0.3, (0, 0, 0.24), M["chrome"])  # gas lift
    cyl(0.04, 0.12, (0, 0, 0.12), M["black_plastic"])
    for i in range(5):
        a = i * 2 * math.pi / 5
        x, y = math.sin(a) * 0.15, math.cos(a) * 0.15
        box((0.045, 0.3, 0.035), (x, y, 0.065), M["black_plastic"], bevel=0.012, rot=(0, 0, -a))
        x2, y2 = math.sin(a) * 0.29, math.cos(a) * 0.29
        cyl(0.028, 0.025, (x2, y2, 0.03), M["black_plastic"], rot=(0, math.pi / 2, -a))  # caster
    for s in (-1, 1):
        box((0.035, 0.035, 0.2), (s * 0.24, 0.02, 0.55), M["black_plastic"], bevel=0.008)
        box((0.06, 0.26, 0.03), (s * 0.24, 0.02, 0.655), M["black_plastic"], bevel=0.012)


def desk(M):
    """Workstation. Blender -y is the level's +z: the sitter is on the +y side
    (level z = -0.75) and the monitor (level z = +0.17) faces them."""
    box((1.4, 0.7, 0.035), (0, 0, 0.73), M["wood"], bevel=0.004, tile=1.2)
    for s in (-1, 1):
        box((0.04, 0.64, 0.7), (s * 0.66, 0, 0.355), M["painted_metal"], bevel=0.004)
    box((1.28, 0.02, 0.4), (0, -0.32, 0.5), M["painted_metal"], bevel=0.003)  # modesty panel, far side
    # Drawer pedestal, fronts towards the sitter
    box((0.4, 0.5, 0.56), (-0.45, -0.1, 0.29), M["painted_metal"], bevel=0.006)
    heights = (0.14, 0.14, 0.24)
    for i, h in enumerate(heights):
        z = 0.55 - sum(heights[:i]) - h / 2
        box((0.38, 0.01, h - 0.012), (-0.45, 0.151, z), M["painted_metal"], bevel=0.002)
        box((0.12, 0.02, 0.012), (-0.45, 0.162, z + h / 2 - 0.035), M["steel"], bevel=0.004)
    # Monitor: its face is at level z = +0.155, where the live screen is drawn.
    box((0.64, 0.03, 0.38), (0, -0.17, 1.02), M["black_plastic"], bevel=0.008)
    box((0.61, 0.004, 0.35), (0, -0.154, 1.02), M["screen"], bevel=0)
    box((0.05, 0.03, 0.24), (0, -0.2, 0.86), M["dark_plastic"], bevel=0.008)
    box((0.22, 0.16, 0.012), (0, -0.2, 0.753), M["dark_plastic"], bevel=0.006)
    # Keyboard, mouse, phone
    box((0.44, 0.14, 0.02), (0, 0.12, 0.758), M["dark_plastic"], bevel=0.006)
    for row in range(4):
        box((0.4, 0.024, 0.006), (0, 0.075 + row * 0.03, 0.77), M["black_plastic"], bevel=0.002)
    sphere(0.03, (0.3, 0.1, 0.755), M["dark_plastic"], scale=(0.9, 1.4, 0.45))
    box((0.2, 0.2, 0.05), (-0.48, -0.12, 0.775), M["dark_plastic"], bevel=0.012, rot=(math.radians(-10), 0, 0))
    box((0.06, 0.18, 0.035), (-0.54, -0.12, 0.81), M["black_plastic"], bevel=0.012)  # handset


def cubicle(M):
    """Fabric partitions for a 2.8 × 1.5 m pod (scaled to the level's size)."""
    w, d, H = 2.8, 1.5, 1.25
    hw = w / 2 + 0.03
    panels = [((w + 0.1, 0.05, H), (0, 0, H / 2)), ((0.05, d, H), (-hw, 0, H / 2)), ((0.05, d, H), (hw, 0, H / 2)),
              ((0.04, d / 2, H), (0, d / 4, H / 2)), ((0.04, d / 2, H), (0, -d / 4, H / 2))]
    for size, loc in panels:
        box(size, loc, M["fabric"], bevel=0.008, tile=0.3)
    box((w + 0.14, 0.07, 0.03), (0, 0, H + 0.015), M["steel"], bevel=0.008)
    for s in (-1, 1):
        box((0.07, d, 0.03), (s * hw, 0, H + 0.015), M["steel"], bevel=0.008)
        box((0.07, 0.07, H), (s * hw, 0, H / 2), M["steel"], bevel=0.008)
    notes = [(0.98, 0.93, 0.45), (0.97, 0.75, 0.82), (0.95, 0.95, 0.95), (0.7, 0.9, 0.98)]
    for i in range(6):
        x = -w * 0.4 + i * w * 0.16
        box((0.1, 0.004, 0.1), (x, (-1) ** i * 0.028, 1.0 + (i % 3) * 0.05), material(f"note{i % 4}", notes[i % 4], 0.8), bevel=0)


def filing_cabinet(M):
    box((0.5, 0.6, 1.32), (0, 0, 0.66), M["painted_metal"], bevel=0.008)
    for i in range(4):
        z = 0.17 + i * 0.32
        box((0.46, 0.012, 0.3), (0, -0.303, z + 0.07), M["painted_metal"], bevel=0.004)
        box((0.14, 0.03, 0.025), (0, -0.318, z + 0.03), M["steel"], bevel=0.008)
        box((0.08, 0.004, 0.04), (0, -0.31, z + 0.12), M["white_plastic"], bevel=0)


def trash_bin(M):
    cyl(0.15, 0.4, (0, 0, 0.2), M["dark_plastic"], r2=0.13, verts=32)
    cyl(0.135, 0.02, (0, 0, 0.395), M["black_plastic"], verts=32)


def water_cooler(M):
    box((0.34, 0.34, 1.0), (0, 0, 0.5), M["white_plastic"], bevel=0.02, segments=3)
    box((0.3, 0.3, 0.02), (0, 0, 1.01), M["grey_plastic"], bevel=0.005)
    cyl(0.14, 0.4, (0, 0, 1.24), material("bottle", (0.35, 0.6, 0.85), 0.05, alpha=0.55), verts=32)
    cyl(0.14, 0.06, (0, 0, 1.47), material("bottle", (0.35, 0.6, 0.85), 0.05, alpha=0.55), r2=0.04, verts=32)
    box((0.26, 0.06, 0.14), (0, -0.17, 0.78), M["grey_plastic"], bevel=0.01)
    box((0.04, 0.04, 0.05), (-0.06, -0.2, 0.76), material("tap_blue", (0.15, 0.3, 0.75), 0.4), bevel=0.008)
    box((0.04, 0.04, 0.05), (0.06, -0.2, 0.76), material("tap_red", (0.75, 0.15, 0.12), 0.4), bevel=0.008)
    box((0.2, 0.12, 0.02), (0, -0.2, 0.62), M["grey_plastic"], bevel=0.005)  # drip tray


def vending_machine(M):
    body = material("vending_body", (0.62, 0.08, 0.07), 0.35, 0.2)
    box((0.9, 0.8, 1.9), (0, 0, 0.95), body, bevel=0.015, segments=3)
    box((0.62, 0.02, 1.35), (-0.08, -0.395, 1.15), material("vending_back", (0.05, 0.05, 0.06), 0.6), bevel=0.004)
    snack_colors = [(0.85, 0.2, 0.2), (0.95, 0.65, 0.15), (0.2, 0.6, 0.35), (0.25, 0.45, 0.9), (0.55, 0.3, 0.75), (0.95, 0.95, 0.9)]
    for row in range(5):
        z = 0.62 + row * 0.25
        box((0.6, 0.3, 0.012), (-0.08, -0.25, z - 0.075), M["steel"], bevel=0.002)
        for col in range(4):
            c = snack_colors[(row * 3 + col * 5) % len(snack_colors)]
            box((0.1, 0.06, 0.13), (-0.32 + col * 0.15, -0.36, z), material(f"snack{(row * 3 + col * 5) % 6}", c, 0.5), bevel=0.01)
    box((0.64, 0.01, 1.37), (-0.08, -0.405, 1.15), M["glass"], bevel=0.004)
    box((0.14, 0.02, 0.4), (0.34, -0.405, 1.2), M["black_plastic"], bevel=0.006)
    for i in range(12):
        box((0.03, 0.01, 0.025), (0.31 + (i % 3) * 0.03, -0.418, 1.3 - (i // 3) * 0.04), M["steel"], bevel=0.003)
    box((0.55, 0.02, 0.14), (-0.08, -0.405, 0.26), M["black_plastic"], bevel=0.01)  # pickup flap


def copier(M):
    box((1.0, 0.7, 0.9), (0, 0, 0.45), M["white_plastic"], bevel=0.015, segments=3)
    box((0.95, 0.66, 0.06), (0, 0, 0.93), M["dark_plastic"], bevel=0.01)  # lid
    box((0.3, 0.14, 0.03), (0.3, -0.25, 0.975), M["dark_plastic"], bevel=0.008, rot=(math.radians(-12), 0, 0))
    box((0.16, 0.01, 0.07), (0.3, -0.31, 0.99), material("lcd", (0.1, 0.35, 0.25), 0.2, emission=(0.1, 0.5, 0.3)), bevel=0)
    for i in range(3):
        box((0.9, 0.012, 0.18), (0, -0.352, 0.2 + i * 0.2), M["grey_plastic"], bevel=0.004)
        box((0.2, 0.02, 0.025), (0, -0.362, 0.26 + i * 0.2), M["dark_plastic"], bevel=0.008)
    box((0.3, 0.34, 0.02), (-0.64, 0, 0.7), M["grey_plastic"], bevel=0.005)  # output tray
    box((0.26, 0.3, 0.03), (-0.64, 0, 0.725), material("paper", (0.97, 0.97, 0.95), 0.9), bevel=0)


def fridge(M):
    steel = material("fridge_steel", (0.7, 0.71, 0.72), 0.28, 0.9)
    box((0.8, 0.7, 1.9), (0, 0, 0.95), steel, bevel=0.015, segments=3)
    box((0.79, 0.01, 0.008), (0, -0.352, 1.25), M["black_plastic"], bevel=0)
    for z, h in ((1.58, 0.45), (0.8, 0.5)):
        box((0.03, 0.05, h), (0.33, -0.38, z), M["chrome"], bevel=0.01)
    notes = [(0.98, 0.93, 0.45), (0.97, 0.75, 0.82), (0.7, 0.9, 0.98)]
    for i, (x, z) in enumerate(((-0.2, 1.6), (0.05, 1.45), (-0.1, 1.75))):
        box((0.09, 0.004, 0.09), (x, -0.353, z), material(f"note{i}", notes[i], 0.8), bevel=0)


def coffee_machine(M):
    box((0.3, 0.3, 0.4), (0, 0, 0.2), M["black_plastic"], bevel=0.02, segments=3)
    box((0.26, 0.12, 0.06), (0, -0.09, 0.03), M["steel"], bevel=0.01)  # drip tray
    cyl(0.07, 0.14, (0, -0.1, 0.13), M["glass"], verts=24)  # carafe
    box((0.18, 0.012, 0.05), (0, -0.155, 0.34), material("lcd", (0.1, 0.35, 0.25), 0.2, emission=(0.1, 0.5, 0.3)), bevel=0)


def meeting_table(M):
    w, d = 3.6, 1.4
    box((w, d, 0.05), (0, 0, 0.745), M["wood"], bevel=0.02, segments=3, tile=1.5)
    for s in (-1, 1):
        box((0.12, d * 0.5, 0.7), (s * w / 3, 0, 0.36), M["painted_metal"], bevel=0.01)
        box((0.5, d * 0.6, 0.03), (s * w / 3, 0, 0.015), M["painted_metal"], bevel=0.01)


def counter(M):
    w, d = 3.0, 0.65
    box((w, d, 0.86), (0, 0, 0.43), M["white_plastic"], bevel=0.006)
    box((w + 0.04, d + 0.04, 0.05), (0, 0, 0.9), M["countertop"], bevel=0.008)
    n = int(w / 0.6)
    for i in range(n):
        x = -w / 2 + (i + 0.5) * w / n
        box((w / n - 0.01, 0.01, 0.8), (x, -d / 2 - 0.004, 0.44), M["white_plastic"], bevel=0.004)
        box((0.012, 0.02, 0.14), (x + (w / n) * 0.35, -d / 2 - 0.02, 0.7), M["steel"], bevel=0.005)


def reception_desk(M):
    w, d = 2.4, 1.0
    box((w, 0.06, 1.1), (0, -d / 2 + 0.03, 0.55), M["wood"], bevel=0.008, tile=1.2)
    box((w + 0.05, 0.3, 0.04), (0, -d / 2 + 0.1, 1.12), M["countertop"], bevel=0.01)
    box((w - 0.1, d - 0.1, 0.04), (0, 0.05, 0.74), M["wood"], bevel=0.005, tile=1.2)
    for s in (-1, 1):
        box((0.04, d, 1.1), (s * (w / 2 - 0.02), 0, 0.55), M["wood"], bevel=0.005, tile=1.2)
    box((0.55, 0.03, 0.33), (0.4, -0.05, 1.0), M["black_plastic"], bevel=0.008)
    box((0.52, 0.004, 0.3), (0.4, -0.034, 1.0), M["screen"], bevel=0)  # faces the receptionist
    cyl(0.08, 0.13, (-0.25, -d / 2 + 0.1, 1.2), M["glass"])  # jelly-bean jar
    cyl(0.065, 0.07, (-0.25, -d / 2 + 0.1, 1.17), material("beans", (0.85, 0.25, 0.3), 0.4))


def ceiling_light(M):
    """A 1.2 × 0.6 m troffer, hanging from 0 down; the glowing face points down."""
    box((1.2, 0.6, 0.04), (0, 0, -0.02), M["white_plastic"], bevel=0.004)
    box((1.12, 0.52, 0.01), (0, 0, -0.045), M["light"], bevel=0)


MODELLED = {
    "office_chair": office_chair,
    "desk": desk,
    "cubicle": cubicle,
    "filing_cabinet": filing_cabinet,
    "trash_bin": trash_bin,
    "water_cooler": water_cooler,
    "vending_machine": vending_machine,
    "copier": copier,
    "fridge": fridge,
    "coffee_machine": coffee_machine,
    "meeting_table": meeting_table,
    "counter": counter,
    "reception_desk": reception_desk,
    "ceiling_light": ceiling_light,
}


def modelled(name, build):
    reset()
    build(mats())
    export(name)


for name, (asset, max_tris) in POLYHAVEN.items():
    if wanted(name):
        polyhaven(name, asset, max_tris)
for name, build in MODELLED.items():
    if wanted(name):
        modelled(name, build)
