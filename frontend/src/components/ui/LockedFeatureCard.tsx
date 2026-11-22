import React from 'react';
import { Lock } from 'lucide-react';
import { Button } from './Button';

interface LockedFeatureCardProps {
  title: string;
  description: string;
  onOpenPlans?: () => void;
}

export const LockedFeatureCard: React.FC<LockedFeatureCardProps> = ({
  title,
  description,
  onOpenPlans,
}) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-8 max-w-xl mx-auto mt-8 text-center space-y-4 shadow-xs">
      <div className="w-12 h-12 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
        <Lock className="w-6 h-6" />
      </div>
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
      </div>
      {onOpenPlans && (
        <div className="pt-2">
          <Button variant="primary" size="md" onClick={onOpenPlans}>
            Lihat &amp; Upgrade Paket Lisensi
          </Button>
        </div>
      )}
    </div>
  );
};
