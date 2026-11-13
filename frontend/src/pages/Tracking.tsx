import React, { useEffect, useState, useCallback } from 'react';
import {
  CheckCheck,
  Check,
  Search,
  Eye,
  AlertCircle,
  RefreshCw,
  Phone,
} from 'lucide-react';
import api from '../services/api';
import { CampaignRecipient } from '../types';
import { Button } from '../components/ui/Button';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/StateBlocks';

export const Tracking: React.FC = () => {
  const [items, setItems] = useState<CampaignRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);

  const fetchTracking = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getRecipientTracking({
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        search: search || undefined,
        limit: 100,
      });
      setItems(res.data);
      setTotal(res.pagination.total);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Gagal memuat log pengiriman');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    fetchTracking();
    const interval = setInterval(fetchTracking, 6000);
    return () => clearInterval(interval);
  }, [fetchTracking]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTracking();
  };

  return (
    <div className="space-y-5">
      {/* Filters Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari nama lead, nomor WA, atau kampanye..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 bg-white border border-gray-200 rounded-md text-[13px] text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-500"
          />
        </form>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-gray-100 p-1 rounded-md text-xs font-medium overflow-x-auto">
            {[
              { id: 'ALL', label: 'Semua' },
              { id: 'READ', label: 'Dibaca' },
              { id: 'DELIVERED', label: 'Sampai' },
              { id: 'SENT', label: 'Terkirim' },
              { id: 'FAILED', label: 'Gagal' },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setStatusFilter(st.id)}
                className={`px-3 py-1 rounded transition-colors whitespace-nowrap ${
                  statusFilter === st.id
                    ? 'bg-white text-gray-900 shadow-sm font-semibold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={fetchTracking}
            isLoading={loading}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Segarkan
          </Button>
        </div>
      </div>

      {/* Tracking Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading && items.length === 0 ? (
          <LoadingState message="Memuat log pengiriman lead..." />
        ) : error && items.length === 0 ? (
          <ErrorState message={error} onRetry={fetchTracking} />
        ) : items.length === 0 ? (
          <EmptyState
            title="Belum ada event pengiriman"
            description="Riwayat status centang satu, centang dua, dan centang biru akan muncul setelah siaran dikirim."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Lead &amp; Nomor</th>
                  <th className="py-3 px-4">Kampanye</th>
                  <th className="py-3 px-4">Status WhatsApp</th>
                  <th className="py-3 px-4">Terkirim</th>
                  <th className="py-3 px-4">Sampai</th>
                  <th className="py-3 px-4">Dibaca</th>
                  <th className="py-3 px-4">Pesan</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {items.map((item) => {
                  const isRead = item.status === 'READ';
                  const isDelivered = item.status === 'DELIVERED';
                  const isSent = item.status === 'SENT';
                  const isFailed = item.status === 'FAILED';

                  return (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-gray-900">
                          {item.contact?.nama_lengkap || 'Kontak WhatsApp'}
                        </div>
                        <div className="text-[11px] text-gray-500 font-mono flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-gray-400" />
                          <span>+{item.phone}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-medium text-gray-800">
                          {item.campaign?.title || 'Siaran Langsung'}
                        </span>
                        {item.campaign?.type && (
                          <span className="block text-[10px] text-gray-400 uppercase mt-0.5">
                            {item.campaign.type}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${
                            isRead
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : isDelivered
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : isSent
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : isFailed
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : 'bg-gray-100 text-gray-700 border-gray-200'
                          }`}
                        >
                          {isRead ? (
                            <>
                              <Eye className="w-3 h-3" />
                              <span>Dibaca (Centang Biru)</span>
                            </>
                          ) : isDelivered ? (
                            <>
                              <CheckCheck className="w-3 h-3" />
                              <span>Sampai (Centang Dua)</span>
                            </>
                          ) : isSent ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>Terkirim</span>
                            </>
                          ) : isFailed ? (
                            <>
                              <AlertCircle className="w-3 h-3" />
                              <span>Gagal</span>
                            </>
                          ) : (
                            <span>Antrean</span>
                          )}
                        </span>

                        {item.errorMessage && (
                          <div className="text-[11px] text-red-600 mt-1 max-w-xs truncate">
                            {item.errorMessage}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-gray-600 font-mono tabular-nums">
                        {item.sentAt
                          ? new Date(item.sentAt).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })
                          : '-'}
                      </td>

                      <td className="py-3 px-4 text-emerald-700 font-mono tabular-nums font-medium">
                        {item.deliveredAt
                          ? new Date(item.deliveredAt).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })
                          : '-'}
                      </td>

                      <td className="py-3 px-4 text-indigo-700 font-mono tabular-nums font-semibold">
                        {item.readAt
                          ? new Date(item.readAt).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })
                          : '-'}
                      </td>

                      <td className="py-3 px-4 max-w-xs truncate text-gray-600">
                        <span title={item.personalizedMessage}>{item.personalizedMessage}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 flex items-center justify-between flex-wrap gap-2">
          <span className="tabular-nums">
            Menampilkan <strong className="text-gray-900">{items.length}</strong> dari{' '}
            <strong className="text-gray-900">{total}</strong> event pengiriman
          </span>
          <span className="text-[11px] text-gray-400">
            Status diperbarui otomatis saat webhook WAHA menerima pembaruan
          </span>
        </div>
      </div>
    </div>
  );
};

export default Tracking;
