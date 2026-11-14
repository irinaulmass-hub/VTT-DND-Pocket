const { test } = require('node:test');
const assert = require('node:assert/strict');
const view = require('../character-view');

test('player projection excludes master fields and nested secret entries while keeping sheet data', () => {
  const character = {
    id: 'hero', hp: 12, eclipse: 3, notes: 'Private', futureServerField: 'Private',
    stats: { str: 15, notes: 'Private', hiddenCount: 99 },
    money: { gp: 10, hiddenCount: 99 },
    skillValues: { arcana: 2, hiddenCount: 99 },
    inventory: [{ name: 'Key', quantity: 1, description: 'Brass', notes: 'Private' }, { name: 'Secret', hidden: true }],
    abilities: [{ name: 'Heal', maxUses: 2, used: 1, description: 'Restore HP', masterNotes: 'Private' }],
    spellSlots: { 1: { max: 2, used: 1, notes: 'Private' }, notes: 'Private' },
  };
  const original = JSON.stringify(character);
  assert.deepEqual(view(character), {
    id: 'hero', hp: 12, eclipse: 3, stats: { str: 15 },
    money: { gp: 10 },
    skillValues: { arcana: 2 },
    inventory: [{ name: 'Key', quantity: 1, description: 'Brass' }],
    abilities: [{ name: 'Heal', description: 'Restore HP', maxUses: 2, used: 1 }],
    spellSlots: { 1: { max: 2, used: 1 } },
  });
  assert.equal(JSON.stringify(character), original);
  assert.ok(!JSON.stringify(view(character)).includes('Private'));
});
