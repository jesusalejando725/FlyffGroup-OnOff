"""Build the HUD relief in the same x/z projection as its entity markers."""
from array import array
import json
from PIL import Image

base = 'public/mugroup/'
m = json.load(open(base+'mundo/mundo.json'))
h = array('f',open(base+'mundo/heightmap.f32','rb').read())
water = {(int(w['x']//32),int(w['z']//32)): w['height'] for t in m['tiles'] for w in t['water']}
size = m['sizeMeters']//8
im = Image.new('RGB',(size,size))
for z in range(size):
    for x in range(size):
        i = 2*z*m['heightResolution']+2*x
        if h[i] <= max(1,water.get((x//4,z//4),0))+.3:
            color = (15,65,85)
        else:
            shade = max(-25,min(25,(h[i+1]-h[i+m['heightResolution']])*1.5))
            color = tuple(round(v+shade) for v in ((70,104,66) if h[i]<150 else (109,108,78)))
        im.putpixel((x,z),color)
im.save(base+'ui/relief.webp',quality=93)
