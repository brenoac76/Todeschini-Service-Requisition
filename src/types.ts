export type RequisitionType = 'Produção' | 'Fábrica';

export interface ServiceItem {
  id: string;
  quantity: number;
  specification: string;
  description: string;
  volume: number;
  color?: string; // Added for Factory
  reason?: 'Batida' | 'Faltante' | 'Medida Errada'; // Added for Factory
}

export interface DeliveryItem {
  id: string;
  quantity: number;
  description: string;
  color: string;
  supplier: string;
  deliveryOk: string; // "Sim" | "Não"
}

export interface PhotoAttachment {
  id: string;
  dataUrl: string; // Base64 image
  url?: string; // URL do Google Drive (para quando vem da planilha)
  caption: string;
}

export type RequisitionStatus = 'Recebida' | 'Em Progresso' | 'Concluída' | 'Cancelada';

export interface Requisition {
  id: string;
  type: RequisitionType; // Added type
  requisitionNumber: string; // e.g., "R-0013"
  date: string; // Data de recebimento
  dateInProgress?: string; // Data que iniciou progresso
  dateDone?: string; // Data de conclusão
  clientName: string;
  environment: string; // "Ambiente"
  fitter: string; // "Montador"
  purchaseOrder: string; // "Ordem Compra"
  responsible: string; // "Responsável pela informação"
  services: ServiceItem[];
  deliveryItems: DeliveryItem[];
  photos: PhotoAttachment[];
  createdAt: number | string;
  createdBy?: string; // Username do criador
  status: RequisitionStatus;
  canceledBy?: string; // Nome do usuário que cancelou
}

export type UserRole = 'gestor' | 'montador' | 'operacional';

export interface User {
  username: string;
  password?: string; // Opcional no frontend por segurança
  name: string;
  role: UserRole;
}