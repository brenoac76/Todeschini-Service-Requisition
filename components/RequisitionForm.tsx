
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Camera, Save, ArrowLeft, Download, Loader2, ExternalLink, Cloud, Image as ImageIcon, Activity, Lock, Ban, UserX, Check } from 'lucide-react';
import { Requisition, ServiceItem, DeliveryItem, PhotoAttachment, User, RequisitionStatus } from '../types';
import { generateRequisitionPDF } from '../services/pdfGenerator';
import { saveToGoogleSheets } from '../services/googleSheets';
import { compressImage } from '../utils/imageCompression';

const generateId = () => Math.random().toString(36).substr(2, 9);

interface RequisitionFormProps {
  onSave: (req: Requisition) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
  initialData?: Requisition | null;
  suggestedNumber?: string;
  currentUser: User;
}

const RequisitionForm: React.FC<RequisitionFormProps> = ({ onSave, onCancel, onDelete, initialData, suggestedNumber, currentUser }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  // --- Estados para novos itens (Área de Inclusão) ---
  const [newService, setNewService] = useState<Partial<ServiceItem>>({
    quantity: 1, volume: undefined, specification: '', description: ''
  });
  const [newDelivery, setNewDelivery] = useState<Partial<DeliveryItem>>({
    quantity: 1, color: '', supplier: '', description: '', deliveryOk: 'Sim'
  });

  // Retorna string ISO completa para capturar data e hora
  const getCurrentIsoString = () => {
    return new Date().toISOString();
  };

  // Mantém formato YYYY-MM-DD apenas para o input type="date"
  const getInputDateString = (isoString?: string) => {
    if (!isoString) return new Date().toISOString().split('T')[0];
    try {
      return isoString.split('T')[0];
    } catch (e) {
      return '';
    }
  };

  const [formData, setFormData] = useState<Requisition>({
    id: generateId(),
    type: initialData?.type || 'Produção',
    requisitionNumber: initialData?.requisitionNumber || suggestedNumber || 'R-1000', 
    date: getCurrentIsoString(),
    clientName: '',
    environment: '',
    fitter: '',
    purchaseOrder: '',
    responsible: '',
    services: [],
    deliveryItems: [],
    photos: [],
    createdAt: Date.now(),
    createdBy: currentUser.username, // Marca quem criou
    status: 'Recebida' // Status padrão
  });

  useEffect(() => {
    if (initialData && initialData.requisitionNumber) {
      // Normalização de status antigos para novos se necessário
      let normalizedStatus = initialData.status;
      if (normalizedStatus as any === 'Recebido') normalizedStatus = 'Recebida';
      if (normalizedStatus as any === 'Feito') normalizedStatus = 'Concluída';

      setFormData({
        ...initialData,
        status: normalizedStatus || 'Recebida',
        canceledBy: initialData.canceledBy
      });
    } else if (initialData && initialData.type) {
      // Se for apenas o tipo (nova requisição com tipo pré-definido)
      setFormData(prev => ({
        ...prev,
        type: initialData.type,
        fitter: currentUser.role === 'montador' ? currentUser.name : prev.fitter,
        responsible: currentUser.role === 'montador' ? currentUser.name : prev.responsible
      }));
    } else {
      if (currentUser.role === 'montador') {
        setFormData(prev => ({
          ...prev,
          fitter: currentUser.name,
          responsible: currentUser.name
        }));
      }
    }
  }, [initialData, currentUser]);

  const handleChange = (field: keyof Requisition, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Lógica automática para datas com HORA baseada na mudança de status
      if (field === 'status') {
         const now = getCurrentIsoString();
         
         if (value === 'Em Progresso') {
            updated.dateInProgress = now;
         }
         if (value === 'Concluída') {
            updated.dateDone = now;
         }
      }
      return updated;
    });
  };

  // --- LÓGICA DE SERVIÇOS ---
  
  const handleAddService = () => {
    if (!newService.description && formData.type === 'Produção') {
      alert("Informe ao menos a descrição do serviço.");
      return;
    }
    if (formData.type === 'Fábrica' && (!newService.specification || !newService.reason)) {
      alert("Informe a medida e o motivo.");
      return;
    }

    setFormData(prev => ({
      ...prev,
      services: [...prev.services, { 
        id: generateId(), 
        quantity: newService.quantity || 1, 
        specification: newService.specification || '', 
        description: newService.description || '', 
        volume: newService.volume || 0,
        color: newService.color || '',
        reason: newService.reason
      }]
    }));
    // Reset inputs
    setNewService({ quantity: 1, volume: undefined, specification: '', description: '', color: '', reason: undefined });
  };

  const removeServiceRow = (id: string) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services.filter(item => item.id !== id)
    }));
  };

  // --- LÓGICA DE ENTREGAS ---

  const handleAddDelivery = () => {
    if (!newDelivery.description) {
      alert("Informe ao menos a descrição da entrega.");
      return;
    }
    setFormData(prev => ({
      ...prev,
      deliveryItems: [...prev.deliveryItems, { 
        id: generateId(), 
        quantity: newDelivery.quantity || 1, 
        description: newDelivery.description || '', 
        color: newDelivery.color || '', 
        supplier: newDelivery.supplier || '', 
        deliveryOk: newDelivery.deliveryOk || 'Sim' 
      }]
    }));
    // Reset inputs
    setNewDelivery({ quantity: 1, color: '', supplier: '', description: '', deliveryOk: 'Sim' });
  };

  const removeDeliveryRow = (id: string) => {
    setFormData(prev => ({
      ...prev,
      deliveryItems: prev.deliveryItems.filter(item => item.id !== id)
    }));
  };

  // --- FOTOS E OUTROS ---

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setIsCompressing(true);
      
      try {
        const compressedBase64 = await compressImage(file);
        setFormData(prev => ({
          ...prev,
          photos: [...prev.photos, { id: generateId(), dataUrl: compressedBase64, caption: file.name }]
        }));
      } catch (error) {
        console.error("Erro ao comprimir imagem", error);
        alert("Erro ao processar imagem.");
      } finally {
        setIsCompressing(false);
      }
    }
  };

  const removePhoto = (id: string) => {
    setFormData(prev => ({
      ...prev,
      photos: prev.photos.filter(p => p.id !== id)
    }));
  };

  const handleDeleteClick = () => {
    if (window.confirm('Tem certeza que deseja EXCLUIR permanentemente esta requisição?')) {
      if (onDelete && formData.id) {
        onDelete(formData.id);
      }
    }
  };

  const handleCancelRequisition = async () => {
    if (!window.confirm('Deseja realmente CANCELAR esta requisição? Um e-mail será enviado informando o cancelamento.')) {
      return;
    }

    const canceledData = { 
      ...formData, 
      status: 'Cancelada' as RequisitionStatus,
      canceledBy: currentUser.name 
    };
    setFormData(canceledData);
    setIsSaving(true);

    try {
      const result = await saveToGoogleSheets(canceledData);
      
      if (!result.success) {
         alert("Não foi possível conectar com o servidor. O cancelamento foi salvo apenas localmente.");
      } else {
         if (result.emailError) alert("Cancelada com sucesso, mas houve erro no envio do e-mail: " + result.emailError);
      }
      onSave(canceledData);
    } catch (err) {
      console.error(err);
      alert("Erro ao cancelar.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      const result = await saveToGoogleSheets(formData);
      
      let finalData = { ...formData };
      
      if (!result.success) {
         alert("Atenção: Não foi possível conectar com a planilha. O dado será salvo apenas neste dispositivo.");
      } else {
         // Se o servidor atribuiu um número oficial (sequencial cronológico), usamos ele
         if (result.finalNumber) {
            finalData.requisitionNumber = result.finalNumber;
         }

         const errors = [];
         if (result.driveError) errors.push("FOTOS (DRIVE): " + result.driveError);
         if (result.emailError) errors.push("EMAIL: " + result.emailError);
         
         if (errors.length > 0) {
            alert("Salvo com sucesso na planilha, mas com avisos:\n\n" + errors.join("\n\n"));
         }
      }

      onSave(finalData);
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      await generateRequisitionPDF(formData);
    } catch (e) {
      console.error(e);
      alert("Erro ao gerar PDF.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const getDriveThumbnailUrl = (url: string) => {
    if (!url) return null;
    try {
      let id = '';
      if (url.includes('id=')) {
        id = url.split('id=')[1].split('&')[0];
      } else if (url.includes('/d/')) {
        id = url.split('/d/')[1].split('/')[0];
      }
      if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w320`;
    } catch (e) {}
    return null;
  };

  // --- LÓGICA DE PERMISSÕES ---
  const isMontador = currentUser.role === 'montador';
  const isOperacional = currentUser.role === 'operacional';
  const isCanceled = formData.status === 'Cancelada';
  const isStatusLocked = isCanceled || (initialData && isMontador && initialData.status !== 'Recebida' && initialData.status as any !== 'Recebido');
  const isSensitiveFieldsLocked = isMontador || isOperacional || isStatusLocked;
  const canEditStatus = (currentUser.role === 'gestor' || isOperacional) && !isCanceled;

  const getStatusColor = (s: RequisitionStatus) => {
    if (s === 'Concluída') return 'text-green-600';
    if (s === 'Em Progresso') return 'text-yellow-600';
    if (s === 'Cancelada') return 'text-red-600 font-extrabold';
    return 'text-gray-600';
  }

  return (
    <div className="bg-white min-h-screen pb-20">
      <div className="sticky top-0 z-10 bg-white border-b shadow-sm px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="p-2 rounded-full hover:bg-gray-100" disabled={isSaving || isGeneratingPdf}>
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </button>
          <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            {initialData && initialData.requisitionNumber ? 'Detalhes' : `Nova Requisição ${formData.type}`}
            {isStatusLocked && <Lock className="w-4 h-4 text-gray-400" />}
          </h1>
        </div>
        <div className="flex gap-2">
           {initialData && !isCanceled && (
             <button 
               type="button" 
               onClick={handleCancelRequisition} 
               className="bg-gray-100 text-gray-500 p-2 rounded-full shadow-sm hover:bg-red-100 hover:text-red-600 border border-gray-200"
               title="Cancelar Requisição"
               disabled={isSaving || isGeneratingPdf}
             >
               <Ban className="w-5 h-5" />
             </button>
           )}

           {initialData && onDelete && (
             <button 
               type="button" 
               onClick={handleDeleteClick} 
               className="bg-red-100 text-red-600 p-2 rounded-full shadow-sm hover:bg-red-200 mr-2"
               title="Excluir Permanentemente"
               disabled={isSaving || isGeneratingPdf}
             >
               <Trash2 className="w-5 h-5" />
             </button>
           )}

          {initialData && (
             <button 
             type="button" 
             onClick={handleDownloadPDF} 
             className={`p-2 rounded-full shadow-lg flex items-center justify-center ${isGeneratingPdf ? 'bg-gray-400 cursor-not-allowed' : 'bg-gray-700 text-white hover:bg-gray-800'}`}
             title="Baixar PDF"
             disabled={isSaving || isGeneratingPdf}
           >
             {isGeneratingPdf ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <Download className="w-5 h-5" />}
           </button>
          )}

          {!isStatusLocked && (
            <button 
              onClick={handleSubmit} 
              disabled={isSaving || isCompressing || isGeneratingPdf}
              className={`text-white p-2 rounded-full shadow-lg flex items-center gap-2 px-4 ${isSaving || isCompressing || isGeneratingPdf ? 'bg-gray-400 cursor-not-allowed' : 'bg-brand-red hover:bg-red-700'}`}
            >
              {(isSaving || isCompressing) ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              <span className="hidden sm:inline">
                {isCompressing ? '...' : isSaving ? 'Salvando...' : 'Salvar'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* MUDANÇA: max-w expandido para 1600px e GRID system para desktop */}
      <form className="max-w-[1600px] mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Alerts - Full Width */}
        <div className="col-span-1 lg:col-span-12 space-y-4">
          {isCanceled && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg text-center font-bold flex flex-col items-center gap-2 animate-fade-in">
              <Ban className="w-8 h-8" />
              <p>REQUISIÇÃO CANCELADA</p>
              {formData.canceledBy && (
                <div className="flex items-center gap-1.5 bg-red-100 px-3 py-1 rounded-full text-xs mt-1 border border-red-200">
                    <UserX className="w-3 h-3" />
                    <span>Por: <strong>{formData.canceledBy}</strong></span>
                </div>
              )}
              <span className="text-xs font-normal mt-2">Não é possível editar informações.</span>
            </div>
          )}

          {!isCanceled && isStatusLocked && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 rounded-lg text-sm flex items-start gap-2">
              <Lock className="w-5 h-5 mt-0.5 shrink-0" />
              <p>Esta requisição está <strong>{formData.status}</strong> e não pode mais ser editada pelo montador.</p>
            </div>
          )}
        </div>

        {/* COLUNA ESQUERDA: Informações Gerais */}
        {/* lg:col-span-4 significa 1/3 da tela no desktop */}
        <section className={`col-span-1 lg:col-span-4 xl:col-span-3 bg-gray-50 p-4 rounded-lg border border-gray-200 ${isCanceled ? 'opacity-75 grayscale' : ''}`}>
          <h2 className="text-sm font-bold text-gray-500 uppercase mb-3 tracking-wider flex items-center justify-between">
            <span>Informações Gerais</span>
            
            {/* STATUS SELECTOR */}
            <div className="flex items-center gap-2 bg-white px-2 py-1 rounded border shadow-sm">
               <Activity className={`w-4 h-4 ${getStatusColor(formData.status)}`} />
               <select 
                  value={formData.status} 
                  disabled={!canEditStatus}
                  onChange={(e) => handleChange('status', e.target.value)}
                  className={`text-sm font-bold outline-none bg-transparent ${getStatusColor(formData.status)} ${!canEditStatus ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
               >
                 <option value="Recebida">Recebida</option>
                 <option value="Em Progresso">Em Progresso</option>
                 <option value="Concluída">Concluída</option>
                 <option value="Cancelada" disabled>Cancelada</option>
               </select>
            </div>
          </h2>

          {/* Grid interno: No desktop (lateral), fica coluna única para não apertar os inputs. */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4 mt-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Nº Requisição</label>
              <input 
                type="text" 
                value={formData.requisitionNumber} 
                onChange={(e) => handleChange('requisitionNumber', e.target.value)}
                disabled={isSensitiveFieldsLocked}
                placeholder="Pendente de salvamento..."
                className={`w-full p-2 border rounded outline-none ${isSensitiveFieldsLocked ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300 focus:border-brand-red'}`}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Data</label>
              <input 
                type="date" 
                value={getInputDateString(formData.date)} 
                onChange={(e) => handleChange('date', e.target.value)}
                disabled={isSensitiveFieldsLocked}
                className={`w-full p-2 border rounded outline-none ${isSensitiveFieldsLocked ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300 focus:border-brand-red'}`}
              />
            </div>
            <div className="md:col-span-2 lg:col-span-1">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Cliente</label>
              <input 
                type="text" 
                value={formData.clientName} 
                onChange={(e) => handleChange('clientName', e.target.value)}
                disabled={isStatusLocked}
                className={`w-full p-2 border rounded outline-none ${isStatusLocked ? 'bg-gray-100 cursor-not-allowed' : 'border-gray-300 focus:border-brand-red'}`}
              />
            </div>
            {formData.type === 'Produção' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Ambiente</label>
                  <input 
                    type="text" 
                    value={formData.environment} 
                    onChange={(e) => handleChange('environment', e.target.value)}
                    disabled={isStatusLocked}
                    className={`w-full p-2 border rounded outline-none ${isStatusLocked ? 'bg-gray-100 cursor-not-allowed' : 'border-gray-300 focus:border-brand-red'}`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Ordem Compra</label>
                  <input 
                    type="text" 
                    value={formData.purchaseOrder} 
                    onChange={(e) => handleChange('purchaseOrder', e.target.value)}
                    disabled={isStatusLocked}
                    className={`w-full p-2 border rounded outline-none ${isStatusLocked ? 'bg-gray-100 cursor-not-allowed' : 'border-gray-300 focus:border-brand-red'}`}
                  />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Montador</label>
              <input 
                type="text" 
                value={formData.fitter} 
                onChange={(e) => handleChange('fitter', e.target.value)}
                disabled={isSensitiveFieldsLocked}
                className={`w-full p-2 border rounded outline-none ${isSensitiveFieldsLocked ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300 focus:border-brand-red'}`}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Responsável</label>
              <input 
                type="text" 
                value={formData.responsible} 
                onChange={(e) => handleChange('responsible', e.target.value)}
                disabled={isSensitiveFieldsLocked}
                className={`w-full p-2 border rounded outline-none ${isSensitiveFieldsLocked ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300 focus:border-brand-red'}`}
              />
            </div>
          </div>
        </section>

        {/* COLUNA DIREITA: Listas de Itens e Fotos */}
        {/* lg:col-span-8 significa 2/3 da tela no desktop */}
        <div className="col-span-1 lg:col-span-8 xl:col-span-9 space-y-6">
          
          {/* Services / Factory Items */}
          <section className={`bg-white border rounded-lg overflow-hidden shadow-sm ${isCanceled ? 'opacity-75 grayscale' : ''}`}>
            <div className="bg-gray-100 p-3 border-b">
              <h2 className="font-bold text-gray-700 text-sm flex items-center gap-2">
                {formData.type === 'Produção' ? 'SERVIÇOS' : 'PEÇAS DE FÁBRICA'} <span className="text-xs bg-gray-200 text-gray-600 px-2 rounded-full">{formData.services.length}</span>
              </h2>
            </div>
            
            {/* Lista de Itens Adicionados */}
            <div className="p-2 space-y-2">
              {formData.services.map((service) => (
                <div key={service.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50/50 flex justify-between items-start group">
                  <div className="flex-1 pr-2">
                    <div className="flex gap-2 text-xs font-bold text-gray-600 mb-1">
                      <span className="bg-white border px-1.5 rounded">{service.quantity} qtd</span>
                      {formData.type === 'Produção' ? (
                        <span className="bg-white border px-1.5 rounded">{service.volume} vol</span>
                      ) : (
                        <>
                          {service.color && <span className="bg-white border px-1.5 rounded">Cor: {service.color}</span>}
                          {service.reason && (
                            <span className={`px-1.5 rounded border ${
                              service.reason === 'Batida' ? 'bg-red-50 text-red-600 border-red-100' :
                              service.reason === 'Faltante' ? 'bg-yellow-50 text-yellow-600 border-yellow-100' :
                              'bg-blue-50 text-blue-600 border-blue-100'
                            }`}>
                              {service.reason}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    {/* Especificação em Negrito */}
                    {service.specification && <p className="text-sm font-bold text-gray-800 leading-snug mb-0.5">{service.specification}</p>}
                    {/* Descrição em fonte menor e normal */}
                    {service.description && <p className="text-xs text-gray-500 leading-snug">{service.description}</p>}
                  </div>
                  {!isStatusLocked && (
                    <button type="button" onClick={() => removeServiceRow(service.id)} className="text-gray-300 hover:text-red-500 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {formData.services.length === 0 && (
                <p className="text-center text-xs text-gray-400 py-3 italic">Nenhum item adicionado.</p>
              )}
            </div>

            {/* Área de Inclusão (Fica sempre aberta) */}
            {!isStatusLocked && (
              <div className="bg-gray-50 p-3 border-t">
                <div className="grid grid-cols-4 gap-2 mb-2">
                    <div>
                      <label className="text-[10px] text-gray-500 font-bold uppercase">Qtd</label>
                      <input 
                        type="number" 
                        value={newService.quantity} 
                        onChange={(e) => setNewService({...newService, quantity: parseInt(e.target.value)})} 
                        className="w-full p-2 border rounded text-sm bg-white" 
                      />
                    </div>
                    {formData.type === 'Produção' ? (
                      <>
                        <div>
                          <label className="text-[10px] text-gray-500 font-bold uppercase">Vol</label>
                          <input 
                            type="number" 
                            value={newService.volume ?? ''} 
                            onChange={(e) => setNewService({...newService, volume: e.target.value ? parseInt(e.target.value) : undefined})} 
                            className="w-full p-2 border rounded text-sm bg-white" 
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] text-gray-500 font-bold uppercase">Espec. (Medidas)</label>
                          <input 
                            type="text" 
                            value={newService.specification} 
                            onChange={(e) => setNewService({...newService, specification: e.target.value})} 
                            className="w-full p-2 border rounded text-sm bg-white" 
                          />
                        </div>
                        <div className="col-span-4">
                          <label className="text-[10px] text-gray-500 font-bold uppercase">Descrição</label>
                          <input 
                            type="text"
                            value={newService.description} 
                            onChange={(e) => setNewService({...newService, description: e.target.value})} 
                            className="w-full p-2 border rounded text-sm bg-white" 
                            placeholder="Descreva o serviço..."
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="text-[10px] text-gray-500 font-bold uppercase">Cor</label>
                          <input 
                            type="text" 
                            value={newService.color || ''} 
                            onChange={(e) => setNewService({...newService, color: e.target.value})} 
                            className="w-full p-2 border rounded text-sm bg-white" 
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] text-gray-500 font-bold uppercase">Medida</label>
                          <input 
                            type="text" 
                            value={newService.specification} 
                            onChange={(e) => setNewService({...newService, specification: e.target.value})} 
                            className="w-full p-2 border rounded text-sm bg-white" 
                            placeholder="Ex: 500x300"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] text-gray-500 font-bold uppercase">Motivo</label>
                          <select 
                            value={newService.reason || ''} 
                            onChange={(e) => setNewService({...newService, reason: e.target.value as any})} 
                            className="w-full p-2 border rounded text-sm bg-white"
                          >
                            <option value="">Selecione...</option>
                            <option value="Batida">Batida</option>
                            <option value="Faltante">Faltante</option>
                            <option value="Medida Errada">Medida Errada</option>
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] text-gray-500 font-bold uppercase">Descrição (Opcional)</label>
                          <input 
                            type="text"
                            value={newService.description} 
                            onChange={(e) => setNewService({...newService, description: e.target.value})} 
                            className="w-full p-2 border rounded text-sm bg-white" 
                            placeholder="Obs..."
                          />
                        </div>
                      </>
                    )}
                </div>
                <button 
                    type="button" 
                    onClick={handleAddService} 
                    className="w-full bg-brand-dark text-white p-2 rounded text-sm font-bold flex items-center justify-center gap-2 hover:bg-black transition"
                >
                    <Plus className="w-4 h-4" /> {formData.type === 'Produção' ? 'INCLUIR SERVIÇO' : 'INCLUIR PEÇA'}
                </button>
              </div>
            )}
          </section>

          {/* Deliveries - Only for Production */}
          {formData.type === 'Produção' && (
            <section className={`bg-white border rounded-lg overflow-hidden shadow-sm ${isCanceled ? 'opacity-75 grayscale' : ''}`}>
            <div className="bg-gray-100 p-3 border-b">
              <h2 className="font-bold text-gray-700 text-sm flex items-center gap-2">
                ENTREGAS <span className="text-xs bg-gray-200 text-gray-600 px-2 rounded-full">{formData.deliveryItems.length}</span>
              </h2>
            </div>

            {/* Lista de Itens Adicionados */}
            <div className="p-2 space-y-2">
              {formData.deliveryItems.map((item) => (
                <div key={item.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50/50 flex justify-between items-start group">
                  <div className="flex-1 pr-2">
                    <div className="flex gap-2 text-xs font-bold text-gray-600 mb-1">
                      <span className="bg-white border px-1.5 rounded">{item.quantity} qtd</span>
                      <span className={`border px-1.5 rounded ${item.deliveryOk === 'Sim' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                          OK: {item.deliveryOk}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-800 leading-snug">{item.description}</p>
                    <div className="flex gap-2 mt-1">
                      {item.color && <span className="text-xs text-gray-500">Cor: {item.color}</span>}
                      {item.supplier && <span className="text-xs text-gray-500">Forn: {item.supplier}</span>}
                    </div>
                  </div>
                  {!isStatusLocked && (
                    <button type="button" onClick={() => removeDeliveryRow(item.id)} className="text-gray-300 hover:text-red-500 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {formData.deliveryItems.length === 0 && (
                <p className="text-center text-xs text-gray-400 py-3 italic">Nenhum item de entrega adicionado.</p>
              )}
            </div>

            {/* Área de Inclusão (Fica sempre aberta) */}
            {!isStatusLocked && (
              <div className="bg-gray-50 p-3 border-t">
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    <div>
                      <label className="text-[10px] text-gray-500 font-bold uppercase">Qtd</label>
                      <input 
                        type="number" 
                        value={newDelivery.quantity} 
                        onChange={(e) => setNewDelivery({...newDelivery, quantity: parseInt(e.target.value)})} 
                        className="w-full p-2 border rounded text-sm bg-white" 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 font-bold uppercase">Cor</label>
                      <input 
                        type="text" 
                        value={newDelivery.color} 
                        onChange={(e) => setNewDelivery({...newDelivery, color: e.target.value})} 
                        className="w-full p-2 border rounded text-sm bg-white" 
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] text-gray-500 font-bold uppercase">Fornecedor</label>
                      <input 
                        type="text" 
                        value={newDelivery.supplier} 
                        onChange={(e) => setNewDelivery({...newDelivery, supplier: e.target.value})} 
                        className="w-full p-2 border rounded text-sm bg-white" 
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="text-[10px] text-gray-500 font-bold uppercase">Descrição</label>
                      <input 
                        type="text" 
                        value={newDelivery.description} 
                        onChange={(e) => setNewDelivery({...newDelivery, description: e.target.value})} 
                        className="w-full p-2 border rounded text-sm bg-white" 
                        placeholder="Item..."
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 font-bold uppercase">OK?</label>
                      <select 
                        value={newDelivery.deliveryOk} 
                        onChange={(e) => setNewDelivery({...newDelivery, deliveryOk: e.target.value})} 
                        className="w-full p-2 border rounded text-sm bg-white"
                      >
                        <option value="Sim">Sim</option>
                        <option value="Não">Não</option>
                      </select>
                    </div>
                  </div>
                  <button 
                    type="button" 
                    onClick={handleAddDelivery} 
                    className="w-full bg-brand-dark text-white p-2 rounded text-sm font-bold flex items-center justify-center gap-2 hover:bg-black transition"
                >
                    <Plus className="w-4 h-4" /> INCLUIR ENTREGA
                </button>
              </div>
            )}
          </section>
          )}

          {/* Photos */}
          <section className={`bg-white border rounded-lg overflow-hidden shadow-sm ${isCanceled ? 'opacity-75 grayscale' : ''}`}>
            <div className="bg-gray-100 p-3 flex justify-between items-center border-b">
              <h2 className="font-bold text-gray-700 text-sm">FOTOS</h2>
              <label className={`cursor-pointer flex items-center text-xs font-bold p-1 rounded ${isCompressing || isStatusLocked ? 'text-gray-400 cursor-not-allowed' : 'text-brand-red hover:bg-red-50'}`}>
                <Camera className="w-4 h-4 mr-1" /> {isCompressing ? '...' : 'ADICIONAR'}
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={isCompressing || isStatusLocked} />
              </label>
            </div>
            <div className="p-3 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {formData.photos.map((photo) => {
                const driveThumb = getDriveThumbnailUrl(photo.url || '');
                
                return (
                <div key={photo.id} className="relative group border rounded-lg overflow-hidden h-32 bg-gray-100">
                  {photo.dataUrl ? (
                    <img src={photo.dataUrl} alt="Attachment" className="w-full h-full object-cover" />
                  ) : driveThumb ? (
                    <div className="w-full h-full relative">
                        <img src={driveThumb} alt="Drive Thumbnail" className="w-full h-full object-cover opacity-90" />
                        <a href={photo.url} target="_blank" rel="noopener noreferrer" className="absolute top-1 left-1 bg-white/80 p-1 rounded-full text-blue-600 hover:bg-white">
                            <ExternalLink className="w-3 h-3" />
                        </a>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-blue-50">
                        <Cloud className="w-8 h-8 text-blue-400 mb-1" />
                        <span className="text-[10px] font-bold text-blue-600 mb-1 uppercase">Salvo no Drive</span>
                        {photo.url && (
                          <a href={photo.url} target="_blank" rel="noopener noreferrer" className="bg-white border border-blue-200 text-blue-600 px-2 py-1 rounded text-xs flex items-center shadow-sm hover:bg-blue-50">
                            <ExternalLink className="w-3 h-3 mr-1" /> Abrir
                          </a>
                        )}
                    </div>
                  )}
                  
                  {!isStatusLocked && (
                    <button type="button" onClick={() => removePhoto(photo.id)} className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-full opacity-75 hover:opacity-100 z-10">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                  <input
                    type="text"
                    value={photo.caption}
                    disabled={isStatusLocked}
                    onChange={(e) => {
                      setFormData(prev => ({
                        ...prev,
                        photos: prev.photos.map(p => p.id === photo.id ? { ...p, caption: e.target.value } : p)
                      }));
                    }}
                    className="absolute bottom-0 w-full text-xs p-1 bg-white/90 border-t outline-none text-center z-10 disabled:text-gray-500"
                    placeholder="Legenda..."
                  />
                </div>
              );
              })}
              {formData.photos.length === 0 && (
                <p className="col-span-full text-center text-xs text-gray-400 py-2">Nenhuma foto adicionada.</p>
              )}
            </div>
          </section>
        </div>
      </form>
    </div>
  );
};

export default RequisitionForm;
