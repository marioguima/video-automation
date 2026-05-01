
import React, { useEffect } from 'react';
import { X, Download, ExternalLink } from 'lucide-react';

interface ImageModalProps {
  url: string | null;
  onClose: () => void;
}

const ImageModal: React.FC<ImageModalProps> = ({ url, onClose }) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!url) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div className="absolute top-6 right-6 flex items-center gap-4">
        <a 
          href={url} 
          download 
          target="_blank" 
          rel="noopener noreferrer"
          className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          <Download size={20} />
        </a>
        <button 
          onClick={onClose}
          className="p-3 bg-orange-600 hover:bg-orange-700 text-white rounded-full shadow-lg transition-all transform hover:rotate-90"
        >
          <X size={24} />
        </button>
      </div>

      <div 
        className="relative max-w-5xl w-full max-h-[90vh] flex items-center justify-center animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <img 
          src={url} 
          alt="Full size view" 
          className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl border border-white/10"
        />
      </div>
    </div>
  );
};

export default ImageModal;
