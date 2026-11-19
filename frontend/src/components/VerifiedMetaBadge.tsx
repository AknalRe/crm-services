import React from 'react';
import { BadgeCheck } from 'lucide-react';
import { Contact } from '../types';

interface VerifiedMetaBadgeProps {
  contact?: Pick<Contact, 'is_verified' | 'verified_name' | 'verified_level'> | null;
  showLabel?: boolean;
  className?: string;
}

export const VerifiedMetaBadge: React.FC<VerifiedMetaBadgeProps> = ({
  contact,
  showLabel = false,
  className = '',
}) => {
  if (!contact?.is_verified && !contact?.verified_name) return null;

  const title = contact.verified_name
    ? `Verified Meta: ${contact.verified_name}`
    : 'Akun Resmi Verified Meta';

  if (showLabel) {
    return (
      <span
        title={title}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-semibold shrink-0 ${className}`}
      >
        <BadgeCheck className="w-3 h-3 text-sky-500 shrink-0" />
        <span>Verified Meta</span>
      </span>
    );
  }

  return (
    <span title={title} aria-label={title} className={`inline-flex items-center shrink-0 ${className}`}>
      <BadgeCheck className="w-3.5 h-3.5 text-sky-500" />
    </span>
  );
};
