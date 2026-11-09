'use strict';

const { abilities, skills } = require('./remote/character-rules');

// These fields are consumed by the player's sheet. New server fields stay private by default.
const fields = [
  'id', 'name', 'race', 'cls', 'subclass', 'level', 'xp', 'portrait',
  'hp', 'maxHp', 'tempHp', 'ac', 'speed', 'initiative', 'passivePerception',
  'eclipse', 'maxEclipse', 'stats', 'modifiers', 'saves', 'proficiencyBonus',
  'conditions', 'effects', 'inventory', 'money', 'abilities', 'spells',
  'resources', 'attacks', 'actions', 'spellSlots', 'hasSpellcasting',
  'spellcastingAbility', 'spellSaveDC', 'spellAttackBonus', 'spellSlotRecovery',
  'skillProficiencies', 'expertise', 'skillValues',
];
const itemFields = [
  'id', 'name', 'summary', 'description', 'image', 'type', 'quantity',
  'rarity', 'properties', 'maxUses', 'used', 'remaining', 'recovery',
  'attackBonus', 'damage', 'level', 'equipped', 'armorType',
];
const collections = new Set(['conditions', 'effects', 'inventory', 'abilities', 'spells', 'resources', 'attacks', 'actions']);
const abilityKeys = Object.keys(abilities);
const numericMaps = {
  stats: abilityKeys,
  modifiers: abilityKeys,
  saves: abilityKeys,
  skillValues: Object.keys(skills),
  money: ['cp', 'sp', 'ep', 'gp', 'pp'],
};
const scalar = value => ['string', 'number', 'boolean'].includes(typeof value) || value === null;

function itemView(item) {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object' || item.hidden || item.secret || item.masterOnly || item.visibility === 'master') return null;
  return Object.fromEntries(itemFields.filter(key => Object.hasOwn(item, key) && scalar(item[key])).map(key => [key, item[key]]));
}

module.exports = function characterView(character) {
  const result = {};
  for (const key of fields) {
    const value = character[key];
    if (value === undefined) continue;
    if (collections.has(key)) {
      result[key] = Array.isArray(value) ? value.map(itemView).filter(item => item !== null) : [];
    } else if (Object.hasOwn(numericMaps, key) && value && typeof value === 'object') {
      result[key] = Object.fromEntries(numericMaps[key].filter(field => Number.isFinite(value[field])).map(field => [field, value[field]]));
    } else if (key === 'spellSlots' && value && typeof value === 'object') {
      result[key] = Object.fromEntries(Object.entries(value).filter(([level]) => /^[1-9]$/.test(level))
        .map(([level, slot]) => [level, Object.fromEntries(['max', 'used'].filter(field => Number.isFinite(slot?.[field])).map(field => [field, slot[field]]))]));
    } else if (key === 'skillProficiencies' || key === 'expertise') {
      result[key] = Array.isArray(value) ? value.filter(entry => typeof entry === 'string' && Object.hasOwn(skills, entry)) : [];
    } else if (scalar(value)) result[key] = value;
  }
  return result;
};
