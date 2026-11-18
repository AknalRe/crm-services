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
  emerald: 'text-slate-400',
  blue: 'text-slate-400',
  amber: 'text-slate-400',
  rose: 'text-rose-500',
  indigo: 'text-indigo-600',
  purple: 'text-slate-400',
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
      className={`bg-white rounded-lg p-3 sm:p-5 border border-gray-200 transition-colors ${
        onClick ? 'cursor-pointer hover:border-gray-300 active:bg-gray-50' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] sm:text-[11px] font-medium text-gray-500 uppercase tracking-wider truncate">
            {title}
          </p>
          <div className="mt-1 sm:mt-1.5 flex items-baseline gap-1.5 sm:gap-2.5 flex-wrap">
            <h3 className="text-lg sm:text-2xl font-bold text-gray-900 tracking-tight tabular-nums">
              {value}
            </h3>
            {trend && (
              <span
                className={`text-[10px] sm:text-[11px] font-semibold px-1.5 py-0.5 rounded ${
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
            <p className="mt-1 sm:mt-1.5 text-[11px] sm:text-xs text-gray-500 truncate">{subtitle}</p>
          )}
        </div>

        <Icon className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 mt-0.5 ${ICON_COLOR_CLASSES[color]}`} />
      </div>
    </div>
  );
};

export default StatCard;
