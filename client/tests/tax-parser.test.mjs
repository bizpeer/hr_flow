import assert from 'node:assert/strict';
import JSZip from 'jszip';
import readExcelFile from 'read-excel-file/universal';

const workbook = new JSZip();
workbook.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
  <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
    <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
    <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  </Types>`);
workbook.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?>
  <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  </Relationships>`);
workbook.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8"?>
  <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
    <sheets><sheet name="First" sheetId="1" r:id="rId1"/><sheet name="Second" sheetId="2" r:id="rId2"/></sheets>
  </workbook>`);
workbook.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8"?>
  <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
    <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  </Relationships>`);
for (const [index, minimum] of [[1, 1000], [2, 2000]]) {
  workbook.file(`xl/worksheets/sheet${index}.xml`, `<?xml version="1.0" encoding="UTF-8"?>
    <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheetData><row r="1"><c r="A1"><v>${minimum}</v></c><c r="B1"><v>${minimum + 500}</v></c></row></sheetData>
    </worksheet>`);
}

const bytes = await workbook.generateAsync({ type: 'uint8array' });
const sheets = await readExcelFile(bytes.buffer);
assert.equal(sheets.length, 2);
assert.deepEqual(sheets[0].data[0], [1000, 1500]);
assert.deepEqual(sheets[1].data[0], [2000, 2500]);
console.log('XLSX parser smoke test passed.');
