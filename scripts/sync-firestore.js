const https = require('https');
const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc } = require('firebase/firestore');

const API_URL = "https://script.google.com/macros/s/AKfycbwNITKLC-gmCe4mSxgjQCRmH20pPkChwiSPqlOR-OFV2O4jqblxCLcEAwNoe4jt9q5Byw/exec";

// Load firebase config
const firebaseConfigFile = fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf-8');
const firebaseConfig = JSON.parse(firebaseConfigFile);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');

function fetchWithRedirect(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect (Apps Script redirects GET and POST)
        return fetchWithRedirect(res.headers.location, { method: 'GET' }).then(resolve).catch(reject);
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });
    request.on('error', reject);
    if (options.body) {
      request.write(options.body);
    }
    request.end();
  });
}

async function runMigration() {
  console.log("=== EXECUTANDO BACKUP E MIGRAÇÃO GOOGLE SHEETS -> FIREBASE ===");

  // 1. Fetch requisitions from Sheets
  console.log("1. Baixando requisições do Google Sheets...");
  const requisitions = await fetchWithRedirect(API_URL, { method: 'GET' });
  console.log(`Requisicoes recebidas: ${Array.isArray(requisitions) ? requisitions.length : 0}`);

  // 2. Fetch users from Sheets
  console.log("2. Baixando usuários do Google Sheets...");
  const usersResponse = await fetchWithRedirect(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'getUsers' })
  });
  const users = (usersResponse && usersResponse.users) ? usersResponse.users : [];
  console.log(`Usuarios recebidos: ${users.length}`);

  // 3. Salvar Backup Local em arquivo JSON
  const backup = {
    migratedAt: new Date().toISOString(),
    requisitionsCount: Array.isArray(requisitions) ? requisitions.length : 0,
    usersCount: users.length,
    users,
    requisitions
  };
  const backupPath = path.join(process.cwd(), 'backup_google_sheets_final.json');
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf-8');
  console.log(`Backup local criado em ${backupPath}`);

  // 4. Inserir Usuários no Firestore
  console.log("4. Migrando usuários para Firestore...");
  let countUsers = 0;
  if (Array.isArray(users)) {
    for (const u of users) {
      if (u.username) {
        const usernameClean = String(u.username).trim().toLowerCase();
        await setDoc(doc(db, 'users', usernameClean), {
          username: usernameClean,
          password: u.password || '123456',
          name: u.name || u.username,
          role: u.role || 'montador'
        }, { merge: true });
        countUsers++;
      }
    }
  }

  // Garantir conta admin
  await setDoc(doc(db, 'users', 'admin'), {
    username: 'admin',
    password: '123',
    name: 'Administrador',
    role: 'gestor'
  }, { merge: true });

  console.log(`-> ${countUsers} usuários inseridos na coleção 'users'.`);

  // 5. Inserir Requisições no Firestore
  console.log("5. Migrando requisições para Firestore...");
  let countReqs = 0;
  if (Array.isArray(requisitions)) {
    for (const r of requisitions) {
      if (r && r.id) {
        const cleanReq = JSON.parse(JSON.stringify(r));
        await setDoc(doc(db, 'requisitions', String(r.id)), cleanReq, { merge: true });
        countReqs++;
      }
    }
  }
  console.log(`-> ${countReqs} requisições inseridas na coleção 'requisitions'.`);

  // 6. Inserir log de backup no Firestore
  const backupId = `backup_${Date.now()}`;
  await setDoc(doc(db, 'backups', backupId), {
    id: backupId,
    timestamp: new Date().toISOString(),
    usersMigrated: countUsers,
    requisitionsMigrated: countReqs
  });
  console.log(`-> Registro de backup ${backupId} criado em Firestore.`);

  console.log("=== MIGRACAO DE BACKUP PARA O FIREBASE CONCLUIDA COM SUCESSO! ===");
  process.exit(0);
}

runMigration().catch(err => {
  console.error("ERRO MIGRACAO:", err);
  process.exit(1);
});
