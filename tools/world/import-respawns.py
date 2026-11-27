"""Read the original reference/resource directory of ed3ath/flyff-web-mmo at
7986e75c884174892edc98cc2151df7fcda331fd. Extract facts for bundled models.
Usage: python tools/world/import-respawns.py reference/resource
"""
import json
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
manifest = json.loads(Path('public/mugroup/mundo/mundo.json').read_text())
ox, oz = manifest['sourceOrigin']
size = manifest['sizeMeters']
models = {Path(file).stem for file in json.loads(Path('src/data/creatureModels.json').read_text())}
ids = {key: int(value) for key, value in re.findall(r'#define\s+(MI_\w+)\s+(\d+)', (root/'defineObj.h').read_text('latin1'))}
names = dict(line.strip().split(None, 1) for line in (root/'propMover.txt.txt').read_text('utf16').splitlines() if len(line.strip().split(None, 1)) == 2)
species = {}
for line in (root/'propMover.txt').read_text('latin1').splitlines():
    row = line.split()
    if len(row) <= 12 or row[0] not in ids or row[1] not in names or not row[12].isdigit():
        continue
    model = re.sub(r'\d+$', '', row[0][3:].lower())
    if model in models:
        species[ids[row[0]]] = dict(model=model, name=names[row[1]], level=int(row[12]))
anchors = []
for line in (root/'World/WdMadrigal/WdMadrigal.rgn').read_text('utf16').splitlines():
    row = line.split()
    if row[:2] != ['respawn7', '5'] or int(row[2]) not in species:
        continue
    x, z = round(float(row[3])-ox, 3), round(float(row[5])-oz, 3)
    if 0 < x < size and 0 < z < size:
        anchors.append(dict(x=x, z=z, bounds=[int(row[9])-ox,int(row[10])-oz,int(row[11])-ox,int(row[12])-oz], **species[int(row[2])]))
Path('src/data/madrigalSpawns.json').write_text('[\n' + ',\n'.join('  '+json.dumps(a, ensure_ascii=False) for a in anchors) + '\n]\n')
