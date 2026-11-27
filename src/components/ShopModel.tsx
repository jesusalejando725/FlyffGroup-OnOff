import { useEffect, useRef, useState } from 'react';
import { ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, Mesh, HemisphericLight, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders';
import { buildArtisanWeapon } from '../game/content/ArtisanWeapon';
import { applyEnhanceGlow, splitTorsoAndPantsMesh } from '../game/content/EquipmentAppearance';
import { isFullSuit } from '../data/itemVisualAssets';
import { artisanWeapon, artisanArmor } from '../data/artisanEquipment';
import type { MuItem } from '../types/game';

export function ShopModel({item,file}:{item:Pick<MuItem, 'id' | 'name' | 'slot' | 'setName' | 'enhanceLevel'>;file?:string}) {
  const ref=useRef<HTMLCanvasElement>(null), [failed,setFailed]=useState(false);
  useEffect(()=>{
    const canvas=ref.current;
    if (!canvas) return;
    let engine:Engine;
    try { engine=new Engine(canvas,true,{stencil:true}); } catch { setFailed(true); return; }
    const scene=new Scene(engine);
    scene.clearColor=new Color4(.04,.06,.09,1);
    const camera=new ArcRotateCamera('preview',-Math.PI/2,1.25,3,Vector3.Zero(),scene);
    // FlyffWeb client/invpreview.ts (0a4780dd): white ambient and directional light.
    const fill = new HemisphericLight('shop-fill', Vector3.Up(), scene);
    fill.groundColor = Color3.White();
    fill.intensity = 1.6;
    new DirectionalLight('shop-key', new Vector3(2,-4,5).normalize(), scene).intensity = 1.6;
    const setup=async()=>{
      if (file) {
        const path='./mugroup/'+file, i=path.lastIndexOf('/')+1;
        const container=await SceneLoader.LoadAssetContainerAsync(path.slice(0,i),path.slice(i),scene);
        if (scene.isDisposed) { container.dispose(); return; }
        container.addAllToScene();
        const part=({helm:'helmet',gloves:'hands',boots:'feet',armor:'torso',pants:'torso'} as Record<string,string>)[item.slot];
        if(part) for(const mesh of container.meshes) {
          if(!(mesh instanceof Mesh) || !mesh.getTotalVertices()) continue;
          if(!mesh.name.startsWith('equip_'+part+'_')) mesh.setEnabled(false);
          else if(part==='torso' && !isFullSuit(item)){
            const pieces=splitTorsoAndPantsMesh(mesh,scene);
            (item.slot==='pants'?pieces.torso:pieces.pants)?.dispose();
            mesh.setEnabled(false);
          }
        }
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) container.animationGroups[0]?.start(true);
      } else {
        const spec=artisanWeapon(item.name);
        if (!spec) throw Error('Modelo no disponible');
        buildArtisanWeapon(scene,spec);
      }
      for (const mesh of scene.meshes) if(mesh.isEnabled() && mesh.getTotalVertices()) applyEnhanceGlow(mesh,item.enhanceLevel,artisanArmor(item.setName)?.color);
      if (!scene.meshes.some(mesh => mesh.isEnabled() && mesh.getTotalVertices())) throw Error('Modelo vacío');
      const {min,max}=scene.getWorldExtends(mesh=>mesh.isEnabled() && mesh.getTotalVertices()>0);
      const radius=Math.max(.01,Vector3.Distance(min,max)*1.65);
      camera.setTarget(Vector3.Center(min,max)); camera.radius=radius;
      camera.minZ=radius*.001; camera.maxZ=radius*12; camera.lowerRadiusLimit=radius*.35; camera.upperRadiusLimit=radius*3;
      camera.panningSensibility=0; camera.attachControl(canvas,true);
      engine.runRenderLoop(()=>scene.render());
    };
    void setup().catch(()=>{if(!scene.isDisposed)setFailed(true)});
    return ()=>{scene.dispose();engine.dispose()};
  },[file,item.id,item.name,item.slot,item.setName,item.enhanceLevel]);
  return failed ? <p className="text-xs text-slate-300">La vista 3D requiere WebGL. El retrato del objeto sigue disponible.</p> :
    <canvas aria-label={'Vista 3D de '+item.name} ref={ref} className="w-full h-40 touch-none rounded" />;
}
