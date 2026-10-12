import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productSearchTsQuery } from './src/common/product-search';

test('fracciones: igual que antes', () => {
  assert.equal(productSearchTsQuery('llave 1/2'), 'llave:* & 1f2:*');
});

test('medidas NxM: pegadas o con espacios dan el mismo token exacto', () => {
  assert.equal(productSearchTsQuery('tubo 2x1'), 'tubo:* & 2x1');
  assert.equal(productSearchTsQuery('tubo 2 x 1'), 'tubo:* & 2x1');
  assert.equal(productSearchTsQuery('Breaker 2X20'), 'breaker:* & 2x20');
  assert.equal(productSearchTsQuery('tubo 3x1-1/2'), 'tubo:* & 3x1 & 1f2:*');
});

test('no confunde fracciones con medidas', () => {
  assert.equal(productSearchTsQuery('llave 1/2 x 3/4'), 'llave:* & 1f2:* & x:* & 3f4:*');
  assert.equal(productSearchTsQuery('cable x mts'), 'cable:* & x:* & mts:*');
});
