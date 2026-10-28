import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function fixture(browser = true) {
  const listeners = new Map();
  const removed = [];
  let dispose;
  const window = {
    addEventListener(type, callback, capture) { assert.equal(capture, true); listeners.set(type, callback); },
    removeEventListener(type, callback, capture) {
      assert.equal(capture, true);
      assert.equal(listeners.get(type), callback);
      removed.push(type); listeners.delete(type);
    },
  };
  const source = readFileSync(new URL('../src/utils/documentNavigationGuards.ts', import.meta.url), 'utf8')
    .replaceAll('import.meta.hot', 'hot');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023,
  } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports,
    ...(browser ? { window } : {}), hot: { dispose(callback) { dispose = callback; } },
  });
  return { register: module.exports.registerDocumentNavigationGuard, listeners, removed,
    dispatch(type, event) { listeners.get(type)?.(event); }, dispose() { dispose?.(); } };
}

test('capture listeners install immediately and forward the original history event only to mounted guards', () => {
  const f = fixture(); const calls = []; const event = { type: 'popstate' };
  assert.deepEqual([...f.listeners.keys()], ['popstate', 'hashchange']);
  f.dispatch('popstate', event); assert.equal(calls.length, 0);
  f.register('drafting', value => calls.push(value));
  f.dispatch('popstate', event); f.dispatch('hashchange', event);
  assert.equal(calls.length, 2); assert.ok(calls.every(value => value === event));
});

test('replacement cleanup cannot remove the current editor guard and unmount removes callbacks', () => {
  const f = fixture(); const calls = [];
  const stopOld = f.register('drafting', () => calls.push('old'));
  const stopNew = f.register('drafting', () => calls.push('new'));
  stopOld(); f.dispatch('popstate', {}); assert.deepEqual(calls, ['new']);
  stopNew(); stopNew(); f.dispatch('hashchange', {}); assert.deepEqual(calls, ['new']);
});

test('template and drafting lifecycle callbacks are independent', () => {
  const f = fixture(); const calls = [];
  const stopTemplate = f.register('template', () => calls.push('template'));
  f.register('drafting', () => calls.push('drafting'));
  stopTemplate(); f.dispatch('hashchange', {}); assert.deepEqual(calls, ['drafting']);
});

test('hot replacement removes both capture listeners and clears mounted callbacks', () => {
  const f = fixture(); const calls = [];
  f.register('drafting', () => calls.push('stale'));
  const retainedListener = f.listeners.get('popstate');
  f.dispose(); retainedListener({});
  assert.deepEqual(f.removed, ['popstate', 'hashchange']);
  assert.equal(f.listeners.size, 0); assert.deepEqual(calls, []);
});

test('module can be evaluated without a browser', () => {
  const f = fixture(false);
  assert.equal(f.listeners.size, 0);
  const stop = f.register('template', () => {}); assert.doesNotThrow(stop);
});
