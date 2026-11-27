import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { worldInvasions } from '../services/liveWorldService';
import { invasionWindow } from '../data/worldInvasions';
import { getMapById } from '../data/muWorldData';
export function InvasionBoard() {
  const [open,setOpen] = useState(false), [now,setNow] = useState(Date.now);
  useEffect(() => {
    if (!open) return;
    setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  },[open]);
  return <><button className="realm-button px-2 text-xs min-h-[34px]" onClick={()=>setOpen(true)}>EVENTS</button>
    {open && createPortal(<section role="dialog" aria-label="Eventos del mundo" className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-3">
      <div className="realm-board max-w-xl w-full max-h-[92dvh] overflow-auto p-4">
        <header className="flex justify-between"><h2 className="font-display text-xl text-amber-200">Invasiones del reino</h2><button aria-label="Cerrar eventos" onClick={()=>setOpen(false)}>✕</button></header>
        <p className="text-sm mb-2 text-stone-300">Cada invasión dura 1 h 20 min. Los jefes aparecen fuera de las capitales.</p>
        {worldInvasions().map(e=>{const w=invasionWindow(e,now);return <article key={e.id} className="flex items-center gap-3 border-t border-amber-900/60 py-2">
          <img src={'./mugroup/ui/event-'+e.id+'.webp'} width="64" height="64" alt=""/>
          <div><strong style={{color:e.color}}>{e.name} ×{e.count}</strong> · {getMapById(e.map).name}
          <p className="text-amber-200 text-xs">{w.active?'Activa hasta':'Próxima a las'} {new Date(w.active?w.end:w.next).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>
          <p className="text-xs">{e.zen.toLocaleString()} Zen · +{e.levels} niveles · {e.points} puntos · {e.pieces} piezas</p></div>
        </article>})}</div></section>,document.body)}</>;
}
