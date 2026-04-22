const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccount = JSON.parse(fs.readFileSync(path.join(__dirname, '../server/serviceAccount.json'), 'utf8'));

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const db = admin.firestore('weberp');

async function run() {
    try {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'scratch_xlsx/tax_table_2026.json'), 'utf8'));
        await db.collection('system_config').doc('tax_table').set(data);
        console.log('Successfully uploaded tax table to Firestore (weberp db)');
    } catch (e) {
        console.error('Error uploading tax table:', e);
    }
}

run();
