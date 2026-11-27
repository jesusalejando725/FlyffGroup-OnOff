"""Project the actual Babylon mesh and vertex colors onto the store portrait."""
import math
import json
import sys
from PIL import Image, ImageDraw

for model in json.load(sys.stdin):
    pos, colors, indices = (model[k] for k in ('p','c','i'))
    vertices = []
    for x, y, z in zip(pos[::3],pos[1::3],pos[2::3]):
        v = .92*z+.39*y
        vertices.append((.707*(x+v), .707*(-x+v), .92*y-.39*z))
    xs, ys, _ = zip(*vertices)
    scale = 226/max(max(xs)-min(xs), max(ys)-min(ys))
    cx, cy = (min(xs)+max(xs))/2, (min(ys)+max(ys))/2
    img = Image.new('RGBA',(256,256))
    draw = ImageDraw.Draw(img)
    triangles = zip(indices[::3],indices[1::3],indices[2::3])
    for ids in sorted(triangles,key=lambda ids:sum(vertices[j][2] for j in ids)):
        a,b,c = [vertices[i] for i in ids]
        u,v = [[p[i]-a[i] for i in range(3)] for p in (b,c)]
        nx,ny,nz = u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]
        light=.60+.52*abs((.35*nx-.5*ny+.79*nz)/max(1e-9,math.hypot(nx,ny,nz)))
        fill=tuple(min(255,round(255*light*colors[4*ids[0]+i]**(1/2.2))) for i in range(3))
        draw.polygon([((x-cx)*scale+128,(y-cy)*scale+128) for x,y,_ in (a,b,c)], fill=fill)
    img.resize((96,96),Image.Resampling.LANCZOS).save('public/mugroup/ui/items/'+model['id']+'.webp',quality=90)
