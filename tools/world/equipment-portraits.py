"""Bake offline item portraits from the same textured triangles used in combat (NumPy/Pillow)."""
from pathlib import Path
from io import BytesIO
import struct,json
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[2]
PUBLIC=ROOT/'public'
OUT=PUBLIC/'mugroup/ui'
def scene(path):
    b=path.read_bytes(); length=struct.unpack_from('<I',b,12)[0]
    doc=json.loads(b[20:20+length]);buf=b[length+28:]
    def view(i):
        v=doc['bufferViews'][i];o=v.get('byteOffset',0)
        return buf[o:o+v['byteLength']]
    def attr(i):
        a=doc['accessors'][i]; dtype={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]
        dim={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        step=np.dtype(dtype).itemsize
        return np.ndarray((a['count'],dim),dtype,buffer=view(a['bufferView']),offset=a.get('byteOffset',0),
                          strides=(doc['bufferViews'][a['bufferView']].get('byteStride',step*dim),step))
    imgs=[np.asarray(Image.open(BytesIO(view(im['bufferView']))).convert('RGBA')) for im in doc.get('images',[])]
    chunks=[]
    for mesh in doc['meshes']:
        for p in mesh['primitives']:
            vertices=attr(p['attributes']['POSITION'])
            ids=(attr(p['indices']) if 'indices' in p else np.arange(len(vertices))).reshape(-1,3);xyz=vertices[ids]
            mat=doc.get('materials',[{}])[p.get('material',0)].get('pbrMetallicRoughness',{})
            t=mat.get('baseColorTexture');rgba=np.tile(np.array(mat.get('baseColorFactor',[.8,.76,.62,1]))*255,(len(ids),1))
            if t and 'TEXCOORD_0' in p['attributes']:
                tex=doc['textures'][t['index']];im=imgs[tex['source'] if 'source' in tex else tex['extensions']['EXT_texture_webp']['source']];h,w=im.shape[:2]
                uv=(attr(p['attributes']['TEXCOORD_0'])[ids].mean(axis=1)%1*[w,h]).astype(int)
                rgba=im[uv[:,1]%h,uv[:,0]%w].copy()
            chunks.append((mesh['name'],xyz,rgba))
    return chunks
def paint(chunks,path,slot='',tint=None):
    pos=[];colors=[]
    for name,faces,rgba in chunks:
        if slot and ('equip_'+{'armor':'torso','pants':'torso','helm':'helmet','gloves':'hands','boots':'feet'}[slot]) not in name:continue
        keep=rgba[:,3]>35
        if slot in ['armor','pants']:
            y=faces[:,:,1].mean(axis=1);keep &= (y>=.85 if slot=='armor' else y<.85)
        if keep.any():pos.append(faces[keep]);colors.append(rgba[keep,:3])
    if not pos:return
    pos=np.concatenate(pos);col=np.concatenate(colors).astype(float)
    if tint is not None: col=col*.37+np.mean(col,axis=1)[:,None]*np.array(tint)*.8
    if path.name.startswith('item_'):
        # Choose the broad face, then frame the long axis diagonally.
        _,v=np.linalg.eigh(np.cov(pos.reshape(-1,3).T));coord=pos@v[:,::-1]
        x=coord[:,:,0]*.74-coord[:,:,1]*.67;y=coord[:,:,0]*.67+coord[:,:,1]*.74;depth=coord[:,:,2]
    else:
        x=pos[:,:,0]*.95+pos[:,:,2]*.31;y=pos[:,:,1]*.96-pos[:,:,2]*.27;depth=pos[:,:,2]-.18*pos[:,:,0]+.21*pos[:,:,1]
    xy=np.stack([x,-y],axis=2);lo=xy.min(axis=(0,1));hi=xy.max(axis=(0,1));xy=(xy-(hi+lo)/2)*(174/max(.001,max(hi-lo)))+96
    surface=np.cross(pos[:,1]-pos[:,0],pos[:,2]-pos[:,0]);norms=np.linalg.norm(surface,axis=1);shade=.78+.30*np.abs(surface@np.array([.3,.77,.54]))/np.maximum(norms,1e-9)
    rgb=np.uint8(np.clip(col*shade[:,None],0,255));im=Image.new('RGBA',(192,192));pen=ImageDraw.Draw(im)
    for i in np.argsort(depth.mean(axis=1)):pen.polygon([tuple(p) for p in xy[i]],fill=tuple(rgb[i])+(255,))
    im.resize((96,96),Image.Resampling.LANCZOS).save(path,quality=88)
def wing_texture_portrait(path, dest):
    # These two legacy wings are painted on cards; one colour per triangle
    # loses the veins and leaves a black silhouette. Use the embedded artwork.
    data = path.read_bytes()
    size = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20+size])
    view = doc['bufferViews'][doc['images'][0]['bufferView']]
    offset = 28 + size + view.get('byteOffset', 0)
    im = Image.open(BytesIO(data[offset:offset+view['byteLength']])).convert('RGBA')
    im.putdata([(r,g,b,0 if max(r,g,b)<8 else a) for r,g,b,a in im.getdata()])
    im.thumbnail((88,88), Image.Resampling.LANCZOS)
    portrait = Image.new('RGBA',(96,96))
    portrait.alpha_composite(im, ((96-im.width)//2,(96-im.height)//2))
    portrait.save(dest, lossless=True)

if __name__=='__main__':
    dest=OUT/'items';dest.mkdir(exist_ok=True,parents=True)
    for f in sorted([*(PUBLIC/'mugroup/equipo').glob('*.glb'),*(PUBLIC/'openmu/models').glob('wing*.glb')]):
        if f.stem in ('wing_mu_fairy','wing_mu_dark'):
            wing_texture_portrait(f,dest/(f.stem+'.webp'))
            continue
        chunks=scene(f)
        if f.stem.endswith(('_male','_female')):
            for slot in ['helm','armor','pants','gloves','boots']:paint(chunks,dest/(f.stem+'-'+slot+'.webp'),slot)
        else:paint(chunks,dest/(f.stem+'.webp'))
    for key,model,tint in [('red','mugroup/monstruos/meteonyker',[1.5,.54,.42]),('gold','mugroup/monstruos/meteonyker',[1.6,1.25,.4]),('kundum','models/mon_balrog',None),('selupan','mugroup/monstruos/clockwork',None),('medusa','models/mon_hydra',None)]:
        paint(scene(PUBLIC/(model+'.glb')),OUT/('event-'+key+'.webp'),tint=tint)
