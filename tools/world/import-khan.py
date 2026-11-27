"""Convert Beast Overlord Khan from the pinned Flyff reference using the existing GLB converter."""
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np

import convertir as c
from descargar import REV, fetch

NAME = "BesiBigfoot"
MODEL = f"{c.MODEL}mvr_{NAME}"
OUT = Path(__file__).resolve().parents[2] / "public" / "mugroup"
g = c.GLB()
bones = c.chr_data(fetch(MODEL + ".chr"), attachments_required=False)["bones"]
root = g.node("Beast Overlord Khan")
joints = []
for bone in bones:
    parent = joints[bone["parent"]] if bone["parent"] >= 0 else root
    joints.append(g.node(bone["name"], parent, **c.trs(c.H @ bone["local"] @ c.H)))
inv = np.array([(c.H @ b["inv"] @ c.H).T.ravel() for b in bones])
g.doc["skins"] = [dict(joints=joints, inverseBindMatrices=g.accessor(inv, kind="MAT4"), skeleton=joints[0])]
source = c.o3d(fetch(MODEL + ".o3d"))
with TemporaryDirectory() as temp:
    c.OUT = Path(temp)  # GLB embeds textures; do not leave intermediate copies.
    for i, mesh in enumerate(source["meshes"]):
        parent = joints[mesh["parent"]] if not mesh["skin"] and mesh["parentType"] == 2 else root
        g.mesh(f"khan_{i}", mesh, parent, skin=0)
g.doc["animations"] = []
for clip in ["stand", "walk", "idle1", "atk1", "atk2", "atk3", "dmg1", "dmg2", "die1"]:
    ani = c.ani_data(fetch(f"{c.MODEL}Mvr_{NAME}_{clip}.ani"))
    frames = ani["frames"]
    assert [b["name"] for b in ani["bones"]] == [b["name"] for b in bones]
    time = g.accessor(np.arange(frames, dtype=float) / 30, kind="SCALAR", bounds=True)
    anim = {"name": clip, "samplers": [], "channels": []}
    for i, bone in enumerate(ani["bones"]):
        if bone["animated"]:
            q = bone["keys"][:, :4].copy()
            q[:, :2] *= -1
            for k in range(1, frames):
                if np.dot(q[k - 1], q[k]) < 0:
                    q[k] *= -1
            q /= np.linalg.norm(q, axis=1)[:, None]
            pos = bone["keys"][:, 4:].copy()
            pos[:, 2] *= -1
        else:
            trs = c.trs(c.H @ bone["static"] @ c.H)
            q = np.tile(trs["rotation"], (frames, 1))
            pos = np.tile(trs["translation"], (frames, 1))
        for prop, data, kind in [("rotation", q, "VEC4"), ("translation", pos, "VEC3")]:
            sampler = len(anim["samplers"])
            anim["samplers"].append({"input": time, "output": g.accessor(data, kind=kind), "interpolation": "LINEAR"})
            anim["channels"].append({"sampler": sampler, "target": {"node": joints[i], "path": prop}})
    g.doc["animations"].append(anim)
g.doc["extras"] = {"source": "ed3ath/flyff-web-mmo", "revision": REV, "model": MODEL, "generatedBy": "CodeRabbit"}
g.save(OUT / "monstruos" / "besibigfoot.glb")
for target, source in [("atk1", "atk1"), ("dmg1", "Dmg1"), ("die1", "die1")]:
    path = fetch(f"reference/resource/Sound/Npc{NAME}{source}.wav")
    (OUT / "audio" / f"npc_besibigfoot_{target}.wav").write_bytes(path.read_bytes())
