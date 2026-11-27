import { Scene, ShaderMaterial, Texture, Vector3, type BaseTexture } from '@babylonjs/core';

// Blend the existing tile atlas with volcanic textures only inside the crater.
export function craterMaterial(scene: Scene, base: BaseTexture, center: {x:number;z:number;radius:number}, stone: Texture, magma: Texture) {
  const mat = new ShaderMaterial('crater-rock-and-lava',scene,{
    vertexSource: `precision highp float;
    attribute vec3 position; attribute vec2 uv; varying vec2 tex; uniform mat4 world, worldViewProjection; varying vec3 p;
    void main(){tex=uv;p=(world*vec4(position,1.)).xyz;gl_Position=worldViewProjection*vec4(position,1.);}`,
    fragmentSource: `precision highp float;
    uniform sampler2D stone, magma, terrain; uniform vec3 crater; varying vec2 tex; uniform float clock; uniform vec3 eye, haze; varying vec3 p;
    void main(){
      vec2 uv=p.xz*.115;
      vec3 rock=texture2D(stone,uv+vec2(p.y*.043)).rgb;
      float river=abs(sin(p.x*.024+sin(p.z*.021)*1.4+p.z*.011));
      float flow=(1.-smoothstep(.04,.15,river))*smoothstep(.12,.44,sin(p.z*.009-p.x*.006));
      vec3 melt=texture2D(magma,uv*.54+vec2(clock*.014,clock*.008)).rgb;
      vec3 ash=mix(vec3(.15,.105,.10),vec3(.54,.38,.28),rock.r);
      vec3 lava=vec3(.66,.10,.015)+melt*vec3(1.15,.70,.25);
      vec3 volcanic=mix(ash*(.72+rock*.6),lava,flow);
      float influence=1.-smoothstep(crater.z*.7,crater.z,distance(p.xz,crater.xy));
      vec3 col=mix(texture2D(terrain,tex).rgb,volcanic,influence);
      gl_FragColor=vec4(mix(col,haze,smoothstep(230.,450.,distance(eye,p))),1.);
    }`},{attributes:['position','uv'],uniforms:['world','worldViewProjection','clock','eye','haze','crater'],samplers:['stone','magma','terrain']});
  mat.setTexture('stone',stone);
  mat.setTexture('magma',magma);
  mat.setTexture('terrain',base);
  mat.setVector3('crater',new Vector3(center.x,center.z,center.radius));
  mat.backFaceCulling=false;
  mat.onBindObservable.add(()=>{
    mat.setFloat('clock',(performance.now()%3600000)/1000);
    if(scene.activeCamera) mat.setVector3('eye',scene.activeCamera.globalPosition);
    mat.setColor3('haze',scene.fogColor);
  });
  return mat;
}
