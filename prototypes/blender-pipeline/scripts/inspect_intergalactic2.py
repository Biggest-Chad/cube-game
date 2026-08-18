import bpy
from mathutils import Vector

bpy.context.view_layer.update()

def wbbox(obj):
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for c in obj.bound_box:
        w = obj.matrix_world @ Vector(c)
        for i in range(3):
            mins[i] = min(mins[i], w[i])
            maxs[i] = max(maxs[i], w[i])
    return mins, maxs

for name in ("Ship", "Circle", "Circle.001", "Torus.000", "Torus.004"):
    obj = bpy.data.objects.get(name)
    if not obj:
        continue
    mn, mx = wbbox(obj)
    ctr = (mn + mx) * 0.5
    print(name, "worldBB", tuple(round(v, 4) for v in mn), tuple(round(v, 4) for v in mx))
    print("   size", tuple(round(mx[i] - mn[i], 4) for i in range(3)), "center", tuple(round(c, 4) for c in ctr))
    print("   world_loc", tuple(round(c, 4) for c in obj.matrix_world.translation))

ship = bpy.data.objects["Ship"]
print("Ship matrix_world")
print(ship.matrix_world)
print("shape_keys", ship.data.shape_keys)
if ship.data.shape_keys:
    print("key_blocks", [k.name for k in ship.data.shape_keys.key_blocks])

print("=== actions detail ===")
for a in bpy.data.actions:
    print(a.name, "fcurves", len(a.fcurves), "range", tuple(a.frame_range), "users", a.users)
    for fc in a.fcurves[:4]:
        print("   ", fc.data_path, fc.array_index)

# which objects use which actions
for obj in bpy.data.objects:
    ad = obj.animation_data
    if ad and ad.action:
        print("OBJ_ACTION", obj.name, ad.action.name)
    if obj.data and hasattr(obj.data, "shape_keys") and obj.data.shape_keys and obj.data.shape_keys.animation_data:
        skad = obj.data.shape_keys.animation_data
        if skad and skad.action:
            print("SHAPE_ACTION", obj.name, skad.action.name)

# material nodes
for mat in bpy.data.materials:
    print("MAT", mat.name, "nodes", bool(mat.use_nodes))
    if mat.use_nodes:
        for n in mat.node_tree.nodes:
            print("   node", n.type, n.name)
