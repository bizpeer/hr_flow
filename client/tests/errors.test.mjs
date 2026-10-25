import test from 'node:test';
import assert from 'node:assert/strict';
import { getErrorCode, getErrorMessage } from '../src/utils/errors.ts';

test('typed errors preserve Firebase codes and useful messages without mutation', () => {
  const error = Object.freeze(Object.assign(new Error('재인증이 필요합니다.'), { code: 'auth/requires-recent-login' }));
  assert.equal(getErrorCode(error), 'auth/requires-recent-login');
  assert.equal(getErrorMessage(error), '재인증이 필요합니다.');
  assert.equal(error.code, 'auth/requires-recent-login');
});

test('serializable callable failures and text failures retain their user message', () => {
  const failure = Object.freeze({ code: 'functions/permission-denied', message: '소속 회사 계정만 관리할 수 있습니다.' });
  assert.equal(getErrorCode(failure), 'functions/permission-denied');
  assert.equal(getErrorMessage(failure), failure.message);
  assert.equal(getErrorMessage('직원 등록을 완료하지 못했습니다.'), '직원 등록을 완료하지 못했습니다.');
  assert.equal(getErrorCode('auth/wrong-password'), undefined);
});

test('unknown or malformed failures use a safe fallback instead of throwing in the error handler', () => {
  for (const failure of [null, undefined, 1, false, {}, [], '', { message: 42, code: false }, { message: '' }]) {
    assert.equal(getErrorMessage(failure), '알 수 없는 오류');
    assert.equal(getErrorMessage(failure, '다시 시도해 주세요.'), '다시 시도해 주세요.');
    assert.equal(getErrorCode(failure), undefined);
  }
});
