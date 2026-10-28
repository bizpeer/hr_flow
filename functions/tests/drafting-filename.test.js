const { test } = require('node:test');
const assert = require('node:assert/strict');
const { filename } = require('../drafting-attachments');

test('drafting filename keeps allowed suffixes when long names are shortened', () => {
  for (const extension of ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'PDF', 'JpEg']) {
    const result = filename(`${'견'.repeat(250)}.${extension}`);
    assert.equal(Array.from(result).length, 240);
    assert.ok(result.endsWith(`.${extension}`));
  }
});

test('drafting filename counts emoji as codepoints and preserves full Unicode characters', () => {
  const result = filename(`${'😀'.repeat(250)}.pdf`);
  assert.equal(Array.from(result).length, 240);
  assert.equal(result, `${'😀'.repeat(236)}.pdf`);
  assert.doesNotThrow(() => encodeURIComponent(result));
  assert.equal(filename(`${'😀'.repeat(235)}.jpeg`), `${'😀'.repeat(235)}.jpeg`);
});

test('drafting filename preserves existing short names and neutralizes path/control characters', () => {
  for (const value of ['견적서.pdf', '공급업체_견적.PNG', 'salary.jpeg', '설명 없는 자료', '.pdf']) assert.equal(filename(value), value);
  assert.equal(filename('../견적\\원본\u0000\n\r\u007f.pdf'), '.._견적_원본____.pdf');
  assert.equal(filename(''), '첨부파일');
  assert.equal(filename(undefined), '첨부파일');
});

test('drafting filename keeps the 240 codepoint boundary without inventing unsafe suffixes', () => {
  assert.equal(filename(`${'a'.repeat(236)}.pdf`), `${'a'.repeat(236)}.pdf`);
  assert.equal(filename(`${'a'.repeat(237)}.pdf`), `${'a'.repeat(236)}.pdf`);
  assert.equal(filename('a'.repeat(250)), 'a'.repeat(240));
  assert.equal(filename(`${'a'.repeat(250)}.html`), 'a'.repeat(240));
});
