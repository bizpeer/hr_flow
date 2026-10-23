const path = require('node:path');
const PDFDocument = require('pdfkit');

/** A4 corporate letter with embedded Korean fonts and an immutable approved seal. */
async function renderOfficialLetterPdf(letter, images) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margins: { top: 52, bottom: 56, left: 58, right: 58 },
      bufferPages: true, info: { Title: letter.content.title, Author: letter.branding.companyName,
        Subject: letter.number, Creator: 'HR Flow' } });
    const chunks = [];
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
    try {
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
      const signWidth = width - 100;
      const companyHeight = pdf.font('KoreanBold').fontSize(16).heightOfString(letter.branding.companyName, { width: signWidth });
      const representativeHeight = pdf.fontSize(15).heightOfString(`대표이사  ${letter.branding.representative}`, { width: signWidth });
      const signHeight = 38 + companyHeight + 12 + Math.max(representativeHeight, 66);
      if (pdf.y + 35 + signHeight > pdf.page.height - 56) pdf.addPage();
      const signY = Math.max(pdf.y + 35, pdf.page.height - 76 - signHeight);
      const [year, month, day] = letter.issueDate.split('-').map(Number);
      pdf.font('Korean').fontSize(12).text(`${year}년 ${month}월 ${day}일`, 58, signY, { width, align: 'center' });
      pdf.font('KoreanBold').fontSize(16).text(letter.branding.companyName, 58, signY + 38, { width: signWidth, align: 'center' });
      const representativeY = signY + 38 + companyHeight + 12;
      pdf.fontSize(15).text(`대표이사  ${letter.branding.representative}`, 58, representativeY, { width: signWidth, align: 'center' });
      pdf.image(images.seal, 58 + width - 76, representativeY - 12, { fit: [66, 66], align: 'center', valign: 'center' });
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
module.exports = { renderOfficialLetterPdf };
