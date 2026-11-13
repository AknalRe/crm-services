import React from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export const LoadingState: React.FC<{ message?: string; className?: string }> = ({
  message = 'Memuat data...',
  className = 'py-12',
}) => (
  <div className={`flex flex-col items-center justify-center text-center gap-2.5 text-gray-500 ${className}`}>
    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
    <p className="text-[13px] font-medium text-gray-600">{message}</p>
  </div>
);

export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon, title, description, action, className = 'py-12 px-4' }) => (
  <div className={`flex flex-col items-center justify-center text-center ${className}`}>
    {icon && <div className="text-gray-400 mb-3">{icon}</div>}
    <p className="text-sm font-semibold text-gray-900">{title}</p>
    {description && (
      <p className="text-[13px] text-gray-500 mt-1 max-w-md leading-relaxed">{description}</p>
    )}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const ErrorState: React.FC<{
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}> = ({
  title = 'Gagal memuat data',
  message,
  onRetry,
  className = 'py-12 px-4',
}) => (
  <div className={`flex flex-col items-center justify-center text-center ${className}`}>
    <AlertCircle className="w-7 h-7 text-red-500 mb-2.5" />
    <p className="text-sm font-semibold text-gray-900">{title}</p>
    <p className="text-[13px] text-gray-500 mt-1 max-w-md leading-relaxed">{message}</p>
    {onRetry && (
      <div className="mt-4">
        <Button variant="secondary" size="sm" onClick={onRetry} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
          Coba Lagi
        </Button>
      </div>
    )}
  </div>
);

