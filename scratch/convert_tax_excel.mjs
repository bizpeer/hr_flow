import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const filePath = 'D:\\Website\\근로소득 간이세액표_2026.03.01.xlsx';
const outputPath = 'd:\\Antigravity\\erp\\scratch\\scratch_xlsx\\tax_table_2026.json';

function parseValue(val) {
    if (val === '-' || val === null || val === undefined) return 0;
    if (typeof val === 'string') return parseInt(val.replace(/,/g, ''), 10) || 0;
    return val;
}

try {
    const workbook = XLSX.readFile(filePath);
    const allBrackets = [];

    // 처음 2개 시트 처리
    for (const sheetName of workbook.SheetNames.slice(0, 2)) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        for (const row of rows) {
            // A열(min), B열(max)이 숫자인 데이터만 추출
            const min = parseValue(row[0]);
            const max = parseValue(row[1]);
            
            if (min >= 770 && (max > min || max === 0)) {
                const taxes = [];
                for (let i = 2; i <= 12; i++) {
                    taxes.push(parseValue(row[i]));
                }
                allBrackets.push({ min, max: max || null, taxes });
            }
        }
    }

    // 중복 제거 및 정렬
    const sortedBrackets = allBrackets.sort((a, b) => a.min - b.min);
    
    // 최종 JSON 구조
    const result = {
        updateDate: '2026-03-01',
        brackets: sortedBrackets
    };

    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`Successfully converted Excel to JSON. Total brackets: ${sortedBrackets.length}`);
} catch (e) {
    console.error('Conversion error:', e);
}
