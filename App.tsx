import React, { useState, useEffect, useRef } from 'react';
import RequisitionList from './components/RequisitionList';
import RequisitionForm from './components/RequisitionForm';
import LoginScreen from './components/LoginScreen';
import UserManagement from './components/UserManagement';
import NotificationToast from './components/NotificationToast';
import { Requisition, User } from './types';
import { getRequisitions, deleteFromGoogleSheets } from './services/googleSheets';
import { Loader2 } from 'lucide-react';
import { playNotificationSound } from './utils/sound';

type AppView = 'login' | 'list' | 'create' | 'edit' | 'users';

function App() {
  const [view, setView] = useState<AppView>('login');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const [selectedReq, setSelectedReq] = useState<Requisition | null>(null);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Notification State
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState('');
  const lastReqCountRef = useRef<number>(0);
  const intervalRef = useRef<any>(null);

  // Verificação de sessão salva (opcional, por enquanto força login)
  useEffect(() => {
    const savedUser = localStorage.getItem('todeschini_user');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
      setView('list');
    }

    // Solicitar permissão de notificação do sistema ao carregar
    if ('Notification' in window) {
      Notification.requestPermission();
    }
  }, []);

  const loadData = async (isBackgroundPoll = false) => {
      if (!isBackgroundPoll) setIsLoading(true);
      
      // Carrega cache local primeiro se não for poll
      if (!isBackgroundPoll) {
        const localSaved = localStorage.getItem('todeschini_reqs');
        if (localSaved) {
          try {
            const parsed = JSON.parse(localSaved);
            if (Array.isArray(parsed)) {
               setRequisitions(parsed);
               lastReqCountRef.current = parsed.length;
            }
          } catch (e) { console.error("Erro cache", e); }
        }
      }

      try {
        const cloudData = await getRequisitions();
        if (cloudData && Array.isArray(cloudData) && cloudData.length > 0) {
          // Sort by creation date (desc)
          cloudData.sort((a, b) => {
             const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
             const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
             const safeTimeA = isNaN(timeA) ? 0 : timeA;
             const safeTimeB = isNaN(timeB) ? 0 : timeB;
             return safeTimeB - safeTimeA;
          });

          // DETECT NEW ITEMS or UPDATES (Para qualquer usuário, se a contagem mudar, avisa)
          if (isBackgroundPoll) {
             const newCount = cloudData.length;
             const prevCount = lastReqCountRef.current;
             
             if (newCount > prevCount && prevCount > 0) {
                // Nova requisição detectada!
                const diff = newCount - prevCount;
                const msg = `${diff} nova(s) requisição(ões) encontrada(s).`;
                triggerAlert(msg);
             }
             // Poderíamos detectar atualizações de status também comparando snapshots, 
             // mas por simplicidade, apenas atualizamos a lista.
          }

          setRequisitions(cloudData);
          lastReqCountRef.current = cloudData.length;
          localStorage.setItem('todeschini_reqs', JSON.stringify(cloudData));
        }
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
      }
      if (!isBackgroundPoll) setIsLoading(false);
  };

  const triggerAlert = (msg: string) => {
    // 1. Som
    playNotificationSound();
    
    // 2. Popup In-App
    setNotificationMsg(msg);
    setShowNotification(true);

    // 3. Notificação do Sistema (funciona com tela minimizada)
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Todeschini App', {
        body: msg,
        icon: 'https://cdn-icons-png.flaticon.com/512/1048/1048329.png' // Icone generico de lista
      });
    }
  };

  // Efeito de Polling para TODOS os usuários
  useEffect(() => {
    if (currentUser) {
      // Carrega inicial
      loadData(false);

      // Inicia intervalo de 15 segundos para todos
      intervalRef.current = setInterval(() => {
        console.log("Sincronizando dados...");
        loadData(true);
      }, 15000); // 15 segundos

      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [currentUser]);

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('todeschini_user', JSON.stringify(user));
    setView('list');
    
    // Solicita permissão novamente no login
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('todeschini_user');
    setView('login');
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const handleSave = (req: Requisition) => {
    // Atualização otimista
    setRequisitions(prev => {
      const safePrev = Array.isArray(prev) ? prev : [];
      const exists = safePrev.find(r => r.id === req.id);
      let newList;
      if (exists) {
        newList = safePrev.map(r => r.id === req.id ? req : r);
      } else {
        newList = [req, ...safePrev];
      }
      
      // Atualiza referencia para nao disparar alerta falso para quem salvou
      lastReqCountRef.current = newList.length; 
      
      localStorage.setItem('todeschini_reqs', JSON.stringify(newList));
      return newList;
    });
    
    setView('list');
    setSelectedReq(null);
  };

  const handleDelete = async (id: string) => {
    setRequisitions(prev => {
      const newList = prev.filter(req => req.id !== id);
      lastReqCountRef.current = newList.length; 
      localStorage.setItem('todeschini_reqs', JSON.stringify(newList));
      return newList;
    });
    
    setView('list');
    setSelectedReq(null);

    try {
       await deleteFromGoogleSheets(id);
    } catch (e) {
      console.error("Erro exclusão cloud", e);
    }
  };

  const calculateNextRequisitionNumber = () => {
    if (requisitions.length === 0) return 'R-1000';
    let maxNum = 0;
    requisitions.forEach(req => {
      if (req.requisitionNumber) {
        const numStr = req.requisitionNumber.replace(/\D/g, ''); 
        const num = parseInt(numStr, 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
    return maxNum > 0 ? `R-${maxNum + 1}` : 'R-1000';
  };

  // --- Lógica de Filtro baseada no Role ---
  const getFilteredRequisitions = () => {
    if (!currentUser) return [];
    // Gestor e Operacional veem tudo
    if (currentUser.role === 'gestor' || currentUser.role === 'operacional') return requisitions;
    
    return requisitions.filter(r => {
      const isFitterName = r.fitter && r.fitter.toLowerCase() === currentUser.name.toLowerCase();
      const isCreator = r.createdBy === currentUser.username;
      return isFitterName || isCreator;
    });
  };

  if (view === 'login' || !currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="bg-gray-50 min-h-screen font-sans text-gray-900 relative">
      
      <NotificationToast 
        message={notificationMsg}
        isVisible={showNotification}
        onClose={() => setShowNotification(false)}
        onClick={() => {
           setShowNotification(false);
           // Se estivermos em outra tela, volta pra lista
           if (view !== 'list') setView('list');
           // Recarrega forçadamente para garantir que a lista na tela esteja atualizada
           loadData(false);
        }}
      />

      {view === 'users' && (
        <UserManagement 
           currentUser={currentUser} 
           onClose={() => setView('list')} 
        />
      )}

      {view === 'list' && (
        <>
          {isLoading && requisitions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-screen text-gray-500">
              <Loader2 className="w-10 h-10 animate-spin mb-4 text-brand-red" />
              <p>Sincronizando...</p>
            </div>
          ) : (
            <RequisitionList 
              requisitions={getFilteredRequisitions()} 
              onCreateNew={(type) => {
                setSelectedReq({ type } as any);
                setView('create');
              }}
              onSelect={(req) => {
                setSelectedReq(req);
                setView('edit');
              }}
              onManageUsers={() => setView('users')}
              isManager={currentUser.role === 'gestor'} // Apenas gestor pode gerenciar usuários de fato
              onLogout={handleLogout}
              username={currentUser.name}
              onRefresh={() => loadData(false)}
            />
          )}
        </>
      )}
      
      {(view === 'create' || view === 'edit') && (
        <RequisitionForm 
          initialData={selectedReq}
          suggestedNumber={view === 'create' ? calculateNextRequisitionNumber() : undefined}
          onSave={handleSave}
          // Apenas gestor recebe a função handleDelete. Operacional recebe undefined.
          onDelete={currentUser.role === 'gestor' ? handleDelete : undefined} 
          onCancel={() => {
            setView('list');
            setSelectedReq(null);
          }}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}

export default App;