const path = require('node:path');
const PDFDocument = require('pdfkit');

const text = value => typeof value === 'string' ? value : '';
const dateLabel = value => /^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? value.replaceAll('-', '. ') : text(value);

function approvalDate(value) {
  if (!value) return '미결재';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text(value);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}.${parts.month}.${parts.day}\n${parts.hour}:${parts.minute}`;
}

/** Internal drafting form. All identities and dates come from the approved server snapshot. */
async function renderDraftingPdf(letter) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', pdfVersion: '1.7', bufferPages: true,
      margins: { top: 100, bottom: 64, left: 50, right: 50 },
      info: { Title: text(letter.content?.title), Author: text(letter.branding?.companyName),
        Subject: text(letter.number), Creator: 'HR Flow' } });
    const chunks = [];
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    try {
      pdf.registerFont('Korean', path.join(__dirname, 'fonts/NotoSansKR-Regular.otf'));
      pdf.registerFont('KoreanBold', path.join(__dirname, 'fonts/NotoSansKR-Bold.otf'));
      pdf._root.data.ViewerPreferences = pdf.ref({ PrintScaling: 'None' });

      const drafting = letter.drafting || {};
      const content = letter.content || {};
      const left = 36;
      const frameTop = 62;
      const width = pdf.page.width - left * 2;
      const innerLeft = left + 14;
      const innerWidth = width - 28;
      const number = text(letter.number);
      const revision = Number.isInteger(letter.revision) ? letter.revision : 1;
      const footerText = `${number}  ·  개정 ${revision}`;
      const measure = (value, availableWidth, size = 10, bold = false, lineGap = 2) =>
        pdf.font(bold ? 'KoreanBold' : 'Korean').fontSize(size).heightOfString(value || '-', { width: availableWidth, lineGap });
      const footerHeight = measure(footerText, width - 90, 7, false, 1);
      const contentBottom = pdf.page.height - Math.max(64, footerHeight + 30);
      const frameBottom = contentBottom + 10;
      pdf.page.margins.bottom = pdf.page.height - contentBottom;

      let activeFont = { name: 'Korean', size: 10 };
      const write = (value, x, y, availableWidth, size = 10, bold = false, options = {}) => {
        activeFont = { name: bold ? 'KoreanBold' : 'Korean', size };
        pdf.font(activeFont.name).fontSize(size).fillColor('#111111')
          .text(value || '-', x, y, { width: availableWidth, lineGap: 2, ...options });
      };
      const line = (x1, y1, x2, y2, thickness = 0.6) =>
        pdf.lineWidth(thickness).strokeColor('#222222').moveTo(x1, y1).lineTo(x2, y2).stroke();
      const continuation = () => {
        const previousFont = activeFont;
        write('【 기 안 지 】 (계속)', left + 10, 40, width - 20, 11);
        const heading = `${number}  ·  ${text(content.title)}`;
        const height = Math.max(28, measure(heading, innerWidth, 8.5, false, 2) + 16);
        write(heading, innerLeft, frameTop + 8, innerWidth, 8.5);
        line(left, frameTop + height, left + width, frameTop + height);
        pdf.page.margins.top = frameTop + height + 14;
        pdf.page.margins.bottom = pdf.page.height - contentBottom;
        pdf.x = innerLeft;
        pdf.y = pdf.page.margins.top;
        // A continuation header must not change the font of an in-flight body paragraph.
        activeFont = previousFont;
        pdf.font(activeFont.name).fontSize(activeFont.size).fillColor('#111111');
      };
      pdf.on('pageAdded', continuation);
      const ensureSpace = height => {
        if (pdf.y + height > contentBottom) pdf.addPage();
      };

      const metadata = [
        ['기안일자', dateLabel(drafting.draftDate)],
        ['문서번호', number],
        ['수신', '내부품의'],
        ['참조', text(content.reference) || '해당 없음'],
        ['발신', text(drafting.divisionName)],
        ['기안자', [text(letter.creatorName), text(drafting.teamName)].filter(Boolean).join(' · ')],
        ['보존년한', '3년'],
      ];
      const metadataLayout = availableWidth => metadata.map(([label, value]) => ({
        label, value, height: Math.max(20, measure(value, availableWidth - 55, 9.3, false, 1) + 7),
      }));
      const drawMetadata = (rows, x, y, availableWidth) => {
        for (const row of rows) {
          write(`${row.label} :`, x, y + 2, 51, 9.3, false, { lineGap: 1 });
          write(row.value, x + 55, y + 2, availableWidth - 55, 9.3, false, { lineGap: 1 });
          y += row.height;
        }
        return y;
      };

      const submitterNote = drafting.submittedBy && drafting.submittedBy !== letter.creatorId
        ? `\n(대리제출: ${text(drafting.submittedByName) || text(drafting.submittedBy)})` : '';
      const approvals = [{ roleLabel: '담당', name: text(letter.creatorName) + submitterNote, approvedAt: drafting.submittedAt },
        ...(Array.isArray(letter.approvalLine) ? letter.approvalLine : [])];
      const approvalRows = availableWidth => {
        const rows = [];
        for (let start = 0; start < approvals.length; start += 5) {
          const slots = approvals.slice(start, start + 5).map(step => ({
            roleLabel: text(step.roleLabel) || '결재', name: text(step.name) || text(step.uid) || '-', date: approvalDate(step.approvedAt),
          }));
          const cellWidth = availableWidth / slots.length;
          const headingHeight = Math.max(22, ...slots.map(slot => measure(slot.roleLabel, cellWidth - 12, 8.5, true, 1) + 12));
          const detailsHeight = Math.max(48, ...slots.map(slot =>
            measure(slot.name, cellWidth - 12, 9.5, false, 1.5) + measure(slot.date, cellWidth - 12, 7.5, false, 1) + 22));
          rows.push({ slots, cellWidth, headingHeight, detailsHeight, height: headingHeight + detailsHeight });
        }
        return rows;
      };
      const drawApprovalRow = (row, x, y) => {
        row.slots.forEach((slot, index) => {
          const cellX = x + index * row.cellWidth;
          pdf.lineWidth(0.6).strokeColor('#222222').rect(cellX, y, row.cellWidth, row.height).stroke();
          line(cellX, y + row.headingHeight, cellX + row.cellWidth, y + row.headingHeight);
          write(slot.roleLabel, cellX + 6, y + 6, row.cellWidth - 12, 8.5, true, { align: 'center', lineGap: 1 });
          const nameHeight = measure(slot.name, row.cellWidth - 12, 9.5, false, 1.5);
          const dateHeight = measure(slot.date, row.cellWidth - 12, 7.5, false, 1);
          const nameY = y + row.headingHeight + Math.max(8, (row.detailsHeight - nameHeight - dateHeight - 7) / 2);
          write(slot.name, cellX + 6, nameY, row.cellWidth - 12, 9.5, false, { align: 'center', lineGap: 1.5 });
          write(slot.date, cellX + 6, nameY + nameHeight + 7, row.cellWidth - 12, 7.5, false, { align: 'center', lineGap: 1 });
        });
      };

      write('【 기 안 지 】', left + 10, 40, width - 20, 11);
      const metaWidth = 188;
      const approvalWidth = width - metaWidth - 30;
      const metaRows = metadataLayout(metaWidth);
      const gridRows = approvalRows(approvalWidth);
      const metaHeight = metaRows.reduce((sum, row) => sum + row.height, 0);
      const gridHeight = gridRows.reduce((sum, row) => sum + row.height, 0) + (gridRows.length - 1) * 8 + 17;
      if (Math.max(metaHeight, gridHeight) <= 300) {
        drawMetadata(metaRows, left + 14, 80, metaWidth);
        const approvalX = left + metaWidth + 20;
        write('결 재', approvalX, 67, approvalWidth, 9, true);
        let y = 84;
        for (const row of gridRows) { drawApprovalRow(row, approvalX, y); y += row.height + 8; }
        const boundary = Math.max(80 + metaHeight, y - 8) + 14;
        line(left, boundary, left + width, boundary, 0.9);
        pdf.y = boundary + 16;
      } else {
        // Long identities use the full width; no participant name is shortened.
        pdf.y = drawMetadata(metadataLayout(innerWidth), innerLeft, 76, innerWidth) + 10;
        for (const row of approvalRows(innerWidth)) {
          ensureSpace(row.height + 32);
          const y = pdf.y + 18;
          write('결 재', innerLeft, pdf.y, innerWidth, 9, true);
          drawApprovalRow(row, innerLeft, y);
          pdf.y = y + row.height + 12;
        }
        ensureSpace(36);
        line(left, pdf.y, left + width, pdf.y, 0.9);
        pdf.y += 16;
      }

      ensureSpace(measure(`제 목 : ${text(content.title)}`, innerWidth, 11, true) + 74);
      write(`제 목 : ${text(content.title)}`, innerLeft, pdf.y, innerWidth, 11, true);
      pdf.moveDown(1.3);
      ensureSpace(52);
      write('검토하여 주시기 바랍니다.', innerLeft + 28, pdf.y, innerWidth - 28, 10.5);
      pdf.moveDown(1.2);
      write('- 아 래 -', innerLeft, pdf.y, innerWidth, 10.5, false, { align: 'center' });
      pdf.moveDown(1);
      pdf.x = innerLeft;
      activeFont = { name: 'Korean', size: 10.5 };
      pdf.font('Korean').fontSize(10.5).fillColor('#111111').text(text(content.body), {
        width: innerWidth, lineGap: 3, paragraphGap: 3,
      });
      if (text(content.attachments)) {
        pdf.moveDown(0.8);
        ensureSpace(30);
        write(`이전 첨부 설명 : ${content.attachments}`, innerLeft, pdf.y, innerWidth, 10);
      }
      if (Array.isArray(content.attachmentFiles) && content.attachmentFiles.length) {
        pdf.moveDown(0.8);
        ensureSpace(42);
        write(`첨부자료 (${content.attachmentFiles.length}건)`, innerLeft, pdf.y, innerWidth, 10, true);
        for (const [index, file] of content.attachmentFiles.entries()) {
          pdf.moveDown(0.4);
          ensureSpace(24);
          const size = Number.isFinite(file.size) ? ` · ${(file.size / 1024 / 1024).toFixed(2)}MB` : '';
          write(`${index + 1}. ${text(file.name)}${size}`, innerLeft, pdf.y, innerWidth, 9.5);
        }
      }
      pdf.moveDown(0.8);
      ensureSpace(24);
      write('끝.', innerLeft, pdf.y, innerWidth, 10, false, { align: 'right' });
      pdf.y += 18;

      const note = text(content.cooperationNote);
      const noteLabelWidth = 80;
      const noteWidth = width - noteLabelWidth - 24;
      let remaining = Array.from(note);
      let continued = false;
      do {
        ensureSpace(84);
        const available = contentBottom - pdf.y;
        const completeHeight = measure(remaining.join(''), noteWidth, 10, false, 3) + 20;
        let count = remaining.length;
        if (completeHeight > available) {
          let low = 1;
          let high = remaining.length;
          count = 0;
          while (low <= high) {
            const middle = Math.floor((low + high) / 2);
            if (measure(remaining.slice(0, middle).join(''), noteWidth, 10, false, 3) + 20 <= available) {
              count = middle; low = middle + 1;
            } else high = middle - 1;
          }
          if (!count) throw new Error('Drafting note cannot fit the available page area');
        }
        const value = remaining.slice(0, count).join('');
        const height = count < remaining.length ? available : Math.max(84, completeHeight);
        const y = !continued && count === remaining.length ? contentBottom - height : pdf.y;
        line(left, y, left + width, y, 0.9);
        line(left + noteLabelWidth, y, left + noteLabelWidth, y + height);
        line(left, y + height, left + width, y + height);
        const label = continued ? '참조\n요청사항\n(계속)' : '참조\n요청사항';
        write(label, left + 8, y + (height - measure(label, noteLabelWidth - 16, 9.5)) / 2, noteLabelWidth - 16, 9.5, false, { align: 'center' });
        write(value || '해당 없음', left + noteLabelWidth + 12, y + 10, noteWidth, 10, false, { lineGap: 3 });
        remaining = remaining.slice(count);
        if (remaining.length) { pdf.addPage(); continued = true; }
      } while (remaining.length);

      const pages = pdf.bufferedPageRange();
      for (let index = pages.start; index < pages.start + pages.count; index++) {
        pdf.switchToPage(index);
        pdf.lineWidth(0.9).strokeColor('#222222').rect(left, frameTop, width, frameBottom - frameTop).stroke();
        pdf.page.margins.bottom = 0;
        write(footerText, left, pdf.page.height - 18 - footerHeight, width - 90, 7, false, { lineGap: 1 });
        write(`${index - pages.start + 1} / ${pages.count}`, left + width - 80, pdf.page.height - 28, 80, 8, false, { align: 'right', lineBreak: false });
      }
      pdf.end();
    } catch (error) { pdf.destroy(); reject(error); }
  });
}

module.exports = { renderDraftingPdf };
