const path = require('node:path');
const PDFDocument = require('pdfkit');

function sealSize(branding, legacyPoints) {
  if (branding.sealWidthMm == null && branding.sealHeightMm == null) return { width: legacyPoints, height: legacyPoints, legacy: true };
  for (const size of [branding.sealWidthMm, branding.sealHeightMm]) {
    if (!Number.isFinite(size) || size < 5 || size > 50) throw new Error('Invalid approved seal dimensions');
  }
  return { width: branding.sealWidthMm * 72 / 25.4, height: branding.sealHeightMm * 72 / 25.4, legacy: false };
}
function printAtActualSize(pdf) {
  // PDF viewers can honor this preference; printer dialogs must still use 100%.
  pdf._root.data.ViewerPreferences = pdf.ref({ PrintScaling: 'None' });
}
function drawSeal(pdf, image, x, y, seal) {
  pdf.image(image, x, y, seal.legacy ? { fit: [seal.width, seal.height], align: 'center', valign: 'center' } :
    { width: seal.width, height: seal.height });
}

/** A4 corporate letter with embedded Korean fonts and an immutable approved seal. */
async function renderOfficialLetterPdf(letter, images) {
  if (['EMPLOYMENT', 'CAREER'].includes(letter.documentType)) return renderCertificatePdf(letter, images);
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', pdfVersion: '1.7', margins: { top: 52, bottom: 56, left: 58, right: 58 },
      bufferPages: true, info: { Title: letter.content.title, Author: letter.branding.companyName,
        Subject: letter.number, Creator: 'HR Flow' } });
    const chunks = [];
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
    try {
      printAtActualSize(pdf);
      const seal = sealSize(letter.branding, 66);
      pdf.registerFont('Korean', path.join(__dirname, 'fonts/NotoSansKR-Regular.otf'));
      pdf.registerFont('KoreanBold', path.join(__dirname, 'fonts/NotoSansKR-Bold.otf'));
      const width = pdf.page.width - 116;
      const rule = (y, thickness = 0.6) => pdf.moveTo(58, y).lineTo(58 + width, y).lineWidth(thickness).stroke('#222222');
      pdf.image(images.logo, 58, 46, { fit: [170, 54], align: 'left', valign: 'center' });
      pdf.font('Korean').fontSize(9).fillColor('#222222').text(letter.branding.address, 58, 112, { width });
      let y = Math.max(140, pdf.y + 12);
      rule(y);
      const field = (label, value, bold = false) => {
        pdf.font('Korean').fontSize(10).text(label, 62, y + 7, { width: 62 });
        pdf.font(bold ? 'KoreanBold' : 'Korean').text(value, 128, y + 7, { width: width - 74, lineGap: 2 });
        y = Math.max(y + 28, pdf.y + 8); rule(y);
      };
      field('문서번호', letter.number);
      field('수       신', letter.content.recipient, true);
      if (letter.content.reference) field('참       조', letter.content.reference);
      field('제       목', letter.content.title, true);
      rule(y, 2);
      pdf.font('Korean').fontSize(10.5).text(letter.content.body, 58, y + 18, { width, lineGap: 2, paragraphGap: 0 });
      if (letter.content.attachments) {
        pdf.moveDown(1).fontSize(10).text(`붙임: ${letter.content.attachments}`, { width, lineGap: 4 });
      }
      // Measure long registered names so the entire signature stays together.
      const signWidth = width - Math.max(100, seal.width + 34);
      const companyHeight = pdf.font('KoreanBold').fontSize(16).heightOfString(letter.branding.companyName, { width: signWidth });
      const representativeHeight = pdf.fontSize(15).heightOfString(`대표이사  ${letter.branding.representative}`, { width: signWidth });
      const signHeight = 38 + companyHeight + 12 + Math.max(representativeHeight, seal.height);
      if (pdf.y + 35 + signHeight > pdf.page.height - 56) pdf.addPage();
      const signY = Math.max(pdf.y + 35, pdf.page.height - 76 - signHeight);
      const [year, month, day] = letter.issueDate.split('-').map(Number);
      pdf.font('Korean').fontSize(12).text(`${year}년 ${month}월 ${day}일`, 58, signY, { width, align: 'center' });
      pdf.font('KoreanBold').fontSize(16).text(letter.branding.companyName, 58, signY + 38, { width: signWidth, align: 'center' });
      const representativeY = signY + 38 + companyHeight + 12;
      pdf.fontSize(15).text(`대표이사  ${letter.branding.representative}`, 58, representativeY, { width: signWidth, align: 'center' });
      drawSeal(pdf, images.seal, 58 + width - 10 - seal.width, representativeY - 12, seal);
      const pages = pdf.bufferedPageRange();
      for (let index = 0; index < pages.count; index++) {
        pdf.switchToPage(index);
        // Temporarily extend the content margin; lineBreak:false alone still adds pages.
        const originalBottom = pdf.page.margins.bottom;
        pdf.page.margins.bottom = 0;
        pdf.font('Korean').fontSize(8).fillColor('#666666').text(
          `${letter.number}  ·  개정 ${letter.revision}  ·  ${index + 1} / ${pages.count}`,
          58, pdf.page.height - 42, { width, align: 'center', lineBreak: false });
        pdf.page.margins.bottom = originalBottom;
      }
      pdf.end();
    } catch (error) { pdf.destroy(); reject(error); }
  });
}

/** Bilingual employment/career template; company identity uses the same approval snapshot. */
async function renderCertificatePdf(letter, images) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', pdfVersion: '1.7', margin: 48, bufferPages: true,
      info: { Title: letter.content.title, Author: letter.branding.companyName, Subject: letter.number, Creator: 'HR Flow' } });
    const chunks = [];
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
    try {
      printAtActualSize(pdf);
      const seal = sealSize(letter.branding, 64);
      const compact = !seal.legacy && seal.height > 70;
      pdf.registerFont('Korean', path.join(__dirname, 'fonts/NotoSansKR-Regular.otf'));
      pdf.registerFont('KoreanBold', path.join(__dirname, 'fonts/NotoSansKR-Bold.otf'));
      const width = pdf.page.width - 96;
      const c = letter.content.certificate;
      const date = value => { const [year, month, day] = value.split('-').map(Number); return `${year}년 ${month}월 ${day}일`; };
      const header = continuation => {
        pdf.image(images.logo, 48, 42, { fit: [140, 42], align: 'left', valign: 'center' });
        pdf.font('Korean').fontSize(9).fillColor('#333333').text(`ISSUE No. ${letter.number}`, 230, 53, { width: width - 182, align: 'right' });
        pdf.font('KoreanBold').fontSize(24).fillColor('#111111').text(letter.content.title + (continuation ? ' (계속)' : ''), 48, compact ? 90 : 102, { width, align: 'center' });
        pdf.font('Korean').fontSize(10).text(letter.documentType === 'CAREER' ? 'CERTIFICATE OF CAREER' : 'CERTIFICATE OF EMPLOYMENT',
          48, compact ? 130 : 143, { width, align: 'center' });
        return compact ? 160 : 176;
      };
      let y = header(false);
      const space = height => { if (y + height > 784) { pdf.addPage(); y = header(true); } };
      const section = (ko, en) => {
        space(66);
        pdf.rect(48, y, width, 28).fill('#f2f3f5');
        pdf.font('KoreanBold').fontSize(10).fillColor('#111111').text(`${ko} / ${en}`, 58, y + 7, { width: width - 20 });
        y += 28;
      };
      const row = (ko, en, value) => {
        const labelWidth = 124;
        pdf.font('Korean').fontSize(10);
        const contentHeight = pdf.heightOfString(value || '-', { width: width - labelWidth - 20, lineGap: 2 });
        const height = Math.max(compact ? 34 : 38, contentHeight + 16);
        space(height);
        pdf.lineWidth(0.6).strokeColor('#777777').rect(48, y, width, height).stroke();
        pdf.moveTo(48 + labelWidth, y).lineTo(48 + labelWidth, y + height).stroke();
        pdf.font('Korean').fontSize(10).fillColor('#111111').text(ko, 58, y + 6, { width: labelWidth - 20 });
        pdf.fontSize(8).fillColor('#444444').text(en, 58, y + 21, { width: labelWidth - 20 });
        pdf.fontSize(10).fillColor('#111111').text(value || '-', 48 + labelWidth + 10, y + (height - contentHeight) / 2,
          { width: width - labelWidth - 20, lineGap: 2 });
        y += height;
      };
      section('인적사항', 'Personal Identification');
      row('성명 (한글)', 'Name in Korean', c.nameKo);
      row('성명 (영문)', 'Name in English', c.nameEn);
      row('생년월일', 'Date of Birth', c.birthDate ? date(c.birthDate) : '');
      row('주소', 'Present Address', c.address);
      section('재직사항', 'Employment Status');
      row('소속', 'Name of Division', c.division);
      row('직위 또는 직급', 'Position', c.position);
      row('기간', 'Duration', `${date(c.startDate)} ~ ${c.endDate ? date(c.endDate) : '현재'}`);
      row('용도', 'Issued Purpose', c.purpose);
      const companyWidth = width - Math.max(86, seal.width + 22);
      const companyHeight = pdf.font('KoreanBold').fontSize(16).heightOfString(letter.branding.companyName, { width: companyWidth });
      const representativeHeight = pdf.fontSize(13).heightOfString(`대표이사 ${letter.branding.representative}`, { width: companyWidth });
      const enHeight = letter.branding.companyNameEn ? pdf.font('Korean').fontSize(9).heightOfString(letter.branding.companyNameEn, { width: companyWidth }) + 4 : 0;
      const contacts = [c.department && `담당부서 / Department: ${c.department}`, c.contactName && `담당자 / Person in Charge: ${c.contactName}`,
        c.contactPhone && `연락처 / Contact: ${c.contactPhone}`, `회사주소 / Office: ${letter.branding.address}`].filter(Boolean).join('\n');
      const contactsHeight = pdf.font('Korean').fontSize(8).heightOfString(contacts, { width, lineGap: 2 });
      const signatureHeight = Math.max(Math.max(70, seal.height + 6), companyHeight + 7 + enHeight + representativeHeight + 12);
      space((compact ? 75 : 97) + signatureHeight + contactsHeight + 10);
      y += compact ? 12 : 18;
      pdf.font('Korean').fontSize(10).text('위와 같이 재직(경력사항)을 증명합니다.', 48, y, { width, align: 'center' });
      pdf.fontSize(8).text('This is to certify that the above mentioned facts are true and correct.', 48, y + (compact ? 16 : 19), { width, align: 'center' });
      pdf.fontSize(11).text(date(letter.issueDate), 48, y + (compact ? 36 : 46), { width, align: 'center' });
      const signY = y + (compact ? 63 : 79);
      pdf.font('KoreanBold').fontSize(16).text(letter.branding.companyName, 48, signY, { width: companyWidth, align: 'center' });
      let representativeY = signY + companyHeight + 7;
      if (enHeight) {
        pdf.font('Korean').fontSize(9).text(letter.branding.companyNameEn, 48, representativeY, { width: companyWidth, align: 'center' });
        representativeY += enHeight;
      }
      pdf.font('KoreanBold').fontSize(13).text(`대표이사 ${letter.branding.representative}`, 48, representativeY, { width: companyWidth, align: 'center' });
      drawSeal(pdf, images.seal, 48 + width - 12 - seal.width, signY - 2, seal);
      y = Math.max(signY + Math.max(70, seal.height + 6), representativeY + representativeHeight + 12);
      space(contactsHeight + 10);
      pdf.font('Korean').fontSize(8).fillColor('#444444').text(contacts, 48, y, { width, lineGap: 2 });
      const pages = pdf.bufferedPageRange();
      for (let index = 0; index < pages.count; index++) {
        pdf.switchToPage(index);
        pdf.page.margins.bottom = 0;
        pdf.font('Korean').fontSize(8).fillColor('#666666').text(`${letter.number}  ·  개정 ${letter.revision}  ·  ${index + 1} / ${pages.count}`,
          48, pdf.page.height - 34, { width, align: 'center', lineBreak: false });
      }
      pdf.end();
    } catch (error) { pdf.destroy(); reject(error); }
  });
}
/** A disposable ruler sheet. It has no issued number, approval, or stored PDF record. */
async function renderSealPrintTestPdf(settings, images) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', pdfVersion: '1.7', margin: 0,
      info: { Title: '인감 인쇄 테스트 - 발급 문서 아님', Author: settings.companyName,
        Subject: 'A4 actual-size seal and millimeter rulers', Creator: 'HR Flow' } });
    const chunks = [];
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
    try {
      if (settings.sealWidthMm == null || settings.sealHeightMm == null) throw new Error('Saved seal dimensions required');
      const seal = sealSize(settings);
      printAtActualSize(pdf);
      pdf.registerFont('Korean', path.join(__dirname, 'fonts/NotoSansKR-Regular.otf'));
      pdf.registerFont('KoreanBold', path.join(__dirname, 'fonts/NotoSansKR-Bold.otf'));
      const mm = value => value * 72 / 25.4;
      const label = (value, x, y, width, size = 9, bold = false, color = '#222222', options = {}) => {
        pdf.font(bold ? 'KoreanBold' : 'Korean').fontSize(size).fillColor(color)
          .text(value, mm(x), mm(y), { width: mm(width), ...options });
      };
      const line = (x1, y1, x2, y2, thickness = 0.5, color = '#222222') => {
        pdf.moveTo(mm(x1), mm(y1)).lineTo(mm(x2), mm(y2)).lineWidth(thickness).stroke(color);
      };
      // Labels sit outside the scale; tick centers are exactly 1 mm apart.
      const ruler = (x, y, length, vertical = false) => {
        line(x, y, x + (vertical ? 0 : length), y + (vertical ? length : 0));
        for (let value = 0; value <= length; value++) {
          const tick = value % 10 === 0 ? 3 : value % 5 === 0 ? 2 : 1;
          const px = x + (vertical ? 0 : value), py = y + (vertical ? value : 0);
          line(px, py, px + (vertical ? -tick : 0), py + (vertical ? 0 : -tick), 0.4);
          if (value % 10 === 0) {
            label(String(value), vertical ? x - 15 : px - 5, vertical ? py - 1.8 : y - 8,
              10, 7.5, false, '#222222', { align: vertical ? 'right' : 'center', lineBreak: false });
          }
        }
      };
      label('인감 인쇄 테스트', 20, 16, 170, 21, true);
      label('TEST ONLY / 발급 문서 아님 · 공문·증명서로 사용할 수 없습니다.', 20, 29, 170, 9, true, '#a32626');
      label(settings.companyName, 20, 39, 170, 10.5, true, '#222222', { height: mm(18), lineGap: 1 });
      label(`저장된 템플릿 버전 ${settings.version}  |  A4 210 × 297 mm`, 20, 60, 170, 8.5, false, '#555555');
      line(20, 69, 190, 69, 0.7);

      label('1. 저장된 회사 인감과 크기 확인', 20, 74, 170, 11, true);
      ruler(40, 91, 50);
      ruler(36, 96, 50, true);
      drawSeal(pdf, images.seal, mm(40), mm(96), seal);
      pdf.rect(mm(40), mm(96), seal.width, seal.height).lineWidth(0.5).stroke('#666666');
      label('인쇄 테스트용 인감', 108, 95, 78, 10, true, '#a32626');
      label(`가로 ${settings.sealWidthMm} mm\n세로 ${settings.sealHeightMm} mm`, 108, 105, 78, 12, true, '#222222', { lineGap: 5 });
      label('회색 테두리는 이미지 전체 크기입니다.\n투명·흰색 여백도 설정 크기에 포함됩니다.\n눈금 간격 1 mm / 숫자 간격 10 mm',
        108, 127, 80, 8, false, '#555555', { lineGap: 3 });

      label('2. 자로 출력 배율 확인', 20, 156, 170, 11, true);
      ruler(40, 176, 100);
      ruler(40, 176, 100, true);
      label('가로 100 mm', 148, 173, 42, 9, true);
      label('세로 100 mm', 46, 263, 40, 8.5, true);
      pdf.rect(mm(90), mm(207), mm(50), mm(50)).lineWidth(0.5).stroke('#222222');
      label('50 × 50 mm', 92, 228, 46, 10, true, '#222222', { align: 'center' });
      label('기준 사각형', 92, 235, 46, 8, false, '#555555', { align: 'center' });
      label('출력 후 자로 확인\n\n가로 100 mm\n세로 100 mm\n사각형 50 × 50 mm', 148, 207, 42, 8.5, false, '#333333', { lineGap: 4 });
      label('A4 · 실제 크기 / 100%로 인쇄하세요. “페이지에 맞춤”을 해제하고 선의 중심 사이를 측정하세요.',
        20, 283, 170, 8, true, '#222222', { lineBreak: false });
      label('이 페이지는 인쇄 확인용입니다. 문서번호·결재·발급 이력은 생성되지 않습니다.',
        20, 289, 170, 7.5, false, '#666666', { lineBreak: false });
      pdf.end();
    } catch (error) { pdf.destroy(); reject(error); }
  });
}
module.exports = { renderOfficialLetterPdf, renderCertificatePdf, renderSealPrintTestPdf };
