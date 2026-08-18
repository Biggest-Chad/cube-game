"""Dump objects, armatures, actions, bounds, and triangle counts from the packed blend."""
import bpy
from mathutils import Vector

print("=== BLENDER", bpy.app.version_string, "===")
print("objects", len(bpy.data.objects), "meshes", len(bpy.data.meshes), "armatures", len(bpy.data.armatures))
print("actions", [a.name for a in bpy.data.actions])
print("materials", [m.name for m in bpy.data.materials])
print("images", [(i.name, getattr(i, "size", None), i.packed_file is not None) for i in bpy.data.images])

total_tris = 0
for obj in bpy.data.objects:
    loc = tuple(round(c, 3) for c in obj.location)
    sc = tuple(round(c, 3) for c in obj.scale)
    extra = ""
    if obj.type == "MESH" and obj.data:
        me = obj.data
        # ensure we have a tri estimate
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        verts = len(me.vertices)
        total_tris += tris
        extra = f" verts={verts} tris={tris} mats={[s.material.name if s.material else None for s in obj.material_slots]}"
        # local bbox
        if me.vertices:
            xs = [v.co.x for v in me.vertices]
            ys = [v.co.y for v in me.vertices]
            zs = [v.co.z for v in me.vertices]
            extra += f" localBB=({min(xs):.2f},{min(ys):.2f},{min(zs):.2f})-({max(xs):.2f},{max(ys):.2f},{max(zs):.2f})"
    elif obj.type == "ARMATURE":
        extra = f" bones={len(obj.data.bones)} pose={obj.pose is not None}"
        extra += " boneNames=" + ",".join(b.name for b in obj.data.bones[:40])
    elif obj.type == "EMPTY":
        extra = f" empty={obj.empty_display_type}"
    print(f"  [{obj.type}] {obj.name} loc={loc} scale={sc} parent={obj.parent.name if obj.parent else None}{extra}")

print("TOTAL_TRIS", total_tris)

# world bbox of mesh objects
mins = Vector((1e9, 1e9, 1e9))
maxs = Vector((-1e9, -1e9, -1e9))
for obj in bpy.data.objects:
    if obj.type != "MESH":
        continue
    for c in obj.bound_box:
        w = obj.matrix_world @ Vector(c)
        mins.x = min(mins.x, w.x)
        mins.y = min(mins.y, w.y)
        mins.z = min(mins.z, w.z)
        maxs.x = max(maxs.x, w.x)
        maxs.y = max(maxs.y, w.y)
        maxs.z = max(maxs.z, w.z)
print("WORLD_BB", tuple(round(c, 3) for c in mins), tuple(round(c, 3) for c in maxs))
print("WORLD_SIZE", tuple(round(maxs[i] - mins[i], 3) for i in range(3)))
print("WORLD_CENTER", tuple(round((mins[i] + maxs[i]) * 0.5, 3) for i in range(3)))
