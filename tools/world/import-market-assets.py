"""Convert original Flyff item icons and models for the economy and NPC shelves."""
import importlib.util
import json
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image

import convertir as c
from descargar import ENTRIES, REV, fetch

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public/mugroup"
spec = importlib.util.spec_from_file_location("build_equipment", Path(__file__).with_name("build-equipment.py"))
equipment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(equipment)
equipment.DEST = OUT

def resource(name):
    return fetch("reference/resource/" + name)

def read(name):
    data = resource(name).read_bytes()
    return data.decode("utf-16" if data.startswith((b"\xff\xfe", b"\xfe\xff")) else "cp1252", errors="replace").replace("\r\n", "\n")

def dds(line):
    files = re.findall(r"[\w.-]+\.dds", line, re.I)
    return files[-1] if files else None

def integer(value):
    return int(value) if value.isdecimal() else 0

def save_icon(name, file):
    path = "Item/" + file
    with Image.open(resource(path)) as image:
        dest = f"ui/items/{name}.webp"
        image.convert("RGBA").save(OUT / dest, lossless=True)
    return dest

def convert_model(model):
    name = f"Item_{model}"
    path = f"equipo/{name.lower()}.glb"
    if not (OUT / path).is_file():
        doc = c.GLB()
        root = doc.node(name)
        source = resource(f"Model/{name}.o3d")
        for i, mesh in enumerate(c.o3d(source)["meshes"]):
            doc.mesh(f"item_{i}", mesh, root)
        if not doc.doc["meshes"]:
            raise ValueError(f"No meshes in {source}")
        doc.doc["extras"] = {"sourceRevision": REV, "source": f"Model/{name}.o3d"}
        doc.save(OUT / path)
    return path

ARMOR = {
    "Parmil": ("Vag03", "male"), "Leaf": ("Vag03", "female"),
    "Warpon": ("Kin02", "male"), "Warspon": ("Kin02", "female"),
    "Huedom": ("Bla04", "male"), "Huaris": ("Bla04", "female"),
    "Blain": ("BlaSet03", "male"), "Virain": ("BlaSet03", "female"),
    "Nox (M)": ("BlaSet05", "male"), "Nox (F)": ("BlaSet05", "female"),
    "Heraud": ("BlaSet06", "male"), "Herainn": ("BlaSet06", "female"),
    "Rimyth": ("RinSet03", "male"),
}
PARTS = {"Helmet": "Cap", "Suit": "Upper", "Gauntlets": "Hand", "Boots": "Foot"}
ITEMS = {
    "Wooden Sword": "II_WEA_SWO_WOODEN", "Long Sword": "II_WEA_SWO_LONG",
    "Seal Wand": "II_WEA_WAN_SEAL", "Bastard Sword": "II_WEA_SWT_BASTAR",
    "Darkonizer": "II_WEA_SWT_DARKON", "Kaleonizer": "II_WEA_SWT_KALEON",
    "Zeroth Sword": "II_WEA_SWO_ZEROTH", "Shakyfin Axe": "II_WEA_AXE_SHAKYFIN",
    "Emeryl Sword": "II_WEA_SWO_EMERYL", "Ultimate Guardian Sword": "II_WEA_SWO_SUHOUM",
    "Ultimate Historic Big Sword": "II_WEA_SWT_USUUM", "Ultimate Legendary Golden Sword": "II_WEA_SWO_LEAGENDGUM",
    "Ultimate Ancient Two-hand Sword": "II_WEA_SWT_ANCIENT", "Ultimate Vampire Blade": "II_WEA_SWO_VEMPIRE",
    "Lusaka's Crystal Sword": "II_WEA_SWO_LUZAM",
    "Mighteer+1": "II_GEN_JEW_EAR_U_EARRING01", "Penzeru+1": "II_GEN_JEW_EAR_U_EARRING04",
    "Poción HP pequeña": "II_GEN_FOO_PIL_YELLOW", "Poción HP mediana": "II_GEN_FOO_PIL_BLUE",
    "Poción HP grande": "II_GEN_FOO_PIL_RED",
    "Poción MP pequeña": "II_GEN_REF_REF_FIRST", "Poción MP mediana": "II_GEN_REF_REF_FIFTH",
    "Poción MP grande": "II_GEN_REF_REF_TENTH",
    "Flechas": "II_WEA_SEC_ACR_ARROW", "Topacio": "II_GEN_MAT_TOPAZ",
    "Rubí en bruto": "II_GEN_MAT_RUBY", "Comida para mascotas": "II_SYS_SYS_FEED_01",
    "Tarjeta de elemento": "II_GEN_MAT_ELE_SPARK",
}
# Wing names in this game's economy have no identical entries in this source.
# Use four existing, distinct Flyff meshes and list the source appearance in the UI.
WINGS = {
    "Wing of Spint": ("wing_mugroup_feather02", "Alas Pluma Dorada"),
    "Wing of Storm": ("wing_mugroup_angel01", "Alas de Ángel"),
    "Wing of Vortex": ("wing_mugroup_prophet01", "Alas del Profeta"),
    "Wing of Doom": ("wing_mugroup_prophet02", "Alas del Profeta Épicas"),
}
WEAPON_KINDS = {
    "IK3_SWD": ["DK", "MG"], "IK3_AXE": ["DK", "MG"], "IK3_BOW": ["ELF"],
    "IK3_YOYO": ["ELF"], "IK3_STAFF": ["DW", "MG"], "IK3_WAND": ["DW", "DL"],
    "IK3_CHEERSTICK": ["DL"], "IK3_KNUCKLEHAMMER": ["DL"], "IK3_SHIELD": ["DK", "MG"],
}
JOBS = {"JOB_VAGRANT": 0, "JOB_MERCENARY": 1, "JOB_ACROBAT": 2, "JOB_ASSIST": 3, "JOB_MAGICIAN": 4,
        "JOB_KNIGHT": 6, "JOB_BLADE": 7, "JOB_JESTER": 8, "JOB_RANGER": 9, "JOB_RINGMASTER": 10, "JOB_BILLPOSTER": 11}
NPCS = {"MaFl_Boboku": "flaris-npc-hanzo", "MaFl_Losha": "flaris-npc-lumen",
        "MaFl_Luda": "flaris-artisan", "MaDa_Roocky": "puerto-npc-smith",
        "MaDa_Krinton": "puerto-artisan", "MaDa_Kablloc": "ceniza-npc-gladiator"}
ARMOR_SLOTS = {"IK3_SUIT": "armor", "IK3_HELMET": "helm", "IK3_GAUNTLET": "gloves", "IK3_BOOTS": "boots"}
ARMOR_CLASSES = {0: None, 6: ["DK", "MG"], 7: ["DK", "MG"], 8: ["ELF"], 9: ["ELF"], 10: ["DL"], 11: ["DL"]}

def market_assets():
    names = dict(line.split("\t", 1) for line in read("propItem.txt.txt").splitlines() if "\t" in line)
    models = {key: name for name, key in re.findall(r'^\s*"([^"]+)"\s+(II_\w+)\s+MODELTYPE', read("mdlDyna.inc"), re.M)}
    rules = {}
    character = read("character.inc")
    for native, local in NPCS.items():
        block = character.split("\n" + native + "\n", 1)[1].split("m_nStructure", 1)[0]
        rules[local] = [(kind, int(job), int(low), int(high), int(limit)) for kind, job, low, high, limit
            in re.findall(r'^\s*AddVendorItem\(\s*\d+,\s*(IK3_\w+),\s*(-?\d+),\s*(\d+),\s*(\d+),\s*(\d+)\s*\)', block, re.M)]
    by_id = {}
    for line in read("propItem.txt").splitlines():
        fields = line.split()
        if len(fields) > 31 and fields[1].startswith("II_") and fields[2] in names and dds(line):
            by_id[fields[1]] = (names[fields[2]].strip(), fields, dds(line))

    visuals, sets, stock = {}, {}, []
    models_to_build = {}
    icons = {}

    def bind(name, item_id, model=False):
        _, _, icon = by_id[item_id]
        slug = "flyff-" + re.sub(r"[^a-z0-9]+", "-", item_id[3:].lower())
        icons[slug] = icon
        visuals[name] = {"icon": f"ui/items/{slug}.webp"}
        if model:
            source = models[item_id]
            models_to_build[source.lower()] = source
            visuals[name]["model"] = f"equipo/item_{source.lower()}.glb"

    for name, item_id in ITEMS.items():
        bind(name, item_id, item_id.startswith(("II_WEA_SWO_", "II_WEA_SWT_", "II_WEA_AXE_", "II_WEA_WAN_")))
    for set_name, (family, sex) in ARMOR.items():
        sets[set_name] = {sex: f"equipo/{family}_{sex}.glb"}
        for part, source_part in PARTS.items():
            slug = f"flyff-{sex[0]}{family.lower()}-{source_part.lower()}"
            icons[slug] = f"itm_{sex[0]}{family}{source_part}.dds"
            visuals[set_name + " " + part] = {"icon": f"ui/items/{slug}.webp"}
    for name, (model, label) in WINGS.items():
        visuals[name] = {"icon": f"ui/items/{model}.webp", "model": f"equipo/{model}.glb", "appearance": label}

    for item_id, (name, fields, _) in by_id.items():
        if name in visuals or not name or '@' in name or not 0 < integer(fields[12]):
            continue
        kind, job = fields[7], JOBS.get(fields[8], -2)
        # Mover::GetVendorItem selects by dwItemRare and rejects items
        # whose dwShopAble is undefined. dwItemLV is a separate column.
        level, shop_rank = integer(fields[23]), integer(fields[24])
        if fields[24] == "=" or fields[25] == "=":
            continue
        matching = [npc for npc, criteria in rules.items() if any(
            kind == k and (j == -1 or j == job) and low <= shop_rank <= high
            for k, j, low, high, _total in criteria)]
        if not matching or (kind == "IK3_INSTANT" and (len(fields) <= 56 or fields[53] != "DST_HP" or not integer(fields[56]))):
            continue
        is_gear_model = kind in WEAPON_KINDS
        slot, set_name, sex = None, "", None
        classes = WEAPON_KINDS.get(kind)
        if kind in ARMOR_SLOTS:
            match = re.fullmatch(r"itm_([mf])(.*?)(?:Cap|Upper|Hand|Foot)\.dds", by_id[item_id][2], re.I)
            if not match:
                continue
            prefix, family = match.groups()
            sex = "male" if prefix.lower() == "m" else "female"
            stem = f"Part_{prefix}{family}"
            if not all((c.MODEL + stem + part + ".o3d").lower() in ENTRIES for part in PARTS.values()):
                continue
            slot, set_name, classes = ARMOR_SLOTS[kind], re.sub(r"\s+\([^)]*\)$", "", name), ARMOR_CLASSES.get(job)
            set_name = re.sub(r"\s+(?:Helmet|Suit|Gauntlets?|Guantlets?|Boots)$", "", set_name, flags=re.I)
            sets.setdefault(set_name, {})[sex] = f"equipo/{family}_{sex}.glb"
        elif kind == "IK3_SHIELD":
            slot = "shield"
        elif is_gear_model:
            slot = "weapon"
        elif kind == "IK3_INSTANT":
            slot = "consumable"
        else:
            continue
        if is_gear_model and (item_id not in models or (c.MODEL + "Item_" + models[item_id] + ".o3d").lower() not in ENTRIES):
            continue
        bind(name, item_id, is_gear_model)
        stock.append({"id": "native_" + item_id.lower(), "name": name, "npcs": matching, "level": level,
                      "cost": integer(fields[12]), "kind": kind, "min": integer(fields[30]) if slot == "weapon" else 0,
                      "max": integer(fields[31]) if slot == "weapon" else 0, "slot": slot, "setName": set_name,
                      "defense": integer(fields[30]) if slot in (*ARMOR_SLOTS.values(), "shield") else 0,
                      "classes": classes, "sex": sex, "heal": integer(fields[56]) if slot == "consumable" else 0})

    with TemporaryDirectory(prefix="flyff-market-") as temp:
        c.OUT = Path(temp)
        with ThreadPoolExecutor(max_workers=12) as pool:
            list(pool.map(lambda pair: save_icon(*pair), icons.items()))
        for model in models_to_build.values():
            convert_model(model)
        for model in sorted({file for model_by_sex in sets.values() for file in model_by_sex.values()}):
            family, sex = Path(model).stem.rsplit("_", 1)
            if not (OUT / model).is_file():
                equipment.outfit(family, sex)
    data = {"sourceRevision": REV, "items": visuals, "sets": sets, "stock": stock}
    (OUT / "market-assets.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(f"{len(icons)} iconos, {len(models_to_build)} modelos, {len(sets)} conjuntos, {len(stock)} ofertas")

if __name__ == "__main__":
    market_assets()
