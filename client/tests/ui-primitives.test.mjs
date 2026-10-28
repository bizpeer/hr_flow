import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const componentPath = fileURLToPath(new URL('../src/components/ui/index.tsx', import.meta.url));
const source = readFileSync(componentPath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports, require }, { filename: componentPath });
const { Button, Input, Select, Textarea, Panel, StatusBadge, PageTitle, PageHeading } = module.exports;

const markup = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const withoutClass = html => html.replace(/ class="[^"]*"/g, '');

test('form controls retain native HTML, field values, validation, labels, and disabled states', () => {
  const fixtures = [
    [Button, 'button', { type: 'submit', name: 'intent', value: 'save', form: 'editor', disabled: true, 'aria-label': '저장', children: '저장' }],
    [Input, 'input', { id: 'amount', name: 'amount', type: 'number', value: 1200, min: 0, max: 5000, step: 100, required: true, readOnly: true, 'aria-describedby': 'amount-help' }],
    [Input, 'input', { id: 'attachment', type: 'file', accept: '.pdf', multiple: true, disabled: true }],
    [Select, 'select', { name: 'team', value: 'b', required: true, disabled: true, onChange() {}, children: [React.createElement('option', { key: 'a', value: 'a' }, 'A'), React.createElement('option', { key: 'b', value: 'b' }, 'B')] }],
    [Textarea, 'textarea', { name: 'reason', value: '휴가 사유\n다음 줄', rows: 4, minLength: 2, maxLength: 1000, required: true, onChange() {} }],
  ];
  for (const [component, tag, props] of fixtures) {
    assert.equal(withoutClass(markup(component, props)), markup(tag, props), tag);
  }
});

test('buttons preserve the browser submit default and all explicit button types', () => {
  for (const type of [undefined, 'submit', 'button', 'reset']) {
    const props = { name: 'intent', value: 'approve', ...(type ? { type } : {}), children: '처리' };
    const actual = renderToStaticMarkup(React.createElement('form', { id: 'approval' }, React.createElement(Button, props)));
    const expected = renderToStaticMarkup(React.createElement('form', { id: 'approval' }, React.createElement('button', props)));
    assert.equal(withoutClass(actual), expected);
    if (!type) assert.doesNotMatch(actual, /type=/);
  }
});

test('refs, event callbacks, ARIA, and controlled values reach the native element unchanged', () => {
  const callback = () => {};
  const ref = { current: null };
  for (const [component, tag] of [[Button, 'button'], [Input, 'input'], [Select, 'select'], [Textarea, 'textarea'], [StatusBadge, 'span'], [PageTitle, 'h1'], [PageHeading, 'header']]) {
    const props = { ref, onClick: callback, onChange: callback, onInvalid: callback, 'aria-busy': true, 'data-testid': tag, value: 'controlled', disabled: true };
    const element = component(props);
    assert.equal(element.type, tag);
    for (const [key, value] of Object.entries(props)) assert.equal(element.props[key], value, `${tag}.${key}`);
    const callbackRef = component({ ref: callback });
    assert.equal(callbackRef.props.ref, callback);
  }
});

test('panels preserve semantic elements, refs, children, and native attributes without a wrapper', () => {
  for (const tag of ['div', 'section', 'article', 'aside', 'p']) {
    const ref = { current: null };
    const props = { as: tag, ref, id: `panel-${tag}`, role: 'status', 'aria-live': 'polite', children: '내용' };
    const element = Panel(props);
    assert.equal(element.type, tag);
    assert.equal(element.props.ref, ref);
    assert.equal(element.props.children, '내용');
    assert.equal(element.props.as, undefined);
    const { as: _as, ...nativeProps } = props;
    assert.equal(withoutClass(markup(Panel, props)), markup(tag, nativeProps));
  }
  assert.equal(Panel({}).type, 'div');
});

test('shared classes merge without changing existing modifiers, ordering, or conditional classes', () => {
  for (const [component, base] of [[Button, 'wf-btn'], [Input, 'wf-input'], [Select, 'wf-input'], [Textarea, 'wf-input'], [Panel, 'wf-panel'], [StatusBadge, 'wf-status'], [PageTitle, 'wf-title'], [PageHeading, 'wf-page-heading']]) {
    assert.equal(component({}).props.className, base);
    assert.equal(component({ className: 'custom' }).props.className, `${base} custom`);
    const existing = `custom  ${base} ${base}-primary `;
    assert.equal(component({ className: existing }).props.className, existing);
  }
  for (const primary of [true, false]) {
    const className = `wf-btn ${primary ? 'wf-btn-primary' : ''}`;
    assert.equal(Button({ className }).props.className, className);
  }
});

test('status and heading content uses the original native tags and escapes user text', () => {
  for (const [component, tag] of [[StatusBadge, 'span'], [PageTitle, 'h1'], [PageHeading, 'header']]) {
    const props = { id: 'message', children: '<script>alert("test")</script>' };
    assert.equal(withoutClass(markup(component, props)), markup(tag, props));
    assert.doesNotMatch(markup(component, props), /<script>/);
  }
});
