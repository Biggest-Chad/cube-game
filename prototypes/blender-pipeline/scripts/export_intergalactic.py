"""
Convert 3DHaupt Intergalactic Spaceship (CC-BY-NC) to a game GLB.

Three.js / interceptor convention: Y-up, -Z forward (nose), +Z aft.
Blender file is Z-up; after apply, -Y is nose. We spin 180° around Z so
+Y is nose, then glTF Y-up maps that to -Z.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

argv = sys.argv
argv = argv[argv.index("--") + 1 :] if "--" in argv else []


def arg(name, default=None):
    if name in argv:
        i = argv.index(name)
        return argv[i + 1] if i + 1 < len(argv) else default
    return default


BLEND = Path(
    arg(
        "--blend",
        r"C:\Users\ChadKnapman\Downloads\62-intergalactic-spaceship_blender_2.79b_cycles_packed-textures\Intergalactic Spaceship_Blender_2.79b_Cycles_Packed textures.blend",
    )
)
OUT_DIR = Path(arg("--out", r"C:\Users\ChadKnapman\Projects\the cube\public\ships"))
OUT_GLB = OUT_DIR / "intergalactic.glb"
MOUNTS_JSON = OUT_DIR / "intergalactic-mounts.json"

# Longest span is wingspan (~9.55). 0.40 → ~3.8 wide, ~2.3 long — readable, not a city block.
TARGET_SCALE = float(arg("--scale", "0.40"))
MAX_TEX = 1024


def log(msg: str) -> None:
    print(f"[intergalactic] {msg}", flush=True)


def enable_gltf():
    try:
        import addon_utils

        addon_utils.enable("io_scene_gltf2", default_set=True)
    except Exception as e:
        log(f"gltf addon: {e}")


def wbbox(obj):
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for c in obj.bound_box:
        w = obj.matrix_world @ Vector(c)
        for i in range(3):
            mins[i] = min(mins[i], w[i])
            maxs[i] = max(maxs[i], w[i])
    return mins, maxs


def select_only(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]


def apply_all(obj):
    select_only([obj])
    try:
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    except Exception as e:
        log(f"apply failed {obj.name}: {e}")


def make_emissive(name, color, strength=4.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs[0].default_value = (*color, 1)
    em.inputs[1].default_value = strength
    nt.links.new(em.outputs[0], out.inputs[0])
    mat.blend_method = "BLEND"
    if hasattr(mat, "shadow_method"):
        mat.shadow_method = "NONE"
    return mat


def add_cyl(name, radius, depth, loc, rot_x, mat):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=12, radius=radius, depth=depth, location=loc, rotation=(rot_x, 0, 0)
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def resize_images(max_px: int):
    for img in bpy.data.images:
        if not img.size or img.size[0] == 0:
            continue
        w, h = int(img.size[0]), int(img.size[1])
        if w <= max_px and h <= max_px:
            log(f"tex keep {img.name} {w}x{h}")
            continue
        scale = max_px / max(w, h)
        nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
        try:
            img.scale(nw, nh)
            log(f"tex resize {img.name} {w}x{h} -> {nw}x{nh}")
        except Exception as e:
            log(f"tex resize fail {img.name}: {e}")


def main():
    log(f"open {BLEND}")
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    enable_gltf()

    # Drop render-only clutter. Circles are 5u engine beams — too long for orbit cam.
    keep_mesh = {"Ship"}
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and obj.name not in keep_mesh:
            log(f"remove {obj.name}")
            bpy.data.objects.remove(obj, do_unlink=True)
        elif obj.type in {"LIGHT", "CAMERA", "EMPTY"}:
            bpy.data.objects.remove(obj, do_unlink=True)

    ship = bpy.data.objects.get("Ship")
    if not ship:
        raise RuntimeError("Ship mesh missing")

    # Kill the 802-frame fly-by and any leftover NLA.
    if ship.animation_data:
        ship.animation_data_clear()
    for obj in list(bpy.data.objects):
        if obj.name.startswith("Torus") and obj.animation_data:
            # Keep a short loop if present; NLA-ize later.
            pass

    # Unparent so apply uses world matrix (includes the 0.01 + 90° baked into Ship).
    for obj in list(bpy.data.objects):
        if obj.parent:
            mw = obj.matrix_world.copy()
            obj.parent = None
            obj.matrix_world = mw

    apply_all(ship)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    for obj in meshes:
        if obj != ship:
            apply_all(obj)

    # Nose is -Y. Spin 180° around world Z so nose is +Y (glTF Y-up → -Z).
    rot_z = Matrix.Rotation(math.pi, 4, "Z")
    for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
        obj.matrix_world = rot_z @ obj.matrix_world
        apply_all(obj)

    hull = bpy.data.objects["Ship"]
    hull.name = "Hull"
    mn, mx = wbbox(hull)
    ctr = (mn + mx) * 0.5
    for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
        obj.location -= ctr
        apply_all(obj)
    for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
        obj.scale = (TARGET_SCALE, TARGET_SCALE, TARGET_SCALE)
        apply_all(obj)

    mn, mx = wbbox(hull)
    log(f"scaled BB {tuple(round(v, 3) for v in mn)} .. {tuple(round(v, 3) for v in mx)}")
    log(f"size {(mx - mn)[:]}")

    # Blender after this: +Y nose, +Z up, +X right (after 180, original left is +X —
    # ship is symmetric). glTF: -Z nose, +Y up, +X right.
    nose_y = mx.y
    aft_y = mn.y
    span_x = max(abs(mn.x), abs(mx.x))
    belly_z = mn.z + (mx.z - mn.z) * 0.28

    # Three.js local (after Y-up export): x=x, y=z, z=-y
    def t(x, y, z):
        return (round(x, 4), round(z, 4), round(-y, 4))

    mounts = {
        "Muzzle": t(0.0, nose_y + 0.04, belly_z + 0.08),
        "HP_0": t(span_x * 0.55, (nose_y + aft_y) * 0.15, belly_z),
        "HP_1": t(-span_x * 0.55, (nose_y + aft_y) * 0.15, belly_z),
        "HP_2": t(0.0, (nose_y + aft_y) * 0.35, mn.z + 0.04),
        "Thruster_0": t(span_x * 0.22, aft_y + 0.06, 0.04),
        "Thruster_1": t(-span_x * 0.22, aft_y + 0.06, 0.04),
        "Thruster_2": t(0.0, aft_y + 0.02, 0.02),
        "Head_L": t(-0.12, nose_y - 0.18, 0.02),
        "Head_R": t(0.12, nose_y - 0.18, 0.02),
    }
    log(f"mounts {mounts}")

    glow = make_emissive("EngineGlowMat", (1.0, 0.28, 0.72), 6.0)
    plume = make_emissive("PlumeMat", (0.35, 0.85, 1.0), 3.5)
    # Engine sockets in Blender (+Y nose): aft is -Y
    eng_y = aft_y + 0.08
    add_cyl("EngineGlow_L", 0.07, 0.16, (-span_x * 0.22, eng_y, 0.04), math.pi / 2, glow)
    add_cyl("EngineGlow_R", 0.07, 0.16, (span_x * 0.22, eng_y, 0.04), math.pi / 2, glow)
    add_cyl("Plume_L", 0.09, 0.34, (-span_x * 0.22, eng_y - 0.18, 0.04), math.pi / 2, plume)
    add_cyl("Plume_R", 0.09, 0.34, (span_x * 0.22, eng_y - 0.18, 0.04), math.pi / 2, plume)
    add_cyl("Plume_C", 0.07, 0.28, (0.0, aft_y - 0.12, 0.02), math.pi / 2, plume)
    add_cyl("Nozzle_L", 0.05, 0.08, (-span_x * 0.22, aft_y + 0.02, 0.04), math.pi / 2, glow)
    add_cyl("Nozzle_R", 0.05, 0.08, (span_x * 0.22, aft_y + 0.02, 0.04), math.pi / 2, glow)

    root = bpy.data.objects.new("Intergalactic", None)
    root.empty_display_type = "PLAIN_AXES"
    bpy.context.scene.collection.objects.link(root)
    for obj in list(bpy.data.objects):
        if obj != root and obj.parent is None:
            obj.parent = root

    # Mount empties (Blender +Y forward) — not exported as mesh; written to JSON for TS.
    for name, (tx, ty, tz) in mounts.items():
        # inverse of t(): blender (x, y, z_up) from three (x, y_up, z_fwd)
        # t(x,y,z)=(x, z, -y) so three (X,Y,Z) → blender (X, -Z, Y)
        bx, by, bz = tx, -tz, ty
        e = bpy.data.objects.new(name, None)
        e.empty_display_type = "PLAIN_AXES"
        e.empty_display_size = 0.08
        e.location = (bx, by, bz)
        bpy.context.scene.collection.objects.link(e)
        e.parent = root

    resize_images(MAX_TEX)

    # Principled: keep maps, mute env later in Three. Make sure color tex is sRGB.
    hull_mat = None
    if hull.data.materials:
        hull_mat = hull.data.materials[0]
    if hull_mat and hull_mat.use_nodes:
        for n in hull_mat.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image:
                # color/emi stay sRGB; metal/rough/normal non-color
                nm = n.image.name.lower()
                if any(k in nm for k in ("metal", "rough", "nmap", "normal", "ao")):
                    n.image.colorspace_settings.name = "Non-Color"

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # Hide empties from export
    for obj in bpy.data.objects:
        if obj.type == "EMPTY" and obj.name != "Intergalactic":
            obj.hide_set(True)
            obj.hide_render = True

    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB),
        export_format="GLB",
        use_visible=True,
        export_apply=True,
        export_cameras=False,
        export_extras=True,
        export_yup=True,
        export_lights=False,
        export_materials="EXPORT",
        export_animations=False,
        export_skins=False,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_image_format="JPEG",
        export_jpeg_quality=82,
    )
    MOUNTS_JSON.write_text(json.dumps(mounts, indent=2), encoding="utf-8")
    log(f"wrote {OUT_GLB} ({OUT_GLB.stat().st_size} bytes)")
    log(f"wrote {MOUNTS_JSON}")


if __name__ == "__main__":
    main()
