import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inventorySellValue } from '../src/data/itemPricing.ts';

test('shop sale values preserve the existing inventory payment rules', () => {
  assert.equal(inventorySellValue({ rarity: 'normal', enhanceLevel: 0 }), 550);
  assert.equal(inventorySellValue({ rarity: 'excellent', enhanceLevel: 6 }), 2620);
  assert.equal(inventorySellValue({ rarity: 'ancient', enhanceLevel: 13 }), 5010);
});
