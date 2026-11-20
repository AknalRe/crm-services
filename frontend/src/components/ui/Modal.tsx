import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  isLoading?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  maxWidthClass = 'max-w-lg',
  isLoading = false,
  children,
  footer,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/45 backdrop-blur-[1px]"
      onClick={() => {
        if (!isLoading) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full ${maxWidthClass} bg-white border border-gray-200 rounded-xl sm:rounded-lg shadow-lg overflow-hidden flex flex-col max-h-[94dvh] sm:max-h-[90dvh]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2.5 sm:gap-4 px-3.5 sm:px-5 py-3 sm:py-4 border-b border-gray-200 bg-white">
          <div className="min-w-0">
            <h3 className="text-[15px] sm:text-base font-semibold text-gray-900 leading-tight">{title}</h3>
            {subtitle && (
              <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 leading-snug sm:leading-relaxed line-clamp-2 sm:line-clamp-none">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition-colors disabled:opacity-40 shrink-0"
            aria-label="Tutup dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-3.5 sm:px-5 py-3 sm:py-4 overflow-y-auto flex-1">{children}</div>

        {footer && (
          <div className="px-3.5 sm:px-5 py-2.5 sm:py-3.5 border-t border-gray-200 bg-gray-50 flex flex-wrap items-center justify-end gap-2 sm:gap-2.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

