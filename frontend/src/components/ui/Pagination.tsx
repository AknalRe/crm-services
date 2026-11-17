import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface TablePaginationProps {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  limitOptions?: number[];
  itemLabel?: string;
  loading?: boolean;
  extraContent?: React.ReactNode;
  className?: string;
}

const buildPageTokens = (currentPage: number, totalPages: number): Array<number | 'ellipsis-left' | 'ellipsis-right'> => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, idx) => idx + 1);
  }
  const tokens: Array<number | 'ellipsis-left' | 'ellipsis-right'> = [1];
  const windowStart = Math.max(2, currentPage - 1);
  const windowEnd = Math.min(totalPages - 1, currentPage + 1);

  if (windowStart > 2) {
    tokens.push('ellipsis-left');
  }
  for (let p = windowStart; p <= windowEnd; p++) {
    tokens.push(p);
  }
  if (windowEnd < totalPages - 1) {
    tokens.push('ellipsis-right');
  }
  tokens.push(totalPages);
  return tokens;
};

export const TablePagination: React.FC<TablePaginationProps> = ({
  page,
  limit,
  total,
  totalPages,
  onPageChange,
  onLimitChange,
  limitOptions = [25, 50, 100, 250],
  itemLabel = 'data',
  loading = false,
  extraContent,
  className = '',
}) => {
  const safeTotalPages = Math.max(1, totalPages || 1);
  const safePage = Math.min(Math.max(1, page), safeTotalPages);
  const startItem = total === 0 ? 0 : (safePage - 1) * limit + 1;
  const endItem = total === 0 ? 0 : Math.min(total, safePage * limit);
  const tokens = buildPageTokens(safePage, safeTotalPages);

  const mergedLimitOptions = limitOptions.includes(limit)
    ? limitOptions
    : [...limitOptions, limit].sort((a, b) => a - b);

  return (
    <div
      className={`px-4 py-3 bg-gray-50 border-t border-gray-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 text-xs text-gray-600 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="tabular-nums">
          {total === 0 ? (
            <>
              Tidak ada <strong className="text-gray-900">{itemLabel}</strong>
            </>
          ) : (
            <>
              Menampilkan <strong className="text-gray-900">{startItem.toLocaleString('id-ID')}</strong>–
              <strong className="text-gray-900">{endItem.toLocaleString('id-ID')}</strong> dari{' '}
              <strong className="text-gray-900">{total.toLocaleString('id-ID')}</strong> {itemLabel}
            </>
          )}
        </span>

        <label className="inline-flex items-center gap-1.5 text-gray-500">
          <span>Baris:</span>
          <select
            aria-label={`Jumlah ${itemLabel} per halaman`}
            value={limit}
            disabled={loading}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            className="h-7 px-2 rounded-md border border-gray-300 bg-white text-gray-800 text-xs font-medium tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 disabled:opacity-50"
          >
            {mergedLimitOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt} / hal
              </option>
            ))}
          </select>
        </label>

        {extraContent}
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-1 flex-wrap">
        <button
          type="button"
          title="Halaman pertama"
          disabled={loading || safePage <= 1}
          onClick={() => onPageChange(1)}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          title="Halaman sebelumnya"
          disabled={loading || safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className="h-7 px-2 inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Prev</span>
        </button>

        <div className="flex items-center gap-1 mx-0.5">
          {tokens.map((tok) =>
            typeof tok !== 'number' ? (
              <span key={tok} className="px-1.5 text-gray-400 select-none">
                ...
              </span>
            ) : (
              <button
                key={tok}
                type="button"
                disabled={loading}
                onClick={() => onPageChange(tok)}
                className={`h-7 min-w-[28px] px-2 rounded-md border text-xs font-medium tabular-nums transition-colors ${
                  tok === safePage
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50'
                }`}
              >
                {tok}
              </button>
            )
          )}
        </div>

        <button
          type="button"
          title="Halaman berikutnya"
          disabled={loading || safePage >= safeTotalPages}
          onClick={() => onPageChange(safePage + 1)}
          className="h-7 px-2 inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          title="Halaman terakhir"
          disabled={loading || safePage >= safeTotalPages}
          onClick={() => onPageChange(safeTotalPages)}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
