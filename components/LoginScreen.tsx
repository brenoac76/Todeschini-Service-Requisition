import React, { useState } from 'react';
import { User, Lock, Loader2 } from 'lucide-react';
import { loginUser } from '../services/googleSheets';
import { User as UserType } from '../types';
import { todeschiniLogo } from '../utils/assets';

interface LoginScreenProps {
  onLoginSuccess: (user: UserType) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const result = await loginUser(username, password);
      
      if (result.success && result.user) {
        onLoginSuccess(result.user);
      } else {
        setError(result.message || 'Login inválido');
      }
    } catch (err) {
      setError('Erro ao conectar com o servidor');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-200 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          {/* Logo ajustado para h-16 (64px) */}
          <img src={todeschiniLogo} alt="Todeschini" className="h-16 w-auto mb-6 object-contain" />
          <p className="text-gray-500 font-medium">Sistema de Requisições</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Usuário</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-brand-red focus:border-transparent outline-none"
                placeholder="Digite seu usuário"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-brand-red focus:border-transparent outline-none"
                placeholder="Digite sua senha"
                required
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded text-sm text-center font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full bg-brand-red text-white py-3 rounded-lg font-bold shadow-lg flex justify-center items-center ${isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-red-700 transition'}`}
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'ENTRAR'}
          </button>
        </form>
        
        <div className="mt-6 text-center text-xs text-gray-400">
           Caso tenha esquecido a senha, contate o administrador.
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;