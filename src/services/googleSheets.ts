
import { Requisition, User } from '../types';

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
  requisitions?: Requisition[];
  finalNumber?: string;
}

// --- Funções de Autenticação e Usuários ---

export const loginUser = async (username: string, password: string): Promise<{ success: boolean; user?: User; message?: string }> => {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: 'login', username, password }),
    });
    const result = await response.json() as SheetResponse;
    if (result.status === 'success' && result.user) {
      return { success: true, user: result.user };
    }
    return { success: false, message: result.message || 'Falha no login' };
  } catch (e) {
    return { success: false, message: 'Erro de conexão' };
  }
};

export const registerUser = async (userData: User & { password?: string }): Promise<{ success: boolean; message?: string }> => {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ 
        action: 'createUser', 
        username: userData.username, 
        password: userData.password, 
        name: userData.name, 
        role: userData.role 
      }),
    });
    const result = await response.json() as SheetResponse;
    return { success: result.status === 'success', message: result.message };
  } catch (e) {
    return { success: false, message: 'Erro de conexão' };
  }
};

export const updateUser = async (userData: User & { password?: string }): Promise<{ success: boolean; message?: string }> => {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ 
        action: 'updateUser', 
        username: userData.username, // Username é a chave, não muda
        password: userData.password, 
        name: userData.name, 
        role: userData.role 
      }),
    });
    const result = await response.json() as SheetResponse;
    return { success: result.status === 'success', message: result.message };
  } catch (e) {
    return { success: false, message: 'Erro de conexão' };
  }
};

export const deleteUser = async (username: string): Promise<{ success: boolean; message?: string }> => {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ 
        action: 'deleteUser', 
        username: username
      }),
    });
    const result = await response.json() as SheetResponse;
    return { success: result.status === 'success', message: result.message };
  } catch (e) {
    return { success: false, message: 'Erro de conexão' };
  }
};

export const changePassword = async (username: string, newPassword: string, oldPassword?: string): Promise<{ success: boolean; message?: string }> => {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: 'changePassword', username, newPassword, oldPassword }),
    });
    const result = await response.json() as SheetResponse;
    return { success: result.status === 'success', message: result.message };
  } catch (e) {
    return { success: false, message: 'Erro de conexão' };
  }
};

export const getUsers = async (): Promise<User[]> => {
  try {
    const response = await fetch(`${API_URL}?action=getUsers`, {
      method: "GET",
      redirect: "follow",
      cache: "no-store"
    });
    if (!response.ok) return [];
    const result = await response.json() as User[];
    return result || [];
  } catch (e) {
    console.error("Erro ao carregar usuários:", e);
    return [];
  }
};


// --- Funções de Requisição Existentes ---

export const saveToGoogleSheets = async (data: Requisition): Promise<{ success: boolean; driveError?: string; emailError?: string; finalNumber?: string }> => {
  try {
    console.log(`Enviando dados para: ${API_URL}`);
    
    const response = await fetch(API_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      console.error(`Erro HTTP: ${response.status}`);
      return { success: false };
    }

    const result = await response.json() as SheetResponse;
    console.log("Resposta do Servidor:", result);

    if (result && result.status === 'success') {
      return { success: true, driveError: result.driveError, emailError: result.emailError, finalNumber: result.finalNumber };
    } else {
      console.error("Erro retornado pelo script:", result);
      return { success: false };
    }

  } catch (error) {
    console.error("FALHA CRÍTICA DE REDE:", error);
    return { success: false };
  }
};

export const deleteFromGoogleSheets = async (id: string): Promise<boolean> => {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: 'delete', id: id }),
    });

    if (!response.ok) return false;
    const result = await response.json() as SheetResponse;
    return result.status === 'success';

  } catch (error) {
    console.error("Erro ao excluir:", error);
    return false;
  }
};

export const getRequisitions = async (): Promise<Requisition[]> => {
  try {
    const response = await fetch(`${API_URL}?action=getRequisitions`, { 
      method: "GET", 
      redirect: "follow",
      cache: "no-store"
    });
    if (!response.ok) return [];

    const result = await response.json() as Requisition[];
    return result || [];
  } catch (error) {
    console.error("Erro ao carregar requisições:", error);
    return [];
  }
};

export const fetchDriveImage = async (driveUrl: string): Promise<string | null> => {
  try {
    const idMatch = driveUrl.match(/[-\w]{25,}/);
    const fileId = idMatch ? idMatch[0] : null;

    if (!fileId) {
      console.error("Não foi possível extrair o ID da URL:", driveUrl);
      return null;
    }

    console.log(`Tentando baixar imagem ID: ${fileId} via script...`);

    const response = await fetch(`${API_URL}?action=getImage&fileId=${fileId}`, {
      method: "GET",
      redirect: "follow",
      cache: "no-store"
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
