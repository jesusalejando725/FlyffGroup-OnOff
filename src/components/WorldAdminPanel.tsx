import { useEffect, useState } from 'react';
import { ITEM_CATALOG } from '../data/itemCatalog';
import { MU_MAPS } from '../data/muWorldData';
import {
  canonicalMap, invasionFields, mapKeys, monsterChoices, monsterFields, npcChoices,
  type GroupRule, type LiveWorld, type NpcRule, type WorldMap,
} from '../data/liveWorld';
import { INVASIONS } from '../data/worldInvasions';
import { publishWorldConfig, type WorldSession } from '../services/liveWorldService';

const labels: Record<string, string> = {
  hp: 'Vida', xp: 'Experiencia', damage: 'Daño base', zen: 'Zen', strength: 'Fuerza',
  agility: 'Agilidad', vitality: 'Vitalidad', energy: 'Energía', roamRadius: 'Radio de movimiento (m)',
  respawnSeconds: 'Reaparición (segundos)', count: 'Cantidad', attack: 'Multiplicador de daño',
  levels: 'Niveles', points: 'Puntos', pieces: 'Piezas de equipo', x: 'Coordenada X', z: 'Coordenada Z',
};
const fieldClass = 'block w-full p-2 rounded bg-slate-950 border border-slate-600 text-white';
const buttonClass = 'px-3 py-2 rounded border border-amber-600 text-amber-100';
const sortedMonsters = [...monsterChoices].sort((a, b) => a.name.localeCompare(b.name, 'es'));

function NumericFields<K extends string>({ fields, values, update, label }: {
  fields: Record<K, readonly [number, number]>;
  values: Partial<Record<NoInfer<K>, number>>;
  update: (key: K, value?: number) => void;
  label?: Partial<Record<K, string>>;
}) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
    {(Object.keys(fields) as K[]).map(key => <label key={key} className="text-sm">
      {label?.[key] ?? labels[key] ?? key}
      <input className={fieldClass} type="number" min={fields[key][0]} max={fields[key][1]}
        value={values[key] ?? ''} placeholder="Original"
        onChange={e => update(key, e.target.value === '' ? undefined : Number(e.target.value))} />
    </label>)}
  </div>;
}
const positionFields = { x: [40, 3032], z: [40, 3032] } as const;
const groupFields = { ...positionFields, count: [1, 16] } as const;

export function WorldAdminPanel({ initial, session, onClose, onPublished }: {
  initial: LiveWorld; session: WorldSession; onClose: () => void; onPublished: () => void;
}) {
  const [tab, setTab] = useState<'monsters' | 'npcs' | 'invasions'>('monsters');
  const [draft, setDraft] = useState(initial);
  const [monster, setMonster] = useState(sortedMonsters[0].id);
  const [npc, setNpc] = useState(npcChoices[0].id);
  const [invasion, setInvasion] = useState(INVASIONS[0].id);
  const [item, setItem] = useState(ITEM_CATALOG[0].id);
  const [editingGroup, setEditingGroup] = useState<number | null>(null);
  const [price, setPrice] = useState(0);
  const [group, setGroup] = useState<Partial<GroupRule>>({ map: 'flaris', count: 1 });
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState(false);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setExpired(true), Math.max(0, session.expires - Date.now()));
    return () => clearTimeout(timer);
  }, [session.expires]);
  const npcBase = npcChoices.find(choice => choice.id === npc)!;
  const npcRule: NpcRule = draft.npcs[npc] ?? { x: npcBase.x, z: npcBase.z };
  const npcUpdate = (patch: Partial<NpcRule>) => setDraft(d => ({ ...d, npcs: { ...d.npcs, [npc]: { ...npcRule, ...patch } } }));
  const sectionName = { monsters: 'Monstruos', npcs: 'NPC y tiendas', invasions: 'Eventos' };
  return <section role="dialog" aria-modal="true" aria-label="Administración del reino"
    className="fixed z-[100] inset-0 bg-black/90 overflow-auto p-3 sm:p-6 text-slate-100">
    <div className="realm-board mx-auto max-w-3xl p-4 sm:p-6 space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-display text-amber-200">Administración del reino</h1>
        <button className={buttonClass} type="button" onClick={onClose}>Volver al juego</button>
      </header>
      <nav className="flex flex-wrap gap-2">
        {(['monsters', 'npcs', 'invasions'] as const).map(value => <button type="button" key={value}
          className={buttonClass} aria-pressed={tab === value} onClick={() => setTab(value)}>{sectionName[value]}</button>)}
      </nav>

      {tab === 'monsters' && <>
        <label>Especie<select className={fieldClass} value={monster} onChange={e => setMonster(e.target.value)}>
          {sortedMonsters.map(choice => <option key={choice.id} value={choice.id}>{choice.name} · {choice.id}</option>)}
        </select></label>
        <NumericFields fields={monsterFields} values={draft.monsters[monster] ?? {}}
          update={(key, value) => setDraft(d => ({ ...d, monsters: { ...d.monsters, [monster]: { ...d.monsters[monster], [key]: value } } }))} />
        <p className="text-xs text-slate-300">La fuerza y la energía suman daño; la vitalidad suma vida y la agilidad mejora defensa y velocidad.</p>
        <h2 className="text-lg text-amber-200">Grupos en coordenadas exactas</h2>
        <label>Mapa del grupo<select className={fieldClass} value={group.map}
          onChange={e => setGroup(g => ({ ...g, map: e.target.value as WorldMap }))}>
          {mapKeys.map(key => <option key={key} value={key}>{MU_MAPS.find(map => map.id === key)?.name}</option>)}
        </select></label>
        <NumericFields fields={groupFields} values={{ x: group.x, z: group.z, count: group.count }} update={(key, value) => setGroup(g => ({ ...g, [key]: value }))} />
        <button className={buttonClass} type="button" onClick={() => {
          if (!group.map || group.x === undefined || group.z === undefined || group.count === undefined) {
            setStatus('Completa las coordenadas y la cantidad.'); return;
          }
          setStatus('');
          const row = { ...group, monsterId: monster } as GroupRule;
          setDraft(d => ({ ...d, groups: editingGroup === null ? [...d.groups, row] :
            d.groups.map((old, index) => index === editingGroup ? row : old) }));
          setEditingGroup(null);
        }}>{editingGroup === null ? 'Añadir grupo' : 'Actualizar grupo'}</button>
        <ul className="space-y-2">{draft.groups.map((row, index) => <li key={index} className="flex flex-wrap gap-2 items-center">
          {sortedMonsters.find(c => c.id === row.monsterId)?.name} ×{row.count} · {row.map} ({row.x}, {row.z})
          <button type="button" className="underline" onClick={() => { setGroup(row); setMonster(row.monsterId); setEditingGroup(index); }}>Editar</button>
          <button type="button" className="underline" onClick={() => { setEditingGroup(null); setDraft(d => ({ ...d, groups: d.groups.filter((_, i) => i !== index) })); }}>Quitar</button>
        </li>)}</ul>
      </>}

      {tab === 'npcs' && <>
        <label>NPC<select className={fieldClass} value={npc} onChange={e => setNpc(e.target.value)}>
          {npcChoices.map(choice => <option key={choice.id} value={choice.id}>{choice.name} · {choice.mapId}</option>)}
        </select></label>
        <label>Mapa del NPC<select className={fieldClass} value={npcRule.mapId ?? canonicalMap(npcBase.mapId)}
          onChange={e => npcUpdate({ mapId: e.target.value as WorldMap })}>
          {mapKeys.map(key => <option key={key} value={key}>{MU_MAPS.find(map => map.id === key)?.name}</option>)}
        </select></label>
        <label>Nombre<input className={fieldClass} value={npcRule.name ?? npcBase.name} maxLength={72}
          onChange={e => npcUpdate({ name: e.target.value })} /></label>
        <NumericFields fields={positionFields} values={{ x: npcRule.x, z: npcRule.z }} update={(key, value) => npcUpdate({ [key]: value ?? npcBase[key] })} />
        <h2 className="text-lg text-amber-200">Productos de la tienda</h2>
        <p className="text-xs text-slate-300">Cuando configuras productos, la lista reemplaza la oferta original de este NPC.</p>
        <label>Producto<select className={fieldClass} value={item} onChange={e => setItem(e.target.value)}>
          {ITEM_CATALOG.map(choice => <option key={choice.id} value={choice.id}>{choice.name}</option>)}
        </select></label>
        <label>Precio en Zen<input className={fieldClass} type="number" min={0} max={1e8} value={price}
          onChange={e => setPrice(e.target.valueAsNumber)} /></label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass} onClick={() => npcUpdate({ stock: { ...npcRule.stock, [item]: price } })}>Guardar precio en borrador</button>
          <button type="button" className={buttonClass} onClick={() => npcUpdate({ stock: undefined })}>Restaurar oferta original</button>
        </div>
        <ul>{Object.entries(npcRule.stock ?? {}).map(([id, zen]) => <li key={id}>
          {ITEM_CATALOG.find(choice => choice.id === id)?.name} · {zen} Zen
          <button type="button" className="ml-2 underline" onClick={() => {
            const stock = { ...npcRule.stock }; delete stock[id]; npcUpdate({ stock });
          }}>Quitar</button>
        </li>)}</ul>
      </>}

      {tab === 'invasions' && <>
        <label>Jefe<select className={fieldClass} value={invasion} onChange={e => setInvasion(e.target.value)}>
          {INVASIONS.map(choice => <option key={choice.id} value={choice.id}>{choice.name} · {choice.map}</option>)}
        </select></label>
        <label>Mapa del evento<select className={fieldClass} value={draft.invasions[invasion]?.map ?? ''}
          onChange={e => {
            const map = (e.target.value || undefined) as WorldMap | undefined;
            setDraft(d => ({ ...d, invasions: { ...d.invasions, [invasion]: { ...d.invasions[invasion], map } } }));
          }}>
          <option value="">Mapa original</option>
          {mapKeys.map(key => <option key={key} value={key}>{MU_MAPS.find(map => map.id === key)?.name}</option>)}
        </select></label>
        <NumericFields fields={{ ...invasionFields, ...positionFields }} label={{ hp: 'Multiplicador de vida' }}
          values={draft.invasions[invasion] ?? {}} update={(key, value) => setDraft(d => ({ ...d,
            invasions: { ...d.invasions, [invasion]: { ...d.invasions[invasion], [key]: value } },
          }))} />
        <p className="text-xs text-slate-300">Deja ambas coordenadas vacías para conservar las ubicaciones variables del evento.</p>
      </>}

      <button className={buttonClass} type="button" disabled={pending || expired} onClick={async () => {
        setPending(true); setStatus('');
        try {
          // Omit empty fields so a cleared input restores its original value.
          const published = await publishWorldConfig(JSON.parse(JSON.stringify(draft)), session.token);
          setDraft(published); setStatus('Cambios publicados. El mundo activo se reiniciará al recibirlos.');
          onPublished();
        } catch (error) { setStatus(error instanceof Error ? error.message : 'No se publicaron los cambios.'); }
        finally { setPending(false); }
      }}>{pending ? 'Guardando…' : 'Guardar y resetear mundo'}</button>
      <button className={buttonClass} type="button" disabled={pending || expired} onClick={() => {
        const href = URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)+'\n'],{type:'application/json'}));
        const link = document.createElement('a');
        link.href = href;
        link.download = 'live-world.json';
        link.click();
        setTimeout(()=>URL.revokeObjectURL(href),1000);
      }}>Exportar configuración para Git</button>
      <p role="status">{expired ? 'Sesión vencida. Vuelve a iniciar sesión.' : status}</p>
    </div>
  </section>;
}
