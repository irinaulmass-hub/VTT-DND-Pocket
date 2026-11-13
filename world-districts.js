'use strict';

const { isDeepStrictEqual } = require('node:util');
const { createHmac, randomBytes } = require('node:crypto');
const { get } = require('./remote/world-model');
const { validGenerators, generationChange } = require('./remote/world-generators');

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const fields = (value, names) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const validRecipe = recipe => fields(recipe, ['id', 'kind', 'version', 'seed', 'params']) &&
  recipe.kind === 'district' && validGenerators([recipe]);
const normalizeObjects = objects => objects.map(({ id, kind, x, y, turn, hidden }) =>
  ({ id, kind, x, y, turn, hidden: hidden === true }));
// Ownership markers may change during normal manual edits without regenerating a district.
const definitions = map => (map.generators || []).filter(recipe => recipe.kind === 'district').map(recipe => ({
  id: recipe.id, version: recipe.version, seed: recipe.seed, params: recipe.params,
  tiles: recipe.state?.tiles, objects: recipe.state?.objects,
})).sort((a, b) => a.id.localeCompare(b.id));

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ?
  Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

module.exports = function createWorldDistricts(movement, scope = () => '') {
  // Browser history is session-local. No extra save file or persistent signing key is needed.
  const historyKey = randomBytes(32);
  const proof = (source, snapshot) => createHmac('sha256', historyKey).update(JSON.stringify([
    scope(), source.id, canonical({ chunks: snapshot.chunks, objects: normalizeObjects(snapshot.objects), generators: snapshot.generators || [] }),
  ])).digest('hex');
  function generate(recipe, source, context) {
    try { return generationChange(recipe, source, context); }
    catch (error) {
      if (!(error instanceof RangeError)) throw error;
      fail(409, error.message);
    }
  }

  return {
    preview(source, body) {
      if (!fields(body, ['revision', 'recipe']) || !Number.isSafeInteger(body.revision) || body.revision < 0 ||
          !validRecipe(body.recipe)) fail(400, 'Проверь ревизию и параметры района.');
      if (source.revision !== body.revision) fail(409, 'Черновик изменён. Открой актуальную карту перед предпросмотром.');
      const context = movement.districtContext(source);
      const change = generate(body.recipe, source, context);
      const after = { chunks: change.chunks, objects: change.objects?.after || source.objects, generators: change.generators.after };
      return { change, history: { before: proof(source, source), after: proof(source, after) },
        guard: { recipe: body.recipe, revision: source.revision, linksRevision: context.linksRevision } };
    },
    verifySave(source, next, guard) {
      const changed = !isDeepStrictEqual(definitions(source), definitions(next));
      if (guard === undefined) {
        // Older callers remain compatible on maps without bound transitions.
        if (changed && movement.districtContext(source).hasBindings) {
          fail(409, 'Для изменения района со связанными постройками нужен актуальный защищённый предпросмотр.');
        }
        return;
      }
      const restoring = fields(guard, ['historyProof', 'revision', 'linksRevision']);
      if ((!restoring && (!fields(guard, ['recipe', 'revision', 'linksRevision']) || !validRecipe(guard.recipe))) ||
          (restoring && (typeof guard.historyProof !== 'string' || !/^[a-f0-9]{64}$/.test(guard.historyProof))) ||
          !Number.isSafeInteger(guard.revision) || guard.revision < 0 ||
          typeof guard.linksRevision !== 'string' || !/^[a-f0-9]{64}$/.test(guard.linksRevision)) {
        fail(400, 'Некорректная версия предпросмотра района.');
      }
      if (guard.revision !== source.revision) fail(409, 'Карта изменилась после предпросмотра. Повтори генерацию.');
      const context = movement.districtContext(source);
      if (guard.linksRevision !== context.linksRevision) fail(409, 'Переходы изменились. Повтори предпросмотр района.');
      if (restoring) {
        if (proof(source, next) !== guard.historyProof) fail(409, 'История района устарела или изменена. Открой карту заново.');
        movement.districtContext(next);
        if (context.reservedCells.some(cell => get(source.chunks, cell.x, cell.y) !== get(next.chunks, cell.x, cell.y))) {
          fail(409, 'Отмена изменит клетку связанного перехода. Сначала проверь его связь.');
        }
        return;
      }
      const change = generate(guard.recipe, source, context);
      if (!isDeepStrictEqual(next.chunks, change.chunks) ||
          !isDeepStrictEqual(normalizeObjects(next.objects), normalizeObjects(change.objects?.after || source.objects)) ||
          !isDeepStrictEqual(next.generators, change.generators.after)) {
        fail(409, 'Карта отличается от защищённого предпросмотра. Сохрани ручные правки отдельно и повтори генерацию.');
      }
    },
  };
};
