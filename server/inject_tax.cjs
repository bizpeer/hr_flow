const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// 서비스 계정 키 경로 (server/serviceAccount.json)
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = JSON.parse(fs.readFileSync(path.join(__dirname, 'serviceAccount.json'), 'utf8'));

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const db = getFirestore('weberp');

async function run() {
    try {
        // 생성된 JSON 경로 (scratch/scratch_xlsx/tax_table_2026.json)
        const dataPath = path.join(__dirname, '..', 'scratch', 'scratch_xlsx', 'tax_table_2026.json');
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        
        await db.collection('system_config').doc('tax_table').set(data);
        console.log('Successfully uploaded tax table to Firestore (weberp db)');
    } catch (e) {
        console.error('Error uploading tax table:', e);
    }
}

run();
