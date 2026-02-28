import React, { useState, useMemo } from 'react';
import { Search, Plus, FileText, User, Hash, ShoppingCart, RefreshCcw, UserX, ClipboardList, Hammer, CheckCircle2, Filter } from 'lucide-react';
import { Requisition, RequisitionStatus, RequisitionType } from '../types';
import { format } from 'date-fns';
import { todeschiniLogo } from '../utils/assets';

interface RequisitionListProps {
  requisitions: Requisition[];
  onCreateNew: (type: RequisitionType) => void;
  onSelect: (req: Requisition) => void;
  onManageUsers: () => void;
  isManager: boolean;
  onLogout: () => void;
  username: string;
  onRefresh: () => void;
}

type FilterType = 'Todas' | RequisitionStatus;

const RequisitionList: React.FC<RequisitionListProps> = ({ requisitions, onCreateNew, onSelect, onManageUsers, isManager, onLogout, username, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterType>('Todas');
  const [activeType, setActiveType] = useState<RequisitionType>('Produção');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const formatDateSafe = (dateString: string | undefined) => {
    try {
      if (!dateString) return '';
      if (dateString.includes('-')) {
        const parts = dateString.split('-');
        if (parts.length === 3) {
          const year = parseInt(parts[0]);
          const month = parseInt(parts[1]) - 1; 
          const day = parseInt(parts[2]);
          const localDate = new Date(year, month, day);
          return format(localDate, 'dd/MM/yy'); // Data curta com ano
        }
      }
      return format(new Date(dateString), 'dd/MM/yy');
    } catch (e) {
      return '';
    }
  };

  const parseDateAndFormat = (dateString: string | undefined) => {
    if (!dateString) return null;
    
    try {
      // Tenta parsing de ISO
      let d = new Date(dateString);
      
      // Fallback para strings antigas 'YYYY-MM-DD' que podem vir do timezone local
      if (dateString.includes('-') && !dateString.includes('T')) {
          const parts = dateString.split('-');
          if (parts.length === 3) {
            d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          }
      }

      if (isNaN(d.getTime())) return null;

      return {
        date: format(d, 'dd/MM/yy'),
        time: format(d, 'HH:mm')
      };
    } catch (e) {
      return null;
    }
  };

  const safeRequisitions = Array.isArray(requisitions) ? requisitions : [];

  // Normaliza o status para lidar com dados antigos
  const getNormalizedStatus = (status: string): RequisitionStatus => {
     if (status === 'Recebido') return 'Recebida';
     if (status === 'Feito') return 'Concluída';
     return status as RequisitionStatus;
  }

  // Calcula contagens para os filtros baseados no tipo ativo
  const counts = useMemo(() => {
    const typeFiltered = safeRequisitions.filter(r => (r.type || 'Produção') === activeType);
    return {
      Todas: typeFiltered.length,
      Recebida: typeFiltered.filter(r => getNormalizedStatus(r.status) === 'Recebida').length,
      'Em Progresso': typeFiltered.filter(r => getNormalizedStatus(r.status) === 'Em Progresso').length,
      Concluída: typeFiltered.filter(r => getNormalizedStatus(r.status) === 'Concluída').length,
      Cancelada: typeFiltered.filter(r => getNormalizedStatus(r.status) === 'Cancelada').length,
    };
  }, [safeRequisitions, activeType]);

  const filtered = safeRequisitions.filter(r => {
    if (!r) return false;
    
    // Filtro de Tipo (Aba)
    // Se não tiver tipo (dados antigos), assume Produção
    const reqType = r.type || 'Produção';
    if (reqType !== activeType) return false;

    // Filtro de Texto
    const term = searchTerm.toLowerCase();
    const client = r.clientName ? r.clientName.toLowerCase() : '';
    const number = r.requisitionNumber ? r.requisitionNumber.toLowerCase() : '';
    const date = r.date ? r.date.toString() : '';
    const po = r.purchaseOrder ? r.purchaseOrder.toLowerCase() : '';
    
    const matchesSearch = client.includes(term) ||
      number.includes(term) ||
      date.includes(term) ||
      po.includes(term);

    // Filtro de Status
    const normalizedStatus = getNormalizedStatus(r.status);
    const matchesStatus = statusFilter === 'Todas' || normalizedStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const renderTimeline = (req: Requisition) => {
    const status = getNormalizedStatus(req.status);
    
    // Níveis: 0 = Recebida, 1 = Em Progresso, 2 = Concluída
    let currentLevel = 0;
    if (status === 'Em Progresso') currentLevel = 1;
    if (status === 'Concluída') currentLevel = 2;

    const steps = [
      { 
        icon: ClipboardList, 
        label: 'Recebida', 
        date: req.date,
        activeClass: 'bg-brand-red border-brand-red text-white',
        activeText: 'text-brand-red',
        lineColor: 'bg-brand-red'
      },
      { 
        icon: Hammer, 
        label: 'Em Progresso', 
        date: req.dateInProgress,
        activeClass: 'bg-yellow-500 border-yellow-500 text-white',
        activeText: 'text-yellow-600',
        lineColor: 'bg-yellow-500'
      },
      { 
        icon: CheckCircle2, 
        label: 'Concluída', 
        date: req.dateDone,
        activeClass: 'bg-green-600 border-green-600 text-white',
        activeText: 'text-green-600',
        lineColor: 'bg-green-600'
      }
    ];

    return (
      // AQUI ESTÁ A MUDANÇA: lg:w-[580px] força a largura aproximada de 15cm no desktop
      <div className="flex items-start justify-between w-full max-w-[280px] lg:w-[580px] lg:max-w-none mx-auto mt-1">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = index <= currentLevel;
          const formatted = isActive ? parseDateAndFormat(step.date) : null;
          
          // Lógica de Cores da Linha (Dividida em Esquerda e Direita para cada bolinha)
          
          // A linha à ESQUERDA deste item deve ser colorida se ESTE item estiver ativo
          // (Significa que o progresso chegou até aqui)
          const leftLineColor = isActive ? step.lineColor : 'bg-gray-200';
          
          // A linha à DIREITA deste item deve ser colorida se o PRÓXIMO item estiver ativo
          // (Significa que o progresso passou daqui para o próximo)
          const nextStepActive = (index + 1) <= currentLevel;
          const rightLineColor = nextStepActive && steps[index + 1] ? steps[index + 1].lineColor : 'bg-gray-200';

          return (
            <div key={index} className="relative flex-1 flex flex-col items-center group">
              
              {/* LINHA DE CONEXÃO (Fundo Absoluto) */}
              {/* h-[2px] para maior visibilidade. top ajustado para o centro da bolinha */}
              <div className="absolute top-[14px] sm:top-[16px] left-0 right-0 h-[2px] flex w-full">
                 {/* Metade Esquerda (Só existe se não for o primeiro) */}
                 <div className={`h-full w-1/2 ${index === 0 ? 'bg-transparent' : leftLineColor}`} />
                 {/* Metade Direita (Só existe se não for o último) */}
                 <div className={`h-full w-1/2 ${index === steps.length - 1 ? 'bg-transparent' : rightLineColor}`} />
              </div>

              {/* BOLINHA (Z-Index maior para ficar sobre a linha) */}
              <div 
                className={`relative z-10 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 shadow-sm
                  ${isActive ? step.activeClass : 'bg-white border-gray-200 text-gray-300'}
                `}
              >
                <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>

              {/* TEXTO */}
              <span className={`text-[9px] sm:text-[10px] mt-1 font-bold leading-tight text-center whitespace-nowrap relative z-10
                ${isActive ? step.activeText : 'text-gray-300'}
              `}>
                {step.label}
              </span>

              {/* DATA */}
              {formatted && (
                <div className="flex flex-col items-center mt-0.5 leading-none relative z-10">
                  <span className="text-[9px] text-gray-500 font-bold">
                    {formatted.date}
                  </span>
                  <span className="text-[8px] text-gray-400">
                    {formatted.time}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const filters: { id: FilterType; label: string; color: string }[] = [
    { id: 'Todas', label: 'Geral', color: 'bg-gray-800' },
    { id: 'Recebida', label: 'Recebidas', color: 'bg-gray-600' },
    { id: 'Em Progresso', label: 'Em Progresso', color: 'bg-yellow-600' },
    { id: 'Concluída', label: 'Concluídas', color: 'bg-green-600' },
    { id: 'Cancelada', label: 'Canceladas', color: 'bg-red-600' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header Mobile-Friendly Sticky */}
      <div className="bg-white shadow-sm sticky top-0 z-20">
        <div className="p-3 sm:p-4 pb-2">
          <div className="flex justify-between items-center mb-4">
            
            {/* Logo e Info Usuário */}
            <div className="flex items-center gap-2 flex-1 min-w-0 mr-1">
              <img src={todeschiniLogo} alt="Todeschini" className="h-10 sm:h-14 w-auto object-contain flex-shrink-0" />
              <div className="flex flex-col ml-1 border-l pl-2 sm:pl-3 border-gray-200 min-w-0">
                <span className="text-gray-400 text-[10px] uppercase tracking-wide leading-tight">Requisições</span>
                <span className="text-gray-700 text-xs font-bold truncate block max-w-[90px] sm:max-w-[150px]" title={username}>
                  {username}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-1.5 sm:gap-2 flex-shrink-0">
              <button
                onClick={handleRefresh}
                className={`bg-gray-100 text-gray-600 p-2 rounded-full hover:bg-gray-200 border border-gray-200 ${isRefreshing ? 'animate-spin' : ''}`}
                title="Atualizar Lista"
              >
                <RefreshCcw className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button
                onClick={onManageUsers}
                className="bg-gray-100 text-gray-600 p-2 rounded-full hover:bg-gray-200 border border-gray-200"
                title={isManager ? "Gerenciar Usuários" : "Minha Conta"}
              >
                <User className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button
                onClick={onLogout}
                className="bg-gray-100 text-gray-600 p-2 px-3 rounded-full text-[10px] sm:text-xs font-bold hover:bg-gray-200 border border-gray-200"
              >
                Sair
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar por cliente, número ou OC..."
                className="w-full pl-10 pr-4 py-3 bg-gray-100 border-none rounded-lg focus:ring-2 focus:ring-brand-red focus:bg-white transition outline-none text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button 
                onClick={() => onCreateNew(activeType)}
                className="bg-brand-red text-white p-2 px-4 rounded-lg shadow-md flex items-center gap-2 hover:bg-red-700 transition active:scale-95 flex-shrink-0"
              >
                <Plus className="w-6 h-6" />
                <span className="text-sm font-bold hidden sm:inline">Nova</span>
              </button>
          </div>
        </div>

        {/* Type Tabs */}
        <div className="px-3 sm:px-4 pb-2 flex border-b border-gray-100">
          <button
            onClick={() => setActiveType('Produção')}
            className={`flex-1 py-2 text-sm font-bold transition-all border-b-2 ${activeType === 'Produção' ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-400'}`}
          >
            Produção
          </button>
          <button
            onClick={() => setActiveType('Fábrica')}
            className={`flex-1 py-2 text-sm font-bold transition-all border-b-2 ${activeType === 'Fábrica' ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-400'}`}
          >
            Fábrica
          </button>
        </div>

        {/* Filter Tabs (Scrollable) */}
        <div className="px-3 sm:px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar border-b border-gray-100">
          {filters.map((f) => {
            const isActive = statusFilter === f.id;
            const count = counts[f.id] || 0;
            return (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`
                  flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border
                  ${isActive 
                    ? `${f.color} text-white border-transparent shadow-md transform scale-105` 
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}
                `}
              >
                <span>{f.label}</span>
                <span className={`
                  px-1.5 py-0.5 rounded-full text-[10px] 
                  ${isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-400'}
                `}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* List Area - AUMENTADA A LARGURA MÁXIMA PARA DESKTOP */}
      <div className="p-4 space-y-3 w-full lg:max-w-[98%] mx-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
               <FileText className="w-8 h-8 text-gray-300" />
            </div>
            <p className="font-medium text-gray-500">
              {searchTerm 
                ? 'Nenhum resultado para a busca.' 
                : statusFilter !== 'Todas' 
                  ? `Nenhuma requisição em "${statusFilter}".`
                  : 'Nenhuma requisição encontrada.'}
            </p>
            {safeRequisitions.length === 0 && (
               <p className="text-sm mt-2 text-gray-400">Toque no botão "+" para criar a primeira.</p>
            )}
          </div>
        ) : (
          filtered.map((req) => (
            <div 
              key={req.id || Math.random()} 
              onClick={() => onSelect(req)}
              // MUDANÇA: py-4 no mobile, py-2 no desktop (mais achatado). Flex row no desktop.
              className="bg-white p-4 lg:py-2 lg:px-4 rounded-xl shadow-sm border border-gray-100 active:scale-[0.98] transition cursor-pointer hover:shadow-md relative overflow-hidden group"
            >
              {/* Faixa lateral colorida se tiver OC ou Cancelada */}
              {req.purchaseOrder && (
                 <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-green-500 z-10"></div>
              )}
              {req.status === 'Cancelada' && (
                 <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-500 z-10"></div>
              )}

              {/* CARD CONTAINER - Flex column mobile, Flex row desktop */}
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between lg:gap-4">
                
                {/* PARTE ESQUERDA: ID, Cliente */}
                <div className="flex flex-col lg:flex-row lg:items-center lg:gap-4 flex-1 mb-2 lg:mb-0 pl-2">
                   <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded text-xs font-extrabold border tracking-wide whitespace-nowrap ${req.status === 'Cancelada' ? 'bg-gray-200 text-gray-500 border-gray-300 decoration-line-through' : 'bg-red-50 text-brand-red border-red-100'}`}>
                        {req.requisitionNumber || 'S/N'}
                      </span>
                   </div>
                   
                   <h3 className={`font-bold text-lg leading-tight transition-colors truncate ${req.status === 'Cancelada' ? 'text-gray-400' : 'text-gray-800 group-hover:text-brand-red'}`}>
                     {req.clientName || 'Cliente sem nome'}
                   </h3>
                </div>

                {/* PARTE CENTRAL (DETALHES): OC (Agora aqui), User, Itens */}
                <div className="flex flex-col lg:flex-row lg:items-center gap-1.5 lg:gap-6 text-sm text-gray-500 pl-2 lg:pl-0 lg:border-l lg:border-r lg:border-gray-100 lg:px-6">
                   {/* Mostrar quem cancelou se estiver cancelada */}
                   {req.status === 'Cancelada' && req.canceledBy && (
                     <div className="flex items-center gap-1.5 text-red-600 font-semibold lg:mr-2">
                        <UserX className="w-3.5 h-3.5" />
                        <span className="text-xs">Cancelado por: {req.canceledBy}</span>
                     </div>
                   )}

                   <div className="flex items-center justify-between lg:justify-start lg:gap-6 w-full lg:w-auto">
                      
                      {/* OC MOVEU PARA CÁ: ANTES DO NOME DO MONTADOR */}
                      {req.purchaseOrder && (
                        <div className="flex items-center gap-1.5 text-green-600 font-semibold text-xs bg-green-50 px-2 py-0.5 rounded border border-green-100 whitespace-nowrap">
                            <ShoppingCart className="w-3.5 h-3.5" />
                            <span>OC: {req.purchaseOrder}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-xs">{req.responsible || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Hash className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-xs">{(req.services?.length || 0) + (req.deliveryItems?.length || 0)} Itens</span>
                      </div>
                   </div>
                </div>
                
                {/* PARTE DIREITA: Timeline ou Badge */}
                <div className="flex items-center justify-center lg:justify-end pl-2 w-full lg:w-auto mt-3 lg:mt-0">
                  {req.status === 'Cancelada' ? (
                     <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border shadow-sm bg-red-100 text-red-700 border-red-200">
                        CANCELADA
                     </span>
                  ) : (
                     renderTimeline(req)
                  )}
                </div>

              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default RequisitionList;