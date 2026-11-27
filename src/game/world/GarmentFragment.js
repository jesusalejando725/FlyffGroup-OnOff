// Lightweight cloth debris from the actual posed garment; fixed-step Verlet integration.
import { Mesh, VertexData, Vector3 } from '@babylonjs/core';
export function garmentFragment(source, scene, cloth) {
  source.computeWorldMatrix(true);
  const posed=source.clone('bake_fragment',source.parent,true);posed.makeGeometryUnique();
  if(source.skeleton){source.skeleton.prepare();posed.applySkeleton(source.skeleton);}
  const positions=posed.getVerticesData('position'),uvs=posed.getVerticesData('uv'),indices=posed.getIndices(),world=source.getWorldMatrix().clone();
  const used=[...new Set(indices)],remap=new Map(used.map((id,i)=>[id,i])),data=new VertexData();
  data.positions=[];data.uvs=[];
  for(const index of used){const p=Vector3.TransformCoordinates(Vector3.FromArray(positions,index*3),world);data.positions.push(p.x,p.y,p.z);if(uvs)data.uvs.push(uvs[index*2],uvs[index*2+1]);}
  data.indices=Array.from(indices,i=>remap.get(i));data.normals=[];VertexData.ComputeNormals(data.positions,data.indices,data.normals);
  const mesh=new Mesh(`fragment_${source.name}`,scene);data.applyToMesh(mesh,true);mesh.material=source.material;mesh.isPickable=false;posed.dispose();
  const current=Float32Array.from(data.positions),previous=current.slice(),constraints=[],edges=new Set();
  for(let i=0;i<previous.length;i+=3){previous[i]-=.012;previous[i+1]-=.025;previous[i+2]-=.006;}
  for(let i=0;i<data.indices.length;i+=3)for(const [a,b] of [[0,1],[1,2],[2,0]]){
    const x=data.indices[i+a],y=data.indices[i+b],key=`${Math.min(x,y)}_${Math.max(x,y)}`;if(edges.has(key))continue;edges.add(key);
    constraints.push([x,y,Math.hypot(...[0,1,2].map(k=>current[x*3+k]-current[y*3+k]))]);
  }
  return {mesh,life:0,cloth,vy:2.5,current,previous,constraints,indices:data.indices,accumulator:0};
}
export function updateFragment(fragment,dt,groundAt,fallback) {
  const f=fragment;f.life+=dt;
  if(f.life>4){f.mesh.dispose();return;}
  if(!f.cloth){f.vy-=9.8*dt;f.mesh.position.y+=f.vy*dt;
    const min=f.mesh.getBoundingInfo().boundingBox.minimum.y,center=f.mesh.getBoundingInfo().boundingBox.center;
    const floor=groundAt?.(center.x,center.z,min+f.mesh.position.y+.08)??fallback;
    if(min+f.mesh.position.y<floor+.02){f.mesh.position.y=floor+.02-min;f.vy=0;}
    return;
  }
  let cx=0,cz=0,minY=Infinity;
  for(let i=0;i<f.current.length;i+=3){cx+=f.current[i];cz+=f.current[i+2];minY=Math.min(minY,f.current[i+1]);}
  const count=f.current.length/3,clothFloor=groundAt?.(cx/count,cz/count,minY+.08)??fallback;
  f.accumulator=Math.min(.08,f.accumulator+dt);const h=1/60;
  while(f.accumulator>=h){f.accumulator-=h;
    for(let i=0;i<f.current.length;i+=3){
      const x=f.current[i],y=f.current[i+1],z=f.current[i+2];
      f.current[i]+=(x-f.previous[i])*.98+Math.sin(f.life*3+i)*h*h*.6;
      f.current[i+1]+=(y-f.previous[i+1])*.98-9.8*h*h;
      f.current[i+2]+=(z-f.previous[i+2])*.98;
      f.previous[i]=x;f.previous[i+1]=y;f.previous[i+2]=z;
    }
    for(let iteration=0;iteration<3;iteration++)for(const [a,b,length] of f.constraints){
      const i=a*3,j=b*3,dx=f.current[j]-f.current[i],dy=f.current[j+1]-f.current[i+1],dz=f.current[j+2]-f.current[i+2];
      const distance=Math.hypot(dx,dy,dz)||1,factor=(distance-length)/distance*.48;
      for(const [axis,d] of [[0,dx],[1,dy],[2,dz]]){f.current[i+axis]+=d*factor;f.current[j+axis]-=d*factor;}
    }
    for(let i=0;i<f.current.length;i+=3){const floor=clothFloor;if(f.current[i+1]<floor+.02){f.current[i+1]=floor+.02;f.previous[i+1]=f.current[i+1];}}
  }
  const normals=[];VertexData.ComputeNormals(f.current,f.indices,normals);f.mesh.updateVerticesData('position',f.current,true);f.mesh.updateVerticesData('normal',normals);
}
