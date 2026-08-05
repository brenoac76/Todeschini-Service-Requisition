import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  updateDoc 
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { Requisition, User } from '../types';
import { getRequisitions as getSheetsRequisitions, getUsers as getSheetsUsers } from './googleSheets';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');

const withTimeout = <T>(promise: Promise<T>, ms: number = 6000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(`Timeout Firebase (${ms}ms)`)), ms)
    )
  ]);
};

const USERS_COL = 'users';
const REQS_COL = 'requisitions';
const BACKUPS_COL = 'backups';

let autoMigrationDone = false;
let isMigratingInProgress = false;

export interface MigrationResult {
  success: boolean;
  message: string;
  backupFileCreated?: boolean;
  usersMigrated?: number;
  requisitionsMigrated?: number;
}

// --- Backup & Migration Tool ---

export const backupAndMigrateFromSheets = async (triggerDownload = false): Promise<MigrationResult> => {
  if (isMigratingInProgress) {
    return { success: false, message: 'Migração já em andamento.' };
  }
  isMigratingInProgress = true;

  try {
    // 1. Buscar dados atuais do Google Sheets
    const sheetsUsers = await getSheetsUsers();
    const sheetsReqs = await getSheetsRequisitions();

    // 2. Criar objeto de backup estruturado
    const backupData = {
      createdAt: new Date().toISOString(),
      source: "Google Sheets",
      usersCount: sheetsUsers.length,
      requisitionsCount: sheetsReqs.length,
      users: sheetsUsers,
      requisitions: sheetsReqs
    };

    // Salvar o backup no localStorage por segurança adicional
    const backupKey = `todeschini_sheets_backup_${Date.now()}`;
    localStorage.setItem(backupKey, JSON.stringify(backupData));

    // Gerar download automático apenas se solicitado expressamente pelo usuário na interface
    if (triggerDownload) {
      try {
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_google_sheets_todeschini_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        console.warn("Não foi possível acionar o download do backup:", e);
      }
    }

    // 3. Salvar registro de backup no próprio Firebase Firestore
    const backupDocId = `backup_${Date.now()}`;
    await setDoc(doc(db, BACKUPS_COL, backupDocId), {
      id: backupDocId,
      createdAt: new Date().toISOString(),
      usersCount: sheetsUsers.length,
      requisitionsCount: sheetsReqs.length
    });

    // 4. Migrar Usuários para o Firebase
    let usersCount = 0;
    for (const u of sheetsUsers) {
      if (u.username) {
        await setDoc(doc(db, USERS_COL, u.username.trim().toLowerCase()), {
          username: u.username.trim().toLowerCase(),
          password: u.password || '123456',
          name: u.name || u.username,
          role: u.role || 'montador'
        }, { merge: true });
        usersCount++;
      }
    }

    if (usersCount === 0) {
      await setDoc(doc(db, USERS_COL, 'admin'), {
        username: 'admin',
        password: '123',
        name: 'Administrador',
        role: 'gestor'
      }, { merge: true });
    }

    // 5. Migrar Requisições para o Firebase
    let reqsCount = 0;
    for (const r of sheetsReqs) {
      if (r.id) {
        const cleanReq = JSON.parse(JSON.stringify(r));
        await setDoc(doc(db, REQS_COL, r.id), cleanReq, { merge: true });
        reqsCount++;
      }
    }

    autoMigrationDone = true;
    localStorage.setItem('todeschini_firebase_migrated', 'true');

    return {
      success: true,
      message: `Backup gerado com sucesso! Migrados ${usersCount} usuários e ${reqsCount} requisições para o Firebase.`,
      backupFileCreated: triggerDownload,
      usersMigrated: usersCount,
      requisitionsMigrated: reqsCount
    };

  } catch (error: any) {
    console.error("Erro na migração/backup:", error);
    return {
      success: false,
      message: `Erro durante a migração: ${error.message || 'Falha de conexão'}`
    };
  } finally {
    isMigratingInProgress = false;
  }
};

// --- Funções de Autenticação e Usuários (Firebase) ---

export const loginUser = async (username: string, password: string): Promise<{ success: boolean; user?: User; message?: string }> => {
  try {
    const cleanUsername = username.trim().toLowerCase();
    
    // Tenta buscar no Firebase com timeout curto
    try {
      let userDoc = await withTimeout(getDoc(doc(db, USERS_COL, cleanUsername)), 4000);
      
      if (!userDoc.exists() && !autoMigrationDone) {
        await backupAndMigrateFromSheets();
        userDoc = await withTimeout(getDoc(doc(db, USERS_COL, cleanUsername)), 4000);
      }
      
      if (userDoc.exists()) {
        const userData = userDoc.data() as User & { password?: string };
        if (userData.password === password) {
          return { 
            success: true, 
            user: { 
              username: userData.username, 
              name: userData.name, 
              role: userData.role 
            } 
          };
        } else {
          return { success: false, message: 'Senha incorreta' };
        }
      }
    } catch (fbErr) {
      console.warn("Consulta Firestore temporariamente indisponível, tentando fallback Sheets:", fbErr);
    }

    // Fallback: Tenta validar diretamente na API do Google Sheets e migra o usuário
    try {
      const API_URL = "https://script.google.com/macros/s/AKfycbwNITKLC-gmCe4mSxgjQCRmH20pPkChwiSPqlOR-OFV2O4jqblxCLcEAwNoe4jt9q5Byw/exec";
      const response = await fetch(API_URL, {
        method: "POST",
        redirect: "follow",
        body: JSON.stringify({ action: 'login', username: cleanUsername, password }),
      });
      const result = await response.json();
      if (result.status === 'success' && result.user) {
        // Salva e migra este usuário para o Firebase em segundo plano
        setDoc(doc(db, USERS_COL, cleanUsername), {
          username: cleanUsername,
          password: password,
          name: result.user.name || cleanUsername,
          role: result.user.role || 'montador'
        }, { merge: true }).catch(() => {});

        return {
          success: true,
          user: {
            username: cleanUsername,
            name: result.user.name || cleanUsername,
            role: result.user.role || 'montador'
          }
        };
      }
    } catch (sheetsErr) {
      console.warn("Fallback de login no Google Sheets falhou:", sheetsErr);
    }

    // Se o banco de dados estiver vazio, fallback inicial com admin padrão
    if (cleanUsername === 'admin' && password === '123') {
      const defaultAdmin: User = { username: 'admin', name: 'Administrador', role: 'gestor' };
      setDoc(doc(db, USERS_COL, 'admin'), { ...defaultAdmin, password: '123' }).catch(() => {});
      return { success: true, user: defaultAdmin };
    }

    return { success: false, message: 'Usuário não encontrado' };
  } catch (e: any) {
    console.error("Erro no login Firebase:", e);
    return { success: false, message: 'Erro ao conectar com Firebase' };
  }
};

export const registerUser = async (userData: User & { password?: string }): Promise<{ success: boolean; message?: string }> => {
  try {
    const cleanUsername = userData.username.trim().toLowerCase();
    const userRef = doc(db, USERS_COL, cleanUsername);
    const existing = await getDoc(userRef);

    if (existing.exists()) {
      return { success: false, message: 'Usuário já existe' };
    }

    await setDoc(userRef, {
      username: cleanUsername,
      password: userData.password || '123456',
      name: userData.name,
      role: userData.role
    });

    return { success: true, message: 'Usuário cadastrado com sucesso' };
  } catch (e: any) {
    console.error("Erro cadastrar usuário Firebase:", e);
    return { success: false, message: 'Erro ao salvar usuário no Firebase' };
  }
};

export const updateUser = async (userData: User & { password?: string }): Promise<{ success: boolean; message?: string }> => {
  try {
    const cleanUsername = userData.username.trim().toLowerCase();
    const userRef = doc(db, USERS_COL, cleanUsername);
    
    const updatePayload: any = {
      name: userData.name,
      role: userData.role
    };

    if (userData.password) {
      updatePayload.password = userData.password;
    }

    await updateDoc(userRef, updatePayload);
    return { success: true, message: 'Usuário atualizado com sucesso' };
  } catch (e: any) {
    console.error("Erro atualizar usuário Firebase:", e);
    return { success: false, message: 'Erro ao atualizar usuário no Firebase' };
  }
};

export const deleteUser = async (username: string): Promise<{ success: boolean; message?: string }> => {
  try {
    const cleanUsername = username.trim().toLowerCase();
    await deleteDoc(doc(db, USERS_COL, cleanUsername));
    return { success: true, message: 'Usuário excluído do Firebase' };
  } catch (e: any) {
    console.error("Erro excluir usuário Firebase:", e);
    return { success: false, message: 'Erro ao excluir usuário no Firebase' };
  }
};

export const changePassword = async (username: string, newPassword: string, oldPassword?: string): Promise<{ success: boolean; message?: string }> => {
  try {
    const cleanUsername = username.trim().toLowerCase();
    const userRef = doc(db, USERS_COL, cleanUsername);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return { success: false, message: 'Usuário não encontrado' };
    }

    const userData = userSnap.data();
    if (oldPassword && userData.password !== oldPassword) {
      return { success: false, message: 'Senha atual incorreta' };
    }

    await updateDoc(userRef, { password: newPassword });
    return { success: true, message: 'Senha alterada com sucesso' };
  } catch (e: any) {
    console.error("Erro trocar senha Firebase:", e);
    return { success: false, message: 'Erro ao alterar senha no Firebase' };
  }
};

export const getUsers = async (): Promise<User[]> => {
  try {
    const querySnapshot = await withTimeout(getDocs(collection(db, USERS_COL)), 5000);
    const users: User[] = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      users.push({
        username: data.username || docSnap.id,
        name: data.name || data.username,
        role: data.role || 'montador'
      });
    });

    if (users.length === 0 && !autoMigrationDone) {
      autoMigrationDone = true;
      const sheetsUsers = await getSheetsUsers();
      if (sheetsUsers.length > 0) {
        for (const u of sheetsUsers) {
          if (u.username) {
            setDoc(doc(db, USERS_COL, u.username.trim().toLowerCase()), {
              username: u.username.trim().toLowerCase(),
              password: u.password || '123456',
              name: u.name || u.username,
              role: u.role || 'montador'
            }, { merge: true }).catch(() => {});
          }
        }
        return sheetsUsers;
      }
    }

    return users;
  } catch (e: any) {
    console.warn("Firebase getUsers fallback to Google Sheets:", e);
    return await getSheetsUsers();
  }
};

// --- Funções de Requisição (Firebase) ---

export const saveToDatabase = async (data: Requisition): Promise<{ success: boolean; driveError?: string; emailError?: string; finalNumber?: string }> => {
  try {
    const cleanData = JSON.parse(JSON.stringify(data));
    const reqRef = doc(db, REQS_COL, data.id);
    await setDoc(reqRef, cleanData, { merge: true });
    return { success: true };
  } catch (error) {
    console.error("Erro ao salvar requisição no Firebase:", error);
    return { success: false };
  }
};

export const deleteFromDatabase = async (id: string): Promise<boolean> => {
  try {
    await deleteDoc(doc(db, REQS_COL, id));
    return true;
  } catch (error) {
    console.error("Erro ao excluir do Firebase:", error);
    return false;
  }
};

export const getRequisitions = async (): Promise<Requisition[]> => {
  try {
    const querySnapshot = await withTimeout(getDocs(collection(db, REQS_COL)), 5000);
    const requisitions: Requisition[] = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data() as Requisition;
      requisitions.push(data);
    });

    if (requisitions.length === 0 && !autoMigrationDone) {
      autoMigrationDone = true;
      const sheetsReqs = await getSheetsRequisitions();
      if (sheetsReqs.length > 0) {
        for (const r of sheetsReqs) {
          if (r.id) {
            const cleanReq = JSON.parse(JSON.stringify(r));
            setDoc(doc(db, REQS_COL, r.id), cleanReq, { merge: true }).catch(() => {});
          }
        }
        return sheetsReqs;
      }
    }

    return requisitions;
  } catch (error) {
    console.warn("Firebase getRequisitions fallback to Google Sheets:", error);
    return await getSheetsRequisitions();
  }
};
