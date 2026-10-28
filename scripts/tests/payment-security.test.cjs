const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../../client/node_modules/typescript');
const root = path.resolve(__dirname, '../..');
const clone = value => JSON.parse(JSON.stringify(value));

function fixture({ fail = false, defer = false, component = 'HostedPayPalCheckout' } = {}) {
  const source = fs.readFileSync(path.join(root, 'client/src/pages/SubscriptionManagement.tsx'), 'utf8').replace('const HostedPayPalCheckout:', 'export const HostedPayPalCheckout:');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const hooks = [], calls = [];
  let index = 0, result, failRequest = fail, resolveCall;
  const store = { userData: { uid: 'admin', role: 'ADMIN', companyId: 'tenant-a', status: 'ACTIVE', mustChangePassword: false },
    companyData: { id: 'tenant-a', status: 'ACTIVE', createdAt: '2026-10-24T00:00:00.000Z' } };
  const react = {
    useState(initial) { const i = index++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial; return [hooks[i], value => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }]; },
    useRef(initial) { const i = index++; return hooks[i] ||= { current: initial }; },
  };
  react.default = react;
  const primitiveComponents = new Set();
  const element = (type, props, key) => primitiveComponents.has(type)
    ? type(props || {})
    : { type, props: props || {}, key };
  react.createElement = element;
  const primitivesPath = path.join(root, 'client/src/components/ui/index.tsx');
  const primitivesCode = ts.transpileModule(fs.readFileSync(primitivesPath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const primitives = { exports: {} };
  vm.runInNewContext(primitivesCode, {
    module: primitives, exports: primitives.exports,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: element, jsxs: element };
      throw new Error('unexpected UI module ' + name);
    },
  }, { filename: primitivesPath });
  Object.values(primitives.exports).forEach(component => primitiveComponents.add(component));
  const useAuthStore = () => store; useAuthStore.getState = () => store;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, Set, Date, Error,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: element, jsxs: element };
      if (name === 'lucide-react') return {};
      if (name === '../components/ui') return primitives.exports;
      if (name === './SubscriptionManagement.css') return {};
      if (name === '../firebase') return { functions: {} };
      if (name === '../store/authStore') return { useAuthStore };
      if (name === '../utils/roleDisplay') {
        const helperPath = path.join(root, 'client/src/utils/roleDisplay.ts');
        const helperCode = ts.transpileModule(fs.readFileSync(helperPath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
        const helper = { exports: {} };
        vm.runInNewContext(helperCode, { module: helper, exports: helper.exports }, { filename: helperPath });
        return helper.exports;
      }
      if (name === 'firebase/functions') return { httpsCallable(_functions, action) { return async payload => { calls.push({ action, payload: clone(payload) }); if (defer) await new Promise(resolve => { resolveCall = resolve; }); if (failRequest) throw new Error('local request failure'); return { data: { success: true } }; }; } };
      throw new Error('unexpected module ' + name);
    },
  });
  const render = () => { index = 0; result = module.exports[component]({ uid: 'admin', companyId: 'tenant-a' }); return result; };
  render();
  return { store, calls, render, get result() { return result; }, set failure(value) { failRequest = value; }, resolve() { resolveCall?.(); },
    enter(value) { nodes(result, 'input')[0].props.onChange({ target: { value } }); render(); },
    async submit() { const pending = nodes(result, 'form')[0].props.onSubmit({ preventDefault() {} }); return pending; },
  };
}
function nodes(element, type, found = []) {
  if (!element || typeof element !== 'object') return found;
  if (element.type === type || element.type?.name === type) found.push(element);
  Object.values(element.props || {}).forEach(value => Array.isArray(value) ? value.forEach(item => nodes(item, type, found)) : nodes(value, type, found));
  return found;
}

test('hosted PayPal checkout and manual transaction verification', async t => {
  await t.test('main application loads no third-party checkout SDK or isolated payment artifacts', () => {
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'client/index.html'), 'utf8'), /paypal|payment-frame/i);
    assert.equal(fs.existsSync(path.join(root, 'client/payment.html')), false);
    assert.equal(fs.existsSync(path.join(root, 'client/public/payment-frame.js')), false);
    const source = fs.readFileSync(path.join(root, 'client/src/pages/SubscriptionManagement.tsx'), 'utf8');
    assert.doesNotMatch(source, /window\.paypal|HostedButtons|postMessage|<iframe|updateDoc|setDoc/);
  });
  await t.test('official fixed hosted checkout opens a separate tab without referrer or opener', () => {
    const f = fixture(); const link = nodes(f.result, 'a')[0].props;
    assert.equal(link.href, 'https://www.paypal.com/ncp/payment/36DMV6NKPEZYW');
    assert.equal(link.target, '_blank'); assert.equal(link.rel, 'noopener noreferrer'); assert.equal(link.referrerPolicy, 'no-referrer');
    assert.ok(!/[?&](company|uid|email|token)/i.test(link.href));
  });
  await t.test('only matching company ADMIN with changed initial password receives checkout controls', () => {
    for (const extra of [{ role: 'MEMBER' }, { role: 'SUB_ADMIN' }, { role: 'SUPER_ADMIN' }, { mustChangePassword: true }, { companyId: 'other' }]) {
      const f = fixture({ component: 'SubscriptionManagement' }); Object.assign(f.store.userData, extra); f.render();
      assert.equal(nodes(f.result, 'HostedPayPalCheckout').length, 0);
    }
    const ready = fixture({ component: 'SubscriptionManagement' }); assert.equal(nodes(ready.result, 'HostedPayPalCheckout').length, 1);
  });
  await t.test('identity and company changes remount the form with a fresh React key', () => {
    const f = fixture({ component: 'SubscriptionManagement' }); const key = nodes(f.result, 'HostedPayPalCheckout')[0].key;
    f.store.userData.uid = 'new-admin'; f.render(); assert.notEqual(nodes(f.result, 'HostedPayPalCheckout')[0].key, key);
    f.store.userData.companyId = 'tenant-b'; f.store.companyData.id = 'tenant-b'; f.render();
    assert.equal(nodes(f.result, 'HostedPayPalCheckout')[0].key, 'new-admin:tenant-b');
  });
  await t.test('invalid transaction IDs never call the server and input remains available', async () => {
    for (const order of ['', 'short', '<script>', 'A'.repeat(81), 'with space']) {
      const f = fixture(); f.enter(order); await f.submit(); f.render(); assert.equal(f.calls.length, 0);
      assert.equal(nodes(f.result, 'input')[0].props.value, order); assert.equal(nodes(f.result, 'p').some(node => node.props.role === 'alert'), true);
    }
  });
  await t.test('validated transaction requests manual confirmation without granting subscription access', async () => {
    const f = fixture(); f.enter('  ORDER_123456  '); await f.submit(); f.render();
    assert.deepEqual(f.calls, [{ action: 'accountSecurity', payload: { action: 'submitPaymentClaim', orderId: 'ORDER_123456' } }]);
    assert.equal(f.store.companyData.subscriptionStatus, undefined);
    assert.equal(nodes(f.result, 'p').some(node => node.props.role === 'status'), true);
  });
  await t.test('failed request retains input and retries exactly the same transaction', async () => {
    const f = fixture({ fail: true }); f.enter('ORDER_123456'); await f.submit(); f.render();
    assert.equal(nodes(f.result, 'input')[0].props.value, 'ORDER_123456');
    assert.equal(nodes(f.result, 'button')[0].props.children, '결제 확인 요청 다시 보내기');
    f.failure = false; await f.submit(); assert.equal(f.calls.length, 2); assert.deepEqual(f.calls[0], f.calls[1]);
  });
  await t.test('concurrent double submission and repeated successful transaction are deduplicated', async () => {
    const f = fixture({ defer: true }); f.enter('ORDER_123456'); const pending = f.submit(); const duplicate = f.submit();
    assert.equal(f.calls.length, 1); f.resolve(); await Promise.all([pending, duplicate]); f.render();
    assert.equal(nodes(f.result, 'button')[0].props.disabled, true); await f.submit(); assert.equal(f.calls.length, 1);
    f.enter('ORDER_123456 '); await f.submit(); assert.equal(f.calls.length, 1);
  });
  await t.test('changed identity, role, company, status or initial password state clears stale input and blocks request', async () => {
    for (const extra of [{ uid: 'other' }, { role: 'SUB_ADMIN' }, { companyId: 'other' }, { status: 'RESIGNED' }, { mustChangePassword: true }]) {
      const f = fixture(); f.enter('ORDER_123456'); Object.assign(f.store.userData, extra); await f.submit(); f.render();
      assert.equal(f.calls.length, 0); assert.equal(nodes(f.result, 'input')[0].props.value, '');
    }
    const f = fixture(); f.enter('ORDER_123456'); f.store.companyData.status = 'SUSPENDED'; await f.submit(); assert.equal(f.calls.length, 0);
  });
});
