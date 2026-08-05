
import { Requisition, User } from '../types';
import * as firebaseService from './firebase';

// IMPORTANTE: Se você fez uma nova implantação no Apps Script, verifique se este URL mudou.
const API_URL = "https://script.google.com/macros/s/AKfycbwNITKLC-gmCe4mSxgjQCRmH20pPkChwiSPqlOR-OFV2O4jqblxCLcEAwNoe4jt9q5Byw/exec";

interface SheetResponse {
  status: string;
  message?: string;
  driveError?: string;
  emailError?: string;
  dataUrl?: string;
  user?: User;
  users?: User[];
  finalNumber?: string;
}

// --- Funções Diretas da Planilha Google Sheets (Usadas para Backup e Migração) ---

export const getSheetsUsers = async (): Promise<User[]> => {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      redirect: "follow",
      body: JSON.stringify({ action: 'getUsers' }),
    });
    const result = await response.json() as SheetResponse;
    return result.users || [];
  } catch (e) {
    return [];
  }
};

export const getSheetsRequisitions = async (): Promise<Requisition[]> => {
  try {
    const response = await fetch(API_URL, { method: "GET", redirect: "follow" });
    if (!response.ok) return [];

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  } catch (error) {
    console.error("Erro GET Google Sheets:", error);
    return [];
  }
};

export const backupAndMigrateFromSheets = firebaseService.backupAndMigrateFromSheets;

// --- Funções de Autenticação e Usuários (Firebase) ---

export const loginUser = firebaseService.loginUser;
export const registerUser = firebaseService.registerUser;
export const updateUser = firebaseService.updateUser;
export const deleteUser = firebaseService.deleteUser;
export const changePassword = firebaseService.changePassword;
export const getUsers = firebaseService.getUsers;

// --- Funções de Requisição (Firebase com Sincronização Opcional) ---

export const saveToGoogleSheets = async (data: Requisition): Promise<{ success: boolean; driveError?: string; emailError?: string; finalNumber?: string }> => {
  // 1. Salva no Firebase Firestore (Banco principal)
  const fbResult = await firebaseService.saveToDatabase(data);

  // 2. Tenta enviar para o Apps Script em segundo plano para notificações de email/drive se necessário
  let sheetDriveError: string | undefined;
  let sheetEmailError: string | undefined;
  let sheetFinalNumber: string | undefined;

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(data),
    });
    if (response.ok) {
      const result = await response.json() as SheetResponse;
      if (result.status === 'success') {
        sheetDriveError = result.driveError;
        sheetEmailError = result.emailError;
        sheetFinalNumber = result.finalNumber;
      }
    }
  } catch (e) {
    console.warn("Erro ao notificar Apps Script em segundo plano:", e);
  }

  return { 
    success: fbResult.success, 
    driveError: sheetDriveError, 
    emailError: sheetEmailError, 
    finalNumber: sheetFinalNumber 
  };
};

export const deleteFromGoogleSheets = async (id: string): Promise<boolean> => {
  const fbSuccess = await firebaseService.deleteFromDatabase(id);
  
  // Exclui da planilha em segundo plano
  try {
    fetch(API_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: 'delete', id: id }),
    }).catch(() => {});
  } catch (e) {}

  return fbSuccess;
};

export const getRequisitions = firebaseService.getRequisitions;


export const fetchDriveImage = async (driveUrl: string): Promise<string | null> => {
  try {
    const idMatch = driveUrl.match(/[-\w]{25,}/);
    const fileId = idMatch ? idMatch[0] : null;

    if (!fileId) {
      console.error("Não foi possível extrair o ID da URL:", driveUrl);
      return null;
    }

    console.log(`Tentando baixar imagem ID: ${fileId} via script...`);

    const response = await fetch(API_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: 'getImage', fileId: fileId }),
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json() as SheetResponse;
    
    if (result.status === 'success' && result.dataUrl) {
      return result.dataUrl;
    }
    
    return null;

  } catch (error) {
    console.error("Erro ao baixar imagem do Drive:", error);
    return null;
  }
};
