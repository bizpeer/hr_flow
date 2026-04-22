const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const filePath = 'D:\\Website\\근로소득 간이세액표_2026.03.01.xlsx';
const outputPath = path.join(__dirname, '..', 'scratch', 'scratch_xlsx', 'tax_table_2026.json');

function parseValue(val) {
    if (val === '-' || val === null || val === undefined) return 0;
    if (typeof val === 'string') return parseInt(val.replace(/,/g, ''), 10) || 0;
    return val;
}

try {
    const workbook = XLSX.readFile(filePath);
    const allBrackets = [];

    // 처음 2개 시트 처리
    for (let idx = 0; idx < 2; idx++) {
        const sheetName = workbook.SheetNames[idx];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        for (const row of rows) {
            const min = parseValue(row[0]);
            const max = parseValue(row[1]);
            
            // 숫자인 유효한 구간 데이터만 추출 (770원 이상)
            if (typeof min === 'number' && min >= 770 && (max > min || max === 0)) {
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

    if (!fs.existsSync(path.dirname(outputPath))) {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`Successfully converted Excel to JSON. Total brackets: ${sortedBrackets.length}`);
} catch (e) {
    console.error('Conversion error:', e);
}
