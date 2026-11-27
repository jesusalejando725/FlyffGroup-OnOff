"""Rebind Elfo powers to native Flyff bow and healing clips and sounds."""
import importlib.util
import json
from pathlib import Path

from descargar import fetch
from PIL import Image

script = Path(__file__).with_name("combat-clips.py")
spec = importlib.util.spec_from_file_location("combat_clips", script)
combat = importlib.util.module_from_spec(spec)
spec.loader.exec_module(combat)

# Reuse the same file conversion for the two Blade Knight clips that were using bow animations.
combat.CLIPS["DK"] = "SklBldDblArmpen SklBldDswBlddan SklKntTswCharge SklKntTwoPwswng SklBldSuppor SklBldDaxHawatt"
for sex in ("male", "female"):
    combat.attach(combat.ROOT / "personajes" / "DK" / f"DK_{sex}.glb", "DK", sex, replace_powers=True)

combat.CLIPS["ELF"] = "SklAcrBow SklAcrBow SklAcrAimed SklRagIceArr SklRinHeal03 SklAcrRain"
for sex in ("male", "female"):
    combat.attach(combat.ROOT / "personajes" / "ELF" / f"ELF_{sex}.glb", "ELF", sex, replace_powers=True)

sounds = {
    "flyff_sword_thrust": "PcSkillD-Charge.wav",
    "flyff_sword_sweep": "PcSkillD-Powerswing.wav",
    "flyff_bow_shot": "PcSkillM-Autoshot01.wav",
    "flyff_bow_volley": "PcSkillM-Autoshot02.wav",
    "flyff_bow_aimed": "PcSkillM-Aimedshot02.wav",
    "flyff_ice_arrow": "PcSkillM-IceArrow02.wav",
    "flyff_healing": "PCSkillM-Healing.wav",
    "flyff_arrow_rain": "PcSkillM-Arrowrain02.wav",
}
media = combat.ROOT / "efectos-audio.json"
data = json.loads(media.read_text())
for key, original in sounds.items():
    path = f"audio/{key}.wav"
    (combat.ROOT / path).write_bytes(fetch(f"reference/resource/Sound/{original}").read_bytes())
    data["sounds"][key] = path
media.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")

# Restore source textures referenced by the effects used for the first time.
for effect in ("sfx_sklknttwopwswng02", "sfx_sklrinhealraincasting01", "sfx_sklragbowicearrow01"):
    definition = json.loads((combat.ROOT / "efectos" / f"{effect}.json").read_text())
    for part in definition["parts"]:
        for path in part.get("textures", []):
            dest = combat.ROOT / path
            if dest.exists():
                continue
            name = Path(path).with_suffix(".dds").name
            with Image.open(fetch(f"reference/resource/SFX/Texture/{name}")) as original:
                original.convert("RGBA").save(dest)
