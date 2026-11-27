"""Restore original inventory icons for the bundled Flyff models."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
from descargar import ENTRIES, fetch

dest = Path(__file__).resolve().parents[2] / 'public/mugroup/ui/items'
def convert(icon):
    stem = icon.stem
    if stem.startswith('item_'):
        source = stem.replace('item_', 'itm_', 1)
    elif stem.startswith('wing_mugroup_'):
        source = 'itm_ridridwin' + stem.split('_')[-1]
    else:
        return
    path = 'reference/resource/item/' + source + '.dds'
    if path in ENTRIES:
        with Image.open(fetch(path)) as im:
            im.convert('RGBA').save(icon, lossless=True)

with ThreadPoolExecutor(max_workers=8) as pool:
    list(pool.map(convert, sorted(dest.glob('*.webp'))))

# MU jewel names retain their gameplay meaning; these portraits use Flyff gems.
for jewel, material in {'bless':'Ruby', 'soul':'Sapphire', 'chaos':'Topaz',
                        'life':'Emerald', 'harmony':'Diamond'}.items():
    with Image.open(fetch(f'reference/resource/Item/Itm_GenMat{material}.dds')) as im:
        im.convert('RGBA').save(dest / f'jewel-{jewel}.webp', lossless=True)
