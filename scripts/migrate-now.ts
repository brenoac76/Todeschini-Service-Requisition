import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, collection } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const API_URL = "https://script.google.com/macros/s/AKfycbwNITKLC-gmCe4mSxgjQCRmH20pPkChwiSPqlOR-OFV2O4jqblxCLcEAwNoe4jt9q5Byw/exec";

// Load firebase config
const firebaseConfigFile = fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf-8');
const firebaseConfig = JSON.parse(firebaseConfigFile);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');

async function migrate() {
  console.log("=== INICIANDO BACKUP E MIGRAÇÃO DIRETA DO GOOGLE SHEETS PARA O FIREBASE ===");

  // 1. Fetch Users
  console.log("1. Buscando usuários do Google Sheets...");
  let users: any[] = [];
  try {
    const resUsers = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: 'getUsers' })
    });
    const usersJson: any = await resUsers.json();
    if (usersJson && usersJson.status === 'success' && Array.isArray(usersJson.users)) {
      users = usersJson.users;
    }
  } catch (e) {
    console.error("Erro ao buscar usuários do Sheets:", e);
  }
  console.log(`Encontrados ${users.length} usuários.`);

  // 2. Fetch Requisitions
  console.log("2. Buscando requisições do Google Sheets...");
  let requisitions: any[] = [];
  try {
    const resReqs = await fetch(API_URL, { method: "GET" });
    const reqsJson = await resReqs.json();
    if (Array.isArray(reqsJson)) {
      requisitions = reqsJson;
    }
  } catch (e) {
    console.error("Erro ao buscar requisições do Sheets:", e);
  }
  console.log(`Encontradas ${requisitions.length} requisições.`);

  // 3. Save local JSON backup
  const backupData = {
    createdAt: new Date().toISOString(),
    source: "Google Sheets",
    usersCount: users.length,
    requisitionsCount: requisitions.length,
    users,
    requisitions
  };

  const backupFilePath = path.join(process.cwd(), `backup_sheets_${Date.now()}.json`);
  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');
  console.log(`3. Arquivo de backup local criado com sucesso em: ${backupFilePath}`);

  // 4. Migrate Users to Firestore
  console.log("4. Migrando usuários para o Firestore...");
  let usersSaved = 0;
  for (const u of users) {
    if (u.username) {
      const usernameClean = String(u.username).trim().toLowerCase();
      await setDoc(doc(db, 'users', usernameClean), {
        username: usernameClean,
        password: u.password || '123456',
        name: u.name || u.username,
        role: u.role || 'montador'
      }, { merge: true });
      usersSaved++;
    }
  }

  // Ensure default admin exists
  await setDoc(doc(db, 'users', 'admin'), {
    username: 'admin',
    password: '123',
    name: 'Administrador',
    role: 'gestor'
  }, { merge: true });
  console.log(`Migrados ${usersSaved} usuários para a coleção 'users' no Firestore.`);

  // 5. Migrate Requisitions to Firestore
  console.log("5. Migrando requisições para o Firestore...");
  let reqsSaved = 0;
  for (const r of requisitions) {
    if (r && r.id) {
      const cleanReq = JSON.parse(JSON.stringify(r));
      await setDoc(doc(db, 'requisitions', String(r.id)), cleanReq, { merge: true });
      reqsSaved++;
    }
  }
  console.log(`Migradas ${reqsSaved} requisições para a coleção 'requisitions' no Firestore.`);

  // 6. Save Backup metadata doc in Firestore
  const backupDocId = `backup_${Date.now()}`;
  await setDoc(doc(db, 'backups', backupDocId), {
    id: backupDocId,
    createdAt: new Date().toISOString(),
    source: "Google Sheets Migration Script",
    usersCount: users.length,
    requisitionsCount: requisitions.length
  });
  console.log(`6. Registro de backup salvo na coleção 'backups' do Firestore (ID: ${backupDocId}).`);

  console.log("=== MIGRAÇÃO CONCLUÍDA COM SUCESSO! ===");
  process.exit(0);
}

migrate().catch(err => {
  console.error("FALHA NA MIGRAÇÃO:", err);
  process.exit(1);
});
