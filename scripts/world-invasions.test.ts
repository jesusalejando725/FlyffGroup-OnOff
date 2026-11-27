import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invasionWindow, invasionSites, INVASIONS, INVASION_DURATION } from '../src/data/worldInvasions.ts';
test('all invasions have reproducible offline windows, expire after 80 minutes and place every boss outside the capital', () => {
  const day=Date.UTC(2026,10,24);
  for (const e of INVASIONS) {
    const {start,end}=invasionWindow(e,day);
    assert.equal(end-start,80*60000); assert.equal(INVASION_DURATION,end-start);
    assert.equal(invasionWindow(e,start-1).active,false);
    assert.equal(invasionWindow(e,start).active,true);assert.equal(invasionWindow(e,end-1).active,true);
    const next=invasionWindow(e,end);assert.equal(next.active,false);assert.ok(next.next>end);
    const safe=(x:number,z:number)=>Math.hypot(x-1200,z-1200)<550;
    const coords=invasionSites(e,start,3072,safe);
    assert.equal(coords.length,e.count);assert.equal(new Set(coords.map(p=>p.x+','+p.z)).size,e.count);
    assert.ok(coords.every(p=>!safe(p.x,p.z)));assert.deepEqual(coords,invasionSites(e,start,3072,safe));
    assert.notDeepEqual(coords,invasionSites(e,next.next,3072,safe));
  }
  assert.deepEqual(INVASIONS.map(e=>[e.map,e.count,e.hp,e.attack,e.zen,e.levels,e.points,e.pieces]),[
    ['flaris',10,21,6,100000,10,2000,2],['robledal',10,42,12,100000,10,1000,4],
    ['puerto_bruma',6,126,36,130000,15,1500,6],['crater_ceniza',1,1260,180,250000,25,2500,10],
    ['crater_ceniza',5,630,72,150000,23,1500,7]]);
});
