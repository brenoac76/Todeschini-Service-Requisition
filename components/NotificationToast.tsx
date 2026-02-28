import React, { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';

interface NotificationToastProps {
  message: string;
  isVisible: boolean;
  onClose: () => void;
  onClick: () => void;
}

const NotificationToast: React.FC<NotificationToastProps> = ({ message, isVisible, onClose, onClick }) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setShow(true);
      // Auto-hide após 10 segundos
      const timer = setTimeout(() => {
        onClose();
      }, 10000);
      return () => clearTimeout(timer);
    } else {
      setShow(false);
    }
  }, [isVisible, onClose]);

  if (!show) return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-bounce-in">
      <div className="bg-white border-l-4 border-brand-red rounded shadow-2xl p-4 w-72 flex items-start justify-between relative">
        <div 
          className="flex items-center gap-3 cursor-pointer flex-1"
          onClick={() => {
             onClick();
             onClose();
          }}
        >
          <div className="bg-red-100 p-2 rounded-full">
            <Bell className="w-6 h-6 text-brand-red animate-pulse" />
          </div>
          <div>
            <h4 className="font-bold text-gray-800 text-sm">Nova Requisição!</h4>
            <p className="text-xs text-gray-600 mt-1 leading-snug">{message}</p>
          </div>
        </div>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="text-gray-400 hover:text-gray-600 p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default NotificationToast;