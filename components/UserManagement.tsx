import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Plus, Loader2, Key, Trash2, Pencil } from 'lucide-react';
import { User, UserRole } from '../types';
import { registerUser, changePassword, getUsers, deleteUser, updateUser } from '../services/googleSheets';

interface UserManagementProps {
  currentUser: User;
  onClose: () => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ currentUser, onClose }) => {
  const [activeTab, setActiveTab] = useState<'create' | 'password' | 'list'>('list');
  const [userList, setUserList] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  // Create/Edit Form
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ username: '', password: '', name: '', role: 'montador' as UserRole });

  // Password Form
  const [passData, setPassData] = useState({ username: '', oldPassword: '', newPassword: '' });

  useEffect(() => {
    if (activeTab === 'list' && currentUser.role === 'gestor') {
      loadUsers();
    }
  }, [activeTab]);

  const loadUsers = async () => {
    setIsLoading(true);
    const users = await getUsers();
    setUserList(users);
    setIsLoading(false);
  };

  const resetForm = () => {
    setFormData({ username: '', password: '', name: '', role: 'montador' });
    setIsEditing(false);
    setMsg({ type: '', text: '' });
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    let res;
    if (isEditing) {
       // Na edição, a senha é opcional
       res = await updateUser(formData);
    } else {
       res = await registerUser(formData);
    }

    setIsLoading(false);
    if (res.success) {
      setMsg({ type: 'success', text: isEditing ? 'Usuário atualizado!' : 'Usuário criado com sucesso!' });
      if (isEditing) {
         // Volta pra lista e recarrega
         setIsEditing(false);
         setActiveTab('list');
         loadUsers();
      } else {
         resetForm();
      }
    } else {
      setMsg({ type: 'error', text: res.message || 'Erro ao salvar usuário' });
    }
  };

  const handleEditClick = (user: User) => {
     setFormData({
        username: user.username,
        name: user.name,
        role: user.role,
        password: '' // Senha em branco na edição (só preenche se quiser trocar)
     });
     setIsEditing(true);
     setActiveTab('create'); // Reutiliza a aba de criação
  };

  const handleDeleteClick = async (username: string) => {
     if (username === 'admin' || username === currentUser.username) {
        alert("Não é possível excluir este usuário.");
        return;
     }

     if (!window.confirm(`Tem certeza que deseja excluir o usuário "${username}"?`)) return;

     setIsLoading(true);
     const res = await deleteUser(username);
     setIsLoading(false);

     if (res.success) {
        setMsg({ type: 'success', text: 'Usuário excluído.' });
        loadUsers();
     } else {
        setMsg({ type: 'error', text: res.message || 'Erro ao excluir.' });
     }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Se for montador, precisa da senha antiga. Se for gestor mudando a de outros, não precisa (mas o form pede user)
    const targetUser = currentUser.role === 'gestor' && activeTab === 'list' ? passData.username : currentUser.username;
    const oldPass = currentUser.role === 'gestor' ? undefined : passData.oldPassword; // Gestor reseta direto

    const res = await changePassword(targetUser, passData.newPassword, oldPass);
    setIsLoading(false);
    if (res.success) {
      setMsg({ type: 'success', text: 'Senha alterada com sucesso!' });
      setPassData({ username: '', oldPassword: '', newPassword: '' });
    } else {
      setMsg({ type: 'error', text: res.message || 'Erro ao alterar senha' });
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white border-b shadow-sm px-4 py-3 flex items-center gap-2">
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-6 h-6 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-800">
          {currentUser.role === 'gestor' ? 'Gestão de Usuários' : 'Minha Conta'}
        </h1>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-6">
        
        {/* Tabs for Gestor */}
        {currentUser.role === 'gestor' && (
          <div className="flex bg-white rounded-lg shadow-sm p-1 mb-4">
            <button 
              onClick={() => { setActiveTab('list'); setIsEditing(false); setMsg({ type: '', text: '' }); }}
              className={`flex-1 py-2 text-sm font-bold rounded ${activeTab === 'list' ? 'bg-brand-red text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              Lista
            </button>
            <button 
              onClick={() => { setActiveTab('create'); resetForm(); }}
              className={`flex-1 py-2 text-sm font-bold rounded ${activeTab === 'create' ? 'bg-brand-red text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {isEditing ? 'Editar' : 'Novo'}
            </button>
            <button 
              onClick={() => { setActiveTab('password'); setIsEditing(false); setMsg({ type: '', text: '' }); }}
              className={`flex-1 py-2 text-sm font-bold rounded ${activeTab === 'password' ? 'bg-brand-red text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              Senha
            </button>
          </div>
        )}

        {msg.text && (
          <div className={`p-3 rounded text-sm text-center font-medium ${msg.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {msg.text}
          </div>
        )}

        {/* LISTA DE USUÁRIOS (Apenas Gestor) */}
        {activeTab === 'list' && currentUser.role === 'gestor' && (
          <div className="space-y-3">
             {isLoading ? (
               <div className="flex justify-center p-4"><Loader2 className="animate-spin text-brand-red"/></div>
             ) : (
               userList.map(u => (
                 <div key={u.username} className="bg-white p-4 rounded-lg shadow-sm flex justify-between items-center group">
                    <div>
                      <p className="font-bold text-gray-800">{u.name}</p>
                      <p className="text-xs text-gray-500">{u.username} | <span className="uppercase">{u.role}</span></p>
                    </div>
                    
                    {/* Ações */}
                    <div className="flex gap-2">
                       <button 
                          onClick={() => handleEditClick(u)}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition"
                          title="Editar"
                       >
                          <Pencil className="w-4 h-4" />
                       </button>
                       <button 
                          onClick={() => handleDeleteClick(u.username)}
                          className={`p-2 rounded-full transition ${u.username === 'admin' || u.username === currentUser.username ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'}`}
                          disabled={u.username === 'admin' || u.username === currentUser.username}
                          title="Excluir"
                       >
                          <Trash2 className="w-4 h-4" />
                       </button>
                    </div>
                 </div>
               ))
             )}
          </div>
        )}

        {/* CRIAR/EDITAR USUÁRIO */}
        {activeTab === 'create' && currentUser.role === 'gestor' && (
          <form onSubmit={handleSaveUser} className="bg-white p-6 rounded-lg shadow-sm space-y-4">
            <h3 className="font-bold text-gray-700 border-b pb-2">
               {isEditing ? `Editar Usuário: ${formData.username}` : 'Cadastrar Novo Usuário'}
            </h3>
            
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Nome Completo</label>
              <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 border rounded" />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Usuário (Login)</label>
              <input 
                 type="text" 
                 required 
                 value={formData.username} 
                 onChange={e => setFormData({...formData, username: e.target.value})} 
                 className={`w-full p-2 border rounded ${isEditing ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                 disabled={isEditing}
                 title={isEditing ? "O login não pode ser alterado" : ""}
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">
                 {isEditing ? 'Nova Senha (Opcional)' : 'Senha Inicial'}
              </label>
              <input 
                 type="text" 
                 required={!isEditing} 
                 value={formData.password} 
                 onChange={e => setFormData({...formData, password: e.target.value})} 
                 className="w-full p-2 border rounded" 
                 placeholder={isEditing ? "Deixe em branco para manter a atual" : ""}
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Função</label>
              <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole})} className="w-full p-2 border rounded bg-white">
                <option value="montador">Montador</option>
                <option value="operacional">Operacional</option>
                <option value="gestor">Gestor</option>
              </select>
            </div>
            
            <div className="flex gap-2">
               {isEditing && (
                  <button type="button" onClick={() => { setIsEditing(false); setActiveTab('list'); }} className="flex-1 bg-gray-200 text-gray-700 py-2 rounded font-bold hover:bg-gray-300">
                     Cancelar
                  </button>
               )}
               <button disabled={isLoading} type="submit" className="flex-1 bg-brand-red text-white py-2 rounded font-bold hover:bg-red-700 flex justify-center">
                  {isLoading ? <Loader2 className="animate-spin" /> : (isEditing ? 'Salvar Alterações' : 'Cadastrar')}
               </button>
            </div>
          </form>
        )}

        {/* ALTERAR SENHA (Para todos) */}
        {(activeTab === 'password' || currentUser.role === 'montador' || currentUser.role === 'operacional') && (
          <form onSubmit={handleChangePassword} className="bg-white p-6 rounded-lg shadow-sm space-y-4">
             <h3 className="font-bold text-gray-700 border-b pb-2">Alterar Senha</h3>
             
             {currentUser.role === 'gestor' ? (
               // Gestor pode trocar a sua
               <input type="hidden" value={currentUser.username} />
             ) : (
                // Montador e Operacional precisam confirmar a antiga
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Senha Atual</label>
                  <input type="password" required value={passData.oldPassword} onChange={e => setPassData({...passData, oldPassword: e.target.value})} className="w-full p-2 border rounded" />
                </div>
             )}

             <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Nova Senha</label>
                <input type="password" required value={passData.newPassword} onChange={e => setPassData({...passData, newPassword: e.target.value})} className="w-full p-2 border rounded" />
             </div>

             <button disabled={isLoading} type="submit" className="w-full bg-brand-dark text-white py-2 rounded font-bold hover:bg-gray-800 flex justify-center">
                {isLoading ? <Loader2 className="animate-spin" /> : 'Salvar Nova Senha'}
             </button>
          </form>
        )}

      </div>
    </div>
  );
};

export default UserManagement;