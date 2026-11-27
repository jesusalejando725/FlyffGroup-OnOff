"""Convert the six Mobilee designs with Blender bpy 5.0.1, NumPy and Pillow.

Run from the game repository: python tools/mobilee/build.py /path/to/extracted/Personajes
Source: Mobilee 982b6e7ff1e0eb18a75b6e0b7c586bed2968f3c5, Personajes.zip.
"""
import argparse
import copy
import io
import json
import math
from pathlib import Path
import struct

import bpy
import numpy as np
from mathutils import Vector
from PIL import Image

CATALOG = json.loads(Path("src/data/heroAppearances.json").read_text())
OUT = Path("public/mugroup/personajes/mobilee")
SOURCES = (
    "1./Sylvanas.FBX", "2./Fantasy Witch Girl.blend", "3./raphtalia.fbx",
    "4./albedo.fbx", "5./kirito.fbx", "6./Model_Rig.blend1",
)

SOURCE_INDEX = {"hechicera": 1}


class Glb:
    def __init__(self, path, keep_base=False):
        raw = path.read_bytes()
        size = struct.unpack_from("<I", raw, 12)[0]
        doc = json.loads(raw[20:20 + size])
        src_bin = raw[28 + size:]
        self.doc = doc
        self.buffer = bytearray(src_bin) if keep_base else bytearray()
        self.images = {}
        if keep_base:
            for node in doc["nodes"]:
                if "children" in node:
                    node["children"] = [i for i in node["children"] if not doc["nodes"][i]["name"].startswith(("equip_weapon_", "equip_helmet_"))]
            return
        accessors = doc["accessors"]
        views = doc["bufferViews"]
        doc["accessors"] = []
        doc["bufferViews"] = []
        mapping = {}

        def transfer(idx):
            if idx not in mapping:
                a = copy.deepcopy(accessors[idx])
                v = views[a["bufferView"]]
                off = v.get("byteOffset", 0)
                a["bufferView"] = self.blob(src_bin[off:off + v["byteLength"]], v.get("target"))
                mapping[idx] = len(doc["accessors"])
                doc["accessors"].append(a)
            return mapping[idx]

        for skin in doc["skins"]:
            skin["inverseBindMatrices"] = transfer(skin["inverseBindMatrices"])
        for anim in doc["animations"]:
            for sampler in anim["samplers"]:
                for key in ["input", "output"]:
                    sampler[key] = transfer(sampler[key])
        # All visual mesh nodes follow the gameplay rig and its sockets.
        first_mesh = next(i for i, node in enumerate(doc["nodes"]) if "mesh" in node)
        doc["nodes"] = doc["nodes"][:first_mesh]
        for node in doc["nodes"]:
            if "children" in node:
                node["children"] = [i for i in node["children"] if i < first_mesh]
        for key in ("materials", "textures", "images", "meshes"):
            doc[key] = []

    def blob(self, data, target=None):
        self.buffer.extend(bytes(-len(self.buffer) % 4))
        view = {"buffer": 0, "byteOffset": len(self.buffer), "byteLength": len(data)}
        if target:
            view["target"] = target
        out = len(self.doc["bufferViews"])
        self.doc["bufferViews"].append(view)
        self.buffer.extend(data)
        return out

    def array(self, data, kind, component=5126, target=34962, bounds=False):
        dtype = {5126: "<f4", 5123: "<u2", 5125: "<u4"}[component]
        data = np.asarray(data, dtype=dtype)
        index = len(self.doc["accessors"])
        entry = dict(bufferView=self.blob(data.tobytes(), target), componentType=component, count=len(data), type=kind)
        if bounds:
            entry.update(min=np.min(data, axis=0).tolist(), max=np.max(data, axis=0).tolist())
        self.doc["accessors"].append(entry)
        return index

    def joints(self):
        accessor = self.doc["accessors"][self.doc["skins"][0]["inverseBindMatrices"]]
        view = self.doc["bufferViews"][accessor["bufferView"]]
        data = np.frombuffer(self.buffer, "<f4", accessor["count"] * 16, view["byteOffset"]).copy()
        bind = np.linalg.inv(data.reshape(-1, 4, 4).transpose(0, 2, 1))
        return bind[:, :3, 3]

    def material(self, name, color, metallic, roughness, file=None, tint=(1, 1, 1), emissive=None):
        props = dict(baseColorFactor=[*color, 1], metallicFactor=metallic, roughnessFactor=roughness)
        mat = dict(name=name, pbrMetallicRoughness=props, doubleSided=True)
        if file:
            key = (file, tint)
            if key not in self.images:
                im = Image.open(file).convert("RGBA")
                im.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
                pixels = np.asarray(im).copy()
                pixels[..., :3] = np.minimum(pixels[..., :3] * tint, 255).astype(np.uint8)
                im = Image.fromarray(pixels)
                alpha = im.getextrema()[3][0] < 250
                out = io.BytesIO()
                if alpha:
                    im.save(out, format="PNG", optimize=True)
                else:
                    im.convert("RGB").save(out, format="JPEG", quality=88, optimize=True)
                image_id = len(self.doc["images"])
                self.doc["images"].append(dict(bufferView=self.blob(out.getvalue()), mimeType="image/png" if alpha else "image/jpeg"))
                texture_id = len(self.doc["textures"])
                self.doc["textures"].append(dict(source=image_id))
                self.images[key] = texture_id, alpha
            texture_id, alpha = self.images[key]
            props["baseColorTexture"] = {"index": texture_id}
            if alpha:
                mat.update(alphaMode="MASK", alphaCutoff=.44)
        if emissive:
            mat["emissiveFactor"] = emissive
        idx = len(self.doc["materials"])
        self.doc["materials"].append(mat)
        return idx

    def attach(self, name, parts):
        mesh = len(self.doc["meshes"])
        self.doc["meshes"].append(dict(name=name, primitives=parts))
        self.doc["nodes"][0].setdefault("children", []).append(len(self.doc["nodes"]))
        self.doc["nodes"].append(dict(name=name, mesh=mesh, skin=0))

    def write(self, file, name, sex):
        self.doc["asset"]["generator"] = "CodeRabbit / Mobilee appearance converter"
        self.doc["nodes"][0]["name"] = file.stem
        self.doc["extras"] = dict(
            sourceRepository="https://github.com/angelicamarin313555/Mobilee",
            sourceRevision="982b6e7ff1e0eb18a75b6e0b7c586bed2968f3c5",
            name=name, sex=sex, adaptation="optimized meshes retargeted to MuGro-up's 30 joint avatar rig",
        )
        self.buffer.extend(bytes(-len(self.buffer) % 4))
        self.doc["buffers"] = [{"byteLength": len(self.buffer)}]
        data = json.dumps(self.doc, separators=(",", ":")).encode()
        data += b" " * (-len(data) % 4)
        file.write_bytes(struct.pack("<4sIIII", b"glTF", 2, 28 + len(data) + len(self.buffer), len(data), 0x4e4f534a)
                         + data + struct.pack("<II", len(self.buffer), 0x004e4942) + self.buffer)


def open_model(path, index):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if ".blend" in path.suffix:
        bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False, use_scripts=False)
    else:
        bpy.ops.import_scene.fbx(filepath=str(path))
    if index == 0:
        return [bpy.data.objects["sylvanas.001"]]
    if index == 5:
        return [bpy.data.objects["Tex.002"]]
    return [o for o in bpy.context.scene.objects if o.type == "MESH" and len(o.data.polygons)]


def raw_coords(obj, index):
    if index == 0:
        # The first mesh contains the original neutral geometry; its FBX
        # scene nodes are animated demo copies with large offsets.
        return np.array([(v.co.z, -v.co.x, v.co.y) for v in obj.data.vertices], dtype=np.float32)
    coordinates = np.array([obj.matrix_world @ v.co for v in obj.data.vertices], dtype=np.float32)
    if index in (3, 4):
        coordinates[:, :2] *= -1  # These FBX sources face +Y.
    return coordinates


def smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def normalize(coords, lo, hi, markers, joints, sex, index, name):
    x, depth, y = ((coords - [markers[0], markers[1], lo[2]]) / (hi[2] - lo[2])).T
    side = np.sign(x)
    # Blend widths by height: distinct shoulders, waist, hips and head,
    # while keeping the original vertex layout and UVs.
    broad = np.interp(y, [0, .44, .61, .76, .9, 1.12], [1.06, .94, 1.05, 1.16, 1.04, 1.06])
    if sex == "female":
        broad = np.interp(y, [0, .44, .61, .76, .9, 1.12], [.97, 1.02, .91, .95, 1.03, 1.02])
    # Bring neutral legs and the torso to the target rig's matching landmarks.
    hip_y, shoulder_y, neck_y = markers[2:5]
    top = 1.60 if sex == "male" else 1.54
    mapped_y = np.interp(y, [0, hip_y * .54, hip_y, shoulder_y, neck_y, 1.08],
                        [0, joints[25, 1], joints[1, 1], joints[11, 1], joints[5, 1], top + .12])
    mapped_y += np.maximum(y - 1.08, 0) * top
    scale = 1.49
    mapped_x = x * broad * scale
    mapped_z = -depth * scale
    # Legs are brought into the game rig's open stance; coats between them stay on the pelvis.
    leg = (y < hip_y * 1.01) & (np.abs(x) > .012)
    if any(part in name for part in ("rambut", "ekor", "kepala", "tanduk")) or (index == 3 and name in ("badan", "kaki")) or (index == 4 and name == "baju"):
        leg[:] = False  # The unbroken skirt or coat should not split into two legs.
    feet = np.interp(y, [0, hip_y * .212, hip_y * .55, hip_y], [.224, .218, .144, .085])
    src_feet = np.interp(y, [0, hip_y * .5, hip_y], [markers[10], markers[10] * .82, .07])
    mapped_x += side * (feet - src_feet * scale) * leg * smoothstep(np.abs(x) / .035)
    ax, ay, ex, ey, wx, wy = markers[5:10] + [markers[11]]
    # Locate each arm along the source shoulder-elbow-wrist polyline.
    pos = np.stack([np.abs(x), y], axis=-1)
    source = [np.array([ax, ay]), np.array([ex, ey]), np.array([wx, wy])]
    d1, d2 = source[1] - source[0], source[2] - source[1]
    def project(a, d, cap):
        t = np.clip(((pos - a) @ d) / np.dot(d, d), 0, cap)
        closest = a + t[:, None] * d
        return t, closest, np.linalg.norm(pos - closest, axis=1)
    t1, c1, gap1 = project(source[0], d1, 1)
    t2, c2, gap2 = project(source[1], d2, 1.31)
    first = gap1 <= gap2
    t = np.where(first, t1, t2)
    fraction = np.where(first, t1, 1 + t2)
    gap = np.minimum(gap1, gap2)
    arm = smoothstep((np.abs(x) - ax * .72) / max(.043, (ex - ax) * .45)) * (1 - smoothstep((gap - .050) / .088))
    arm *= smoothstep((neck_y + .035 - y) / .053) * smoothstep((y - min(wy, ey) + .095) / .065)
    if any(part in name.lower() for part in ("kepala", "mata", "rambut", "tanduk", "ekor", "sepatu", "celana", "kaki")):
        arm[:] = 0
    if index == 4 and name == "baju":
        arm *= smoothstep((y - .58) / .12)
    if "tangan" in name.lower():
        arm[:] = 1
    shoulder = joints[11, :2]
    elbow = joints[12, :2]
    hand = joints[13, :2]
    target = np.where(first[:, None], shoulder + t[:, None] * (elbow - shoulder), elbow + t[:, None] * (hand - elbow))
    delta = (pos - np.where(first[:, None], c1, c2)) * scale
    # Rotate the cross section along with the limb instead of squashing it.
    target_angle = math.atan2(*(elbow - shoulder)[::-1])
    angles = target_angle - np.where(first, math.atan2(*d1[::-1]), math.atan2(*d2[::-1]))
    a, b = np.cos(angles), np.sin(angles)
    target += np.stack([delta[:, 0] * a - delta[:, 1] * b, delta[:, 0] * b + delta[:, 1] * a], axis=-1)
    mapped_x = (1 - arm) * mapped_x + arm * side * target[:, 0]
    mapped_y = (1 - arm) * mapped_y + arm * target[:, 1]
    mapped_z = (1 - arm) * mapped_z + arm * mapped_z * .6
    if sex == "male" and index in (2, 3) and name == "rambut":
        # Keep the ears and horns at their original positions, shorten
        # the hanging hair below the shoulders for the alternate style.
        drop = np.maximum(0, 1.21 - mapped_y)
        mapped_y += drop * (.54 if index == 2 else .73)
    if index == 4 and name == "baju":
        # Open the long coat away from the legs as the silhouette widens
        # towards its hem. The torso and the sleeves stay at their fit.
        hem = 1 - smoothstep((y - .11) / .42)
        mapped_x *= 1 + .30 * hem
        mapped_z -= .043 * hem
    return np.stack([mapped_x, mapped_y, mapped_z], axis=-1), arm, fraction


def skin_weights(p, arm, fraction, name, cloth=False):
    values = np.zeros((len(p), 30), dtype=np.float32)
    def add_interp(h, factors, nodes, strength):
        for j, (l, k) in enumerate(zip(h, h[1:])):
            t = (factors >= l) & (factors < k) if j < len(h) - 2 else factors >= l
            mix = np.clip((factors - l) / (k - l), 0, 1)
            values[:, nodes[j]] += (1 - mix) * t * strength
            values[:, nodes[j + 1]] += mix * t * strength
        values[:, nodes[0]] += (factors < h[0]) * strength

    y = p[:, 1]
    leg = (1 - smoothstep((y - .52) / .29)) * smoothstep((np.abs(p[:, 0]) - .02) / .08) * (1 - arm)
    if cloth:
        leg[:] = 0
    elif name == "celana":
        leg = 1 - smoothstep((y - .52) / .25)
    elif name == "sepatu":
        leg[:] = 1
    add_interp([.61, .79, .93, 1.08, 1.19, 1.29], y, [1, 2, 3, 4, 5, 6], np.maximum(0, 1 - leg - arm))
    for left in (True, False):
        region = (p[:, 0] >= 0) == left
        add_interp([.08, .34, .65], y, [26, 25, 24] if left else [29, 28, 27], leg * region)
        add_interp([.12, .83, 1.74], fraction, [11, 12, 13] if left else [15, 16, 17], arm * region)
    if "rambut" in name.lower():
        # Long hair moves with the head rather than being pulled by a wrist.
        values[:] = 0
        values[:, 6] = 1
    if "ekor" in name.lower() or name == "kaki":
        values[:] = 0
        values[:, 1] = 1
    idx = np.argsort(values, axis=1)[:, -4:][:, ::-1]
    weights = np.take_along_axis(values, idx, axis=1)
    weights /= np.maximum(weights.sum(axis=1, keepdims=True), 1e-8)
    return idx, weights


def transfer_guard_rig(obj, coordinates, lo, hi, joints, sex):
    # Keep the mesh's hand-painted deformation groups, replacing the original
    # Rigify controller skeleton with the equivalent game joints.
    rig = bpy.data.objects["rig"]
    values = np.zeros((len(coordinates), 30), dtype=np.float32)
    height = hi[2] - lo[2]
    scale = 1.47 / height
    facing = np.array([1, 1, -1])
    def canonical(point):
        return (np.asarray(point)[[0, 2, 1]] - [0, lo[2], .02]) * facing * scale
    mapping = {"spine": 1, "spine.001": 2, "spine.002": 3, "spine.003": 4,
               "spine.004": 5, "spine.005": 5, "spine.006": 6}
    anchors = {i: canonical(rig.matrix_world @ rig.data.bones["DEF-" + name].head_local)
               for name, i in mapping.items() if name != "spine.004"}
    for side, ids in [("L", (10,11,12,13,24,25,26)), ("R", (14,15,16,17,27,28,29))]:
        for stem, i in zip(("shoulder","upper_arm","forearm","hand","thigh","shin","foot"), ids):
            anchors[i] = canonical(rig.matrix_world @ rig.data.bones[f"DEF-{stem}.{side}"].head_local)
    def group_index(name):
        k = name.removeprefix("DEF-")
        if k in mapping:
            return mapping[k]
        shift = 0 if ".L" in k else 1
        for stem, ids in [
            ("shoulder", (10, 14)), ("upper_arm", (11, 15)), ("forearm", (12, 16)),
            ("hand", (13, 17)), ("f_", (13, 17)), ("thumb", (13, 17)), ("palm", (13, 17)),
            ("thigh", (24, 27)), ("shin", (25, 28)), ("foot", (26, 29)), ("toe", (26, 29)),
            ("breast", (4, 4)),
        ]:
            if k.startswith(stem):
                return ids[shift]
        return 1
    groups = [group_index(g.name) for g in obj.vertex_groups]
    for v in obj.data.vertices:
        for g in v.groups:
            values[v.index, groups[g.group]] += g.weight
    values[np.sum(values, axis=1) < .001, 1] = 1
    ids = np.argsort(values, axis=1)[:, -4:][:, ::-1]
    weights = np.take_along_axis(values, ids, axis=1)
    weights /= weights.sum(axis=1, keepdims=True)
    offsets = np.array([joints[i] - anchors.get(i, joints[i]) for i in range(30)])
    pos = (coordinates[:, [0, 2, 1]] - [0, lo[2], .02]) * facing * scale
    if sex == "male":
        pos[:, 0] *= np.interp(pos[:, 1], [0, .62, .76, 1.04, 1.45], [1.04, .95, 1.07, 1.15, 1.07])
        pos[:, 2] *= np.interp(pos[:, 1], [0, .78, 1.09, 1.45], [1.03, 1.04, .94, 1.02])
    pos += (offsets[ids] * weights[..., None]).sum(axis=1)
    pos[:, 1] -= pos[:, 1].min()
    arm = np.sum(weights * np.isin(ids, [11, 12, 13, 15, 16, 17]), axis=1)
    return pos, ids, weights, arm


def raw_attributes(mesh, coords):
    mesh.calc_loop_triangles()
    loops = mesh.loops
    tri_loop = np.array([t.loops[:] for t in mesh.loop_triangles], dtype=np.int32)
    vids = np.array([l.vertex_index for l in loops], dtype=np.int32)
    uv = mesh.uv_layers.active
    uv = np.array([l.uv[:] for l in uv.data], dtype=np.float32) if uv else np.zeros((len(loops), 2), dtype=np.float32)
    uv[:, 1] = 1 - uv[:, 1]
    vi = vids[tri_loop]
    # Recompute normals after reshaping the source meshes.
    f = coords[vi]
    normal = np.cross(f[:, 1] - f[:, 0], f[:, 2] - f[:, 0])
    normals = np.zeros_like(coords)
    for i in range(3):
        np.add.at(normals, vi[:, i], normal)
    norms = np.linalg.norm(normals, axis=1, keepdims=True)
    normals /= np.maximum(norms, 1e-8)
    return tri_loop, vids, uv, normals


def append_parts(doc, obj, coords, ids, weights, palette, section=None):
    tri_loop, vids, uv, normals = raw_attributes(obj.data, coords)
    slots = np.array([palette[t.material_index] for t in obj.data.loop_triangles])
    if section is not None:
        slots = section(vids[tri_loop], slots)
    parts = []
    for slot in sorted(set(slots)):
        chosen = tri_loop[slots == slot].ravel()
        vertex_ids = vids[chosen]
        keys = np.column_stack([vertex_ids, uv[chosen].round(6)])
        unique, first, inverse = np.unique(keys, axis=0, return_index=True, return_inverse=True)
        pick = unique[:, 0].astype(int)
        if len(pick) < 3:
            continue
        index_kind = 5123 if len(pick) < 65536 else 5125
        parts.append(dict(attributes=dict(
            POSITION=doc.array(coords[pick], "VEC3", bounds=True),
            NORMAL=doc.array(normals[pick], "VEC3"),
            TEXCOORD_0=doc.array(uv[chosen[first]], "VEC2"),
            JOINTS_0=doc.array(ids[pick], "VEC4", 5123),
            WEIGHTS_0=doc.array(weights[pick], "VEC4"),
        ), indices=doc.array(inverse, "SCALAR", index_kind, 34963), material=int(slot)))
    return parts


def image_path(material):
    if material and material.node_tree:
        for node in material.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image:
                path = Path(bpy.path.abspath(node.image.filepath))
                if path.is_file():
                    return path
    return None


def decimate(obj, maximum):
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    if len(obj.data.polygons) <= maximum:
        return
    if obj.modifiers:
        obj.modifiers.clear()
    obj.hide_set(False)
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new("Mobile mesh", "DECIMATE")
    mod.ratio = maximum / len(obj.data.polygons)
    bpy.ops.object.modifier_apply(modifier=mod.name)


MARKERS = {
    # x center, depth center (model units), hip/shoulder/neck height,
    # upper-arm/elbow/wrist measurements in normalized source coordinates.
    0: [0, 0, .49, .74, .82, .111, .75, .171, .59, .226, .09, .45],
    2: [0, .02, .53, .77, .80, .105, .76, .247, .75, .355, .75, .75],
    3: [-.004, .0, .53, .78, .83, .094, .77, .202, .71, .297, .68, .042, .68],
    4: [-.012, .01, .52, .76, .82, .105, .76, .154, .60, .128, .49, .061, .48],
    5: [0, .03, .53, .80, .84, .084, .80, .141, .69, .216, .60, .069, .59],
}
MARKERS[2][10] = .074


def witch_props(doc, sex):
    # The uploaded blend contains a jacket only. Complete the silhouette
    # with an original hat, brooch and arcane details on the game's mage rig.
    violet = doc.material("Fieltro astral", (.048, .022, .125), .12, .68)
    gold = doc.material("Latón lunar", (.72, .38, .12), .59, .29)
    gem = doc.material("Amatista", (.27, .065, .55), .35, .18, emissive=[.19, .03, .32])
    top = 1.43 if sex == "female" else 1.52
    parts = []
    def shape(name, kind, args, mat, joint, scale=(1, 1, 1)):
        if kind == "cylinder":
            bpy.ops.mesh.primitive_cylinder_add(vertices=28, **args)
        elif kind == "cone":
            bpy.ops.mesh.primitive_cone_add(vertices=28, **args)
        else:
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, **args)
        o = bpy.context.object
        coords = np.array([o.matrix_world @ Vector(tuple(a*b for a,b in zip(v.co,scale))) for v in o.data.vertices])
        coords = coords[:, [0, 2, 1]] * [1, 1, -1]
        ids = np.tile([joint, 0, 0, 0], (len(coords), 1))
        w = np.tile([1, 0, 0, 0], (len(coords), 1))
        parts.extend(append_parts(doc, o, coords, ids, w, [mat]))
        bpy.data.objects.remove(o, do_unlink=True)
    shape("brim", "cylinder", dict(radius=.27, depth=.026, location=(0, .015, top)), violet, 6, (1, .84, 1))
    shape("crown", "cone", dict(radius1=.144, radius2=.016, depth=.29, location=(-.026, .02, top+.14)), violet, 6)
    shape("band", "cylinder", dict(radius=.135, depth=.041, location=(-.009, .02, top+.041)), gold, 6)
    shape("gem", "gem", dict(radius=.038, location=(0, -.128, top+.064)), gem, 6, (1, .55, .9))
    shape("clasps", "gem", dict(radius=.035, location=(0, -.135, 1.034)), gold, 4, (1, .55, 1))
    doc.attach("costume_astral_hat", parts)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("sources", type=Path)
    parser.add_argument("--only", choices=[x["id"] for x in CATALOG])
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    for skin in CATALOG:
        index = SOURCE_INDEX[skin["id"]]
        source = SOURCES[index]
        slug, cls = skin["id"], skin["classId"]
        if args.only and slug != args.only:
            continue
        objects = open_model(args.sources / source, index)
        for obj in objects:
            decimate(obj, 6000 if index in (1, 5) else 12000)
        model_coords = [raw_coords(o, index) for o in objects]
        all_coords = np.concatenate(model_coords)
        lo, hi = all_coords.min(axis=0), all_coords.max(axis=0)
        for sex in ("female", "male"):
            doc = Glb(Path(f"public/mugroup/personajes/{cls}/{cls}_{sex}.glb"), keep_base=index == 1)
            joints = doc.joints()
            groups = []
            for o, coordinates in zip(objects, model_coords):
                if index == 1:
                    # Transform the source's denim jacket into a tailored
                    # mage coat; retain its original folds and topology.
                    h = (coordinates[:, 2] - lo[2]) / (hi[2] - lo[2])
                    initial_x = coordinates[:, 0] * (.0073 if sex == "male" else .0069)
                    shoulder = np.abs(initial_x) > .135
                    arm = shoulder * smoothstep((np.abs(initial_x) - .132) / .10)
                    pos = np.stack([initial_x, .69 + h * .47 - .19 * arm,
                                    -coordinates[:, 1] * .0085], axis=1)
                    ratio = np.clip((np.abs(initial_x) - .12) / .113, 0, 2)
                    material = doc.material("Gabardina astral", (.12, .048, .23) if sex == "female" else (.042, .075, .17), .16, .6)
                    palette = [material] * max(1, len(o.data.materials))
                else:
                    if index == 5:
                        pos, ids, weights, arm = transfer_guard_rig(o, coordinates, lo, hi, joints, sex)
                    else:
                        pos, arm, ratio = normalize(coordinates, lo, hi, MARKERS[index], joints, sex, index, o.name)
                    palette = []
                    for m in o.data.materials:
                        hair = "hair" in (m.name if m else "").lower()
                        tex = image_path(m)
                        tint = (1, 1, 1) if sex == "female" else (.91, .98, 1.06)
                        color = (1, 1, 1) if tex else ((.21, .34, .38) if hair else (.055, .24, .165))
                        if sex == "male":
                            if index == 2 and o.name in ("baju", "celana", "sepatu", "belenggu"):
                                color = (.48, .22, .18)
                            elif index == 3 and o.name in ("badan", "kaki"):
                                color = (.19, .30, .52)
                            elif index == 4 and o.name in ("baju", "celana", "sepatu"):
                                color = (.65, .76, .92)
                        mat = doc.material(m.name if m else "Tela", color,
                                           .24 if hair else .33, .42 if not hair else .54, tex, tint)
                        palette.append(mat)
                section = None
                if index == 5:
                    skin_color = (.65, .40, .29) if sex == "female" else (.52, .30, .22)
                    face = doc.material("Piel", skin_color, 0, .72)
                    boots = doc.material("Botas y guantes", (.065, .105, .092), .3, .51)
                    trim = doc.material("Bronce del bosque", (.68, .34, .11), .64, .34)
                    def section(vids, slots):
                        c = pos[vids].mean(axis=1)
                        arm_ratio = arm[vids].mean(axis=1)
                        result = slots.copy()
                        not_hair = slots == palette[0]
                        result[not_hair & ((c[:, 1] > 1.21) | ((arm_ratio > .65) & (c[:, 1] > .65)))] = face
                        result[not_hair & (c[:, 1] < .42)] = boots
                        result[not_hair & (c[:, 1] >= .78) & (c[:, 1] < .85)] = trim
                        return result
                if index != 5:
                    cloth = (index == 3 and o.name == "badan") or (index == 4 and o.name == "baju")
                    ids, weights = skin_weights(pos, arm, ratio, o.name, cloth)
                groups.extend(append_parts(doc, o, pos, ids, weights, palette, section))
            doc.attach("costume_" + slug, groups)
            if index == 1:
                witch_props(doc, sex)
            output = OUT / f"{slug}_{sex}.glb"
            doc.write(output, skin.get("maleName", skin["name"]) if sex == "male" else skin["name"], sex)
            tris = sum(doc.doc["accessors"][p["indices"]]["count"] // 3 for p in groups)
            print(output.name, output.stat().st_size, tris, flush=True)


if __name__ == "__main__":
    main()
