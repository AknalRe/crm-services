import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color?: 'emerald' | 'blue' | 'amber' | 'rose' | 'indigo' | 'purple';
  trend?: {
    value: string;
    positive?: boolean;
  };
  onClick?: () => void;
}

const ICON_COLOR_CLASSES: Record<NonNullable<StatCardProps['color']>, string> = {
  emerald: 'text-emerald-600',
  blue: 'text-blue-600',
  amber: 'text-amber-600',
  rose: 'text-red-600',
  indigo: 'text-indigo-600',
  purple: 'text-purple-600',
};

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'indigo',
  trend,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg p-5 border border-gray-200 transition-colors ${
        onClick ? 'cursor-pointer hover:border-gray-300' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider truncate">
            {title}
          </p>
          <div className="mt-1.5 flex items-baseline gap-2.5 flex-wrap">
            <h3 className="text-2xl font-bold text-gray-900 tracking-tight tabular-nums">
              {value}
            </h3>
            {trend && (
              <span
                className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                  trend.positive
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {trend.value}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="mt-1.5 text-xs text-gray-500 truncate">{subtitle}</p>
          )}
        </div>

        <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${ICON_COLOR_CLASSES[color]}`} />
      </div>
    </div>
  );
};

export default StatCard;
