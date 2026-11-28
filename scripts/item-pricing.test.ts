import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inventorySellValue } from '../src/data/itemPricing.ts';

test('shop sale values preserve the existing inventory payment rules', () => {
  assert.equal(inventorySellValue({ rarity: 'normal', enhanceLevel: 0 }), 550);
  assert.equal(inventorySellValue({ rarity: 'excellent', enhanceLevel: 6 }), 2620);
  assert.equal(inventorySellValue({ rarity: 'ancient', enhanceLevel: 13 }), 5010);
});

test('bulk consumables sell for the sum of their units', () => {
  const pack = {slot:'consumable',rarity:'normal',enhanceLevel:0} as const;
  assert.equal(inventorySellValue({...pack,quantity:100}),100*inventorySellValue(pack));
  assert.ok(inventorySellValue({...pack,quantity:100}) < 1400);
});

test('late equipment checks level and all five attributes, including command', async () => {
  const {canEquip,equipmentRequirements}=await import('../src/data/equipmentRules.ts');
  const item={name:'Wing of Doom',slot:'wings',requiredLevel:99,enhanceLevel:0} as const;
  const req=equipmentRequirements(item);
  const wearer={...req,classType:'DK',sex:'male'} as import('../src/types/game.ts').MuCharacter;
  assert.ok(canEquip(wearer,item));
  for (const key of Object.keys(req) as (keyof typeof req)[]) {
    assert.equal(canEquip({...wearer,[key]:req[key]-1},item),false,key);
  }
});

test('legacy wings retain their identity, upgrades and options when converted', async () => {
  const {restoreEquipment}=await import('../src/data/madrigalEquipment.ts');
  const old={id:'saved',name:'Wing of Storm +13',slot:'wings',enhanceLevel:13,lifeOptions:['str'],isEquipped:false} as import('../src/types/game.ts').MuItem;
  const next=restoreEquipment(old,'DK','male');
  assert.deepEqual(next,{...old,name:'Wing of Doom',setName:'Madrigal'});
  assert.deepEqual(restoreEquipment(next,'DK','male'),next);
});
