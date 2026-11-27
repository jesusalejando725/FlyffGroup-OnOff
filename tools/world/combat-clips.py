"""Retarget the six class skills and a flying stance onto the existing rigs by bone name."""
from pathlib import Path
import struct,json
import numpy as np
from convertir import GLB,ani_data,trs,H,MODEL
from descargar import fetch
ROOT=Path(__file__).resolve().parents[2]/'public/mugroup'
CLIPS={
'DK':'SklBldDblArmpen SklBldDswBlddan SklAcrAimed SklAcrRain SklBldSuppor SklBldDaxHawatt',
'DW':'SklPsyPsychi03 SklPsyNolgy01 SklPsyNolgy03 SklPsySquare02 SklPsyPsychi02 SklPsySquare03',
'ELF':'SklKntTswCharge SklKntTwoPwswng SklKntTswEthdvd SklKntTaxPwstum SklRincure03 SklRinHeal03',
'DL':'SklJstVatals SklJstBackst SklJstHfpeny SklJstEnchan SklJstSuppor SklJstEscape',
'MG':'SklBldDblCross SklBldDswBlddan SklEleFirCasting03 SklEleEleCasting03 SklEleWatCasting03 SklEleMulCasting03'}
def attach(path,cls,sex):
    raw=path.read_bytes();length=struct.unpack_from('<I',raw,12)[0]
    g=GLB();g.doc=json.loads(raw[20:20+length]);g.bin=bytearray(raw[length+28:])
    names={g.doc['nodes'][i]['name'].lower():i for i in g.doc['skins'][0]['joints']}
    for j,suffix in enumerate((CLIPS[cls]+' GenFStand1-A').split()):
        name='flight' if j==6 else 'power_'+str(j)
        if any(a['name']==name for a in g.doc['animations']):continue
        ani=ani_data(fetch(MODEL+f'mvr_{sex}_{suffix}.ani'));nf=ani['frames']
        a={'name':name,'channels':[],'samplers':[],'extras':{'motion':suffix}}
        time=g.accessor(np.arange(nf)/30,kind='SCALAR',bounds=True)
        for bone in ani['bones']:
            node=names[bone['name'].lower()]
            if bone['animated']:
                rot=bone['keys'][:,:4].copy();rot[:,:2]*=-1
                rot/=np.maximum(1e-9,np.linalg.norm(rot,axis=1))[:,None]
                for k in range(1,nf):
                    if np.dot(rot[k],rot[k-1])<0:rot[k]*=-1
                pos=bone['keys'][:,4:].copy();pos[:,2]*=-1
            else:
                t=trs(H@bone['static']@H)
                rot=np.array([t['rotation']]);pos=np.array([t['translation']])
            # Keep the gameplay transform authoritative during attacks and flight.
            if bone['parent']<0:pos=np.array([g.doc['nodes'][node].get('translation',[0,0,0])])
            for prop,data,kind in [('rotation',rot,'VEC4'),('translation',pos,'VEC3')]:
                if np.allclose(data,data[0],atol=1e-6):data=data[:1]
                times=time if len(data)>1 else g.accessor([0.],kind='SCALAR',bounds=True)
                idx=len(a['samplers']);a['samplers'].append(dict(input=times,output=g.accessor(data,kind=kind),interpolation='LINEAR'))
                a['channels'].append(dict(sampler=idx,target=dict(node=node,path=prop)))
        g.doc['animations'].append(a)
    g.save(path)
if __name__=='__main__':
    manifest=ROOT/'personajes.json';records=json.loads(manifest.read_text())
    for rec in records:
        attach(ROOT/rec['model'],rec['classId'],rec['sex'])
        rec['clips']=list(dict.fromkeys(rec['clips']+['power_'+str(i) for i in range(6)]+['flight']))
    for sex in ['male','female']:attach(ROOT/'personajes/mobilee'/f'hechicera_{sex}.glb','DW',sex)
    manifest.write_text(json.dumps(records,indent=2,ensure_ascii=False)+'\n')
