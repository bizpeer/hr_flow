const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'serviceAccount.json');
const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath),
});

const db = getFirestore(app, 'weberp');
const defaultDb = getFirestore(app);

async function checkUsers() {
  try {
    console.log('--- UserProfile Documents (weberp) ---');
    const snapshot = await db.collection('UserProfile').get();
    if (snapshot.empty) {
      console.log('No users found in weberp.');
    } else {
      snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`ID: ${doc.id}, Email: ${data.email}, Role: ${data.role}, CompanyId: ${data.companyId}`);
      });
    }

    console.log('--- UserProfile Documents (default) ---');
    const defaultSnap = await defaultDb.collection('UserProfile').get();
    if (defaultSnap.empty) {
      console.log('No users found in default.');
    } else {
      defaultSnap.forEach(doc => {
        const data = doc.data();
        console.log(`ID: ${doc.id}, Email: ${data.email}, Role: ${data.role}, CompanyId: ${data.companyId}`);
      });
    }

    console.log('--- Companies Documents ---');
    const compSnap = await db.collection('companies').get();
    compSnap.forEach(doc => {
      console.log(`ID: ${doc.id}, Name: ${doc.data().nameKo}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkUsers();
