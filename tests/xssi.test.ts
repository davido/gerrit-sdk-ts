import { test } from 'node:test';
import assert from 'node:assert';
import { strip } from '../xssi';

test('strips the guard', () => {
  assert.equal(strip(")]}'\n{\"id\":1}"), '{"id":1}');
});

test('passes through bodies without the guard', () => {
  assert.equal(strip('{"id":1}'), '{"id":1}');
  assert.equal(strip('plain text'), 'plain text');
  assert.equal(strip(''), '');
});
