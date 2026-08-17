import assert from 'node:assert/strict';
import test from 'node:test';

import { add, subtract, multiply } from './sum.js';

test('add works', () => {
  assert.equal(add(2, 3), 5);
});

test('subtract works', () => {
  assert.equal(subtract(5, 3), 2);
});

test('multiply works', () => {
  assert.equal(multiply(2, 3), 6);
});
