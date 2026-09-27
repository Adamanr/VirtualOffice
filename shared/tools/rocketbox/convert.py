"""
Converts Microsoft Rocketbox avatars (MIT, github.com/microsoft/Microsoft-Rocketbox)
into light GLB files for the web client:

  blender -b --factory-startup --python shared/tools/rocketbox/convert.py -- <src> <out>

<src> is laid out like fetch.py leaves it:
  avatars/<Name>/<Name>.fbx + *_color.tga textures
  anims/{m,f}_<clip>.max.fbx

Writes <out>/<id>.glb for every avatar in AVATARS (mesh + skeleton, textures
resized to 1024 px WebP, hair and lashes as alpha-masked) and <out>/anims_m.glb /
anims_f.glb (skeleton + one action per clip, bound by bone name at runtime).
"""

import os
import sys

import bpy
import mathutils

argv = sys.argv[sys.argv.index("--") + 1 :]
SRC, OUT = argv[0], argv[1]
os.makedirs(OUT, exist_ok=True)

# id → (Rocketbox folder name, gender)
AVATARS = {
    "bm1": ("Business_Male_01", "m"),
    "bm2": ("Business_Male_02", "m"),
    "bm3": ("Business_Male_03", "m"),
    "bm4": ("Business_Male_04", "m"),
    "bf1": ("Business_Female_01", "f"),
    "bf2": ("Business_Female_02", "f"),
    "bf3": ("Business_Female_03", "f"),
    "bf4": ("Business_Female_04", "f"),
    "am1": ("Male_Adult_01", "m"),
    "am2": ("Male_Adult_03", "m"),
    "af1": ("Female_Adult_01", "f"),
    "af2": ("Female_Adult_03", "f"),
}
CLIPS = {
    "idle": "idle_neutral_01",
    "walk": "walk_neutral",
    "run": "run_neutral",
    "sit": "sit_chair_idle_neutral_01",
    "wave": "wave_01",
    "drink": "drink_drinking",
}
TEXTURE_SIZE = 1024


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def texture_for(folder, material):
    """Material "m005_head" uses m005_head_color.tga (also *_opacity, *_glasses_opacity)."""
    for suffix in ("_color.tga", "_opacity_color.tga"):
        path = os.path.join(folder, material + suffix)
        if os.path.exists(path):
            return path
    return None


def load_image(path, size):
    img = bpy.data.images.load(path)
    if max(img.size) > size:
        img.scale(size, size)
    return img


def rebuild_material(mat, image, masked):
    """A plain Principled BSDF the glTF exporter understands (Max materials don't)."""
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.75
    bsdf.inputs["Specular IOR Level"].default_value = 0.2
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if masked:
        # alpha > 0.5 → glTF alphaMode MASK (hair, eyelashes): cheap and sorts fine.
        gt = nt.nodes.new("ShaderNodeMath")
        gt.operation = "GREATER_THAN"
        gt.inputs[1].default_value = 0.5
        nt.links.new(tex.outputs["Alpha"], gt.inputs[0])
        nt.links.new(gt.outputs[0], bsdf.inputs["Alpha"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])


def thumbnail(avatar_id):
    """A 256 px head-and-shoulders portrait for the character gallery (Cycles, CPU)."""
    scene = bpy.context.scene
    meshes = [o for o in scene.objects if o.type == "MESH"]
    top = max((o.matrix_world @ mathutils.Vector(c)).z for o in meshes for c in o.bound_box)
    cam_data = bpy.data.cameras.new("thumb")
    cam_data.lens = 85
    cam = bpy.data.objects.new("thumb", cam_data)
    scene.collection.objects.link(cam)
    # Rocketbox characters face -Y in Blender.
    target = mathutils.Vector((0, 0, top - 0.3))
    cam.location = target + mathutils.Vector((0.35, -2.2, 0.08))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    for loc, energy in (((1.5, -2.5, top + 0.5), 180), ((-2, -1.5, top), 60)):
        light = bpy.data.objects.new("light", bpy.data.lights.new("light", "POINT"))
        light.data.energy = energy
        light.location = loc
        scene.collection.objects.link(light)
    world = bpy.data.worlds.new("w")
    world.color = (0.12, 0.15, 0.2)
    scene.world = world
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 32
    scene.render.resolution_x = scene.render.resolution_y = 256
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.quality = 85
    scene.render.filepath = os.path.join(OUT, avatar_id + ".webp")
    bpy.ops.render.render(write_still=True)
    for o in list(scene.objects):
        if o.type in ("CAMERA", "LIGHT"):
            bpy.data.objects.remove(o, do_unlink=True)


def convert_avatar(avatar_id, name):
    reset()
    folder = os.path.join(SRC, "avatars", name)
    bpy.ops.import_scene.fbx(filepath=os.path.join(folder, name + ".fbx"))
    for o in list(bpy.data.objects):
        if o.type not in ("ARMATURE", "MESH"):
            bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    for mat in bpy.data.materials:
        path = texture_for(folder, mat.name)
        if path:
            rebuild_material(mat, load_image(path, TEXTURE_SIZE), masked="opacity" in os.path.basename(path))
        else:
            print(f"  no texture for material {mat.name}", flush=True)
    thumbnail(avatar_id)
    tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == "MESH" for p in o.data.polygons)
    path = os.path.join(OUT, avatar_id + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_image_format="WEBP",
        export_image_quality=82,
        export_skins=True,
        export_animations=False,
        export_morph=False,
        export_yup=True,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
    )
    print(f"AVATAR {avatar_id} {name}: {tris} tris, {os.path.getsize(path) // 1024} KB", flush=True)


def strip_channels(action):
    """Rotations only, plus the root's position (hip bob, weight shifts, sitting down):
    bone offsets and scales come from each avatar's own skeleton, so people of
    different builds share the clips without stretching."""
    curves = action.fcurves if hasattr(action, "fcurves") else [c for layer in action.layers for strip in layer.strips for bag in strip.channelbags for c in bag.fcurves]
    for fc in list(curves):
        path = fc.data_path
        # The root (the armature object itself: path "location") carries the body's
        # travel, bob and sitting height; bones keep only their rotations.
        keep = path.endswith("rotation_quaternion") or path.endswith("rotation_euler") or path == "location" or (path.endswith("location") and "Pelvis" in path)
        if not keep:
            try:
                action.fcurves.remove(fc)
            except AttributeError:
                for layer in action.layers:
                    for strip in layer.strips:
                        for bag in strip.channelbags:
                            if fc in list(bag.fcurves):
                                bag.fcurves.remove(fc)


def convert_anims(gender):
    reset()
    keep = None
    for clip, src in CLIPS.items():
        before = set(bpy.data.objects)
        acts_before = set(bpy.data.actions)
        bpy.ops.import_scene.fbx(filepath=os.path.join(SRC, "anims", f"{gender}_{src}.max.fbx"))
        new_objs = set(bpy.data.objects) - before
        arm = next(o for o in new_objs if o.type == "ARMATURE")
        action = arm.animation_data.action
        action.name = clip
        action.use_fake_user = True
        strip_channels(action)
        for a in set(bpy.data.actions) - acts_before - {action}:
            bpy.data.actions.remove(a)
        if keep is None:
            keep = arm
            new_objs.discard(arm)
        for o in new_objs:
            bpy.data.objects.remove(o, do_unlink=True)
    keep.animation_data.action = None
    path = os.path.join(OUT, f"anims_{gender}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_skins=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_frame_step=2,
        export_optimize_animation_size=True,
        export_yup=True,
    )
    print(f"ANIMS {gender}: {[a.name for a in bpy.data.actions]}, {os.path.getsize(path) // 1024} KB", flush=True)


only = set(argv[2:])
for avatar_id, (name, _gender) in AVATARS.items():
    if not only or avatar_id in only:
        convert_avatar(avatar_id, name)
for g in ("m", "f"):
    if not only or f"anims_{g}" in only:
        convert_anims(g)
