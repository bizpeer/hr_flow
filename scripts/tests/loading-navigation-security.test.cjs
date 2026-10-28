const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../../client/node_modules/typescript');

function compile(file, replace = source => source) {
  return ts.transpileModule(replace(fs.readFileSync(path.resolve(__dirname, '../../client/src', file), 'utf8')), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}

function boundaryFixture() {
  let location = { pathname: '/drafting', search: '?letter=private-a' }, reloads = 0;
  const updates = [];
  class Component {
    constructor(props) { this.props = props; }
    setState(update) { updates.push(update); this.state = { ...this.state, ...update }; }
  }
  const jsx = (type, props, key) => ({ type, props, key });
  const module = { exports: {} };
  vm.runInNewContext(compile('components/RouteContent.tsx'), {
    module, exports: module.exports,
    window: { location: { reload() { reloads++; } } },
    require(name) {
      if (name === 'react') return { Component, Suspense: 'Suspense' };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'react-router-dom') return { useLocation: () => location };
      if (name === 'lucide-react') return { Loader2: 'Loader2', RefreshCw: 'RefreshCw' };
      if (name.endsWith('.css')) return {};
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  const render = (fullPage = false) => module.exports.RouteContent({ children: { private: true }, fullPage });
  const node = render(), boundary = new node.type(node.props);
  return { render, boundary, updates, setLocation(value) { location = value; }, get reloads() { return reloads; } };
}

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
}

test('route loading exposes an accessible pending state without triggering navigation', () => {
  const fixture = boundaryFixture();
  const suspense = fixture.boundary.render();
  const fallback = suspense.props.fallback;
  const pending = fallback.type(fallback.props);
  assert.equal(pending.props.role, 'status');
  assert.equal(pending.props['aria-live'], 'polite');
  assert.equal(pending.props['aria-busy'], 'true');
  assert.equal(nodes(pending).find(node => node.type === 'p').props.children, '화면을 불러오는 중입니다.');
  assert.equal(fixture.reloads, 0);
});

test('chunk/render errors require an explicit button click and never start an automatic reload loop', () => {
  const fixture = boundaryFixture(), boundary = fixture.boundary;
  boundary.state = boundary.constructor.getDerivedStateFromError(new Error('private server detail'));
  for (let count = 0; count < 5; count++) {
    const failure = boundary.render();
    assert.equal(failure.props.role, 'alert');
    assert.ok(!JSON.stringify(failure).includes('private server detail'));
    boundary.componentDidUpdate(boundary.props);
  }
  assert.equal(fixture.reloads, 0);
  const button = nodes(boundary.render()).find(node => node.type === 'button');
  assert.equal(button.props.type, 'button');
  button.props.onClick();
  assert.equal(fixture.reloads, 1);
});

test('query updates keep a failed document boundary stable while a different route clears its error', () => {
  const fixture = boundaryFixture(), boundary = fixture.boundary;
  boundary.state = boundary.constructor.getDerivedStateFromError();
  const previous = boundary.props;
  fixture.setLocation({ pathname: '/drafting', search: '?letter=private-b&notification=next' });
  boundary.props = fixture.render().props;
  boundary.componentDidUpdate(previous);
  assert.equal(boundary.state.failed, true);
  assert.equal(fixture.updates.length, 0);
  const samePath = boundary.props;
  fixture.setLocation({ pathname: '/expense', search: '' });
  boundary.props = fixture.render().props;
  boundary.componentDidUpdate(samePath);
  assert.equal(boundary.state.failed, false);
  assert.equal(fixture.updates.length, 1);
  assert.equal(fixture.reloads, 0);
  assert.equal(boundary.render(), boundary.props.children);
});

test('healthy route changes preserve the existing boundary state without reset effects', () => {
  const fixture = boundaryFixture(), boundary = fixture.boundary;
  const previous = boundary.props;
  fixture.setLocation({ pathname: '/documents', search: '?letter=next' });
  boundary.props = fixture.render().props;
  boundary.componentDidUpdate(previous);
  assert.equal(boundary.state.failed, false);
  assert.equal(fixture.updates.length, 0);
  assert.equal(fixture.reloads, 0);
});

test('page transitions replace pending content while query links and the outer workspace keep their suspense identity', () => {
  const fixture = boundaryFixture();
  const first = fixture.render().props.children;
  assert.equal(first.key, '/drafting');
  assert.equal(fixture.render(true).props.children.key, undefined);
  fixture.setLocation({ pathname: '/drafting', search: '?letter=next&notification=next' });
  assert.equal(fixture.render().props.children.key, first.key);
  assert.equal(fixture.render(true).props.children.key, undefined);
  fixture.setLocation({ pathname: '/admin/settings', search: '' });
  assert.equal(fixture.render().props.children.key, '/admin/settings');
  assert.notEqual(fixture.render().props.children.key, first.key);
  assert.equal(fixture.render(true).props.children.key, undefined);
});
