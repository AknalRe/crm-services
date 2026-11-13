import React, { useEffect, useState } from 'react';
import {
  CheckCheck,
  Check,
  Clock,
  Search,
  Filter,
  Eye,
  AlertCircle,
  RefreshCw,
  Phone,
} from 'lucide-react';
import api from '../services/api';
import { CampaignRecipient } from '../types';

export const Tracking: React.FC = () => {
  const [items, setItems] = useState<CampaignRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);

  const fetchTracking = async () => {
    setLoading(true);
    try {
      const res = await api.getRecipientTracking({
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        search: search || undefined,
        limit: 100,
      });
      setItems(res.data);
      setTotal(res.pagination.total);
    } catch (err) {
      console.error('Error fetching tracking log:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTracking();
    const interval = setInterval(fetchTracking, 6000); // Live poll every 6s
    return () => clearInterval(interval);
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTracking();
  };

  return (
    <div className="space-y-6">
      {/* Filters Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari nama lead, nomor WA, atau kampanye..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </form>

        <div className="flex items-center gap-2">
          {/* Status Filter Chips */}
          <div className="flex bg-slate-100 p-1 rounded-lg text-xs font-medium">
            {['ALL', 'READ', 'DELIVERED', 'SENT', 'FAILED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st === 'ALL'
                  ? 'Semua'
                  : st === 'READ'
                  ? 'Dibaca (Centang Biru)'
                  : st === 'DELIVERED'
                  ? 'Sampai (Centang Dua)'
                  : st === 'SENT'
                  ? 'Terkirim'
                  : 'Gagal'}
              </button>
            ))}
          </div>

          <button
            onClick={fetchTracking}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200"
            title="Segarkan"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tracking Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Nama Lead &amp; Nomor</th>
                <th className="py-3 px-4">Kampanye Siaran</th>
                <th className="py-3 px-4">Status Centang WhatsApp</th>
                <th className="py-3 px-4">Waktu Terkirim</th>
                <th className="py-3 px-4">Waktu Tersampaikan</th>
                <th className="py-3 px-4">Waktu Dibaca</th>
                <th className="py-3 px-4">Pesan</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Memuat log pengiriman lead...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Belum ada data event pengiriman lead.
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const isRead = item.status === 'READ';
                  const isDelivered = item.status === 'DELIVERED';
                  const isSent = item.status === 'SENT';
                  const isFailed = item.status === 'FAILED';

                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      {/* Contact Info */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">
                          {item.contact?.nama_lengkap || 'Kontak WhatsApp'}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-300" />
                          <span>+{item.phone}</span>
                        </div>
                      </td>

                      {/* Campaign Title */}
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-700">
                          {item.campaign?.title || 'Direct Broadcast'}
                        </span>
                        {item.campaign?.type && (
                          <span className="block text-[10px] text-slate-400 uppercase">
                            {item.campaign.type}
                          </span>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            isRead
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : isDelivered
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : isSent
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : isFailed
                              ? 'bg-red-100 text-red-800 border border-red-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {isRead ? (
                            <>
                              <Eye className="w-3.5 h-3.5 text-purple-600" />
                              <span>Dibaca (Centang Biru)</span>
                            </>
                          ) : isDelivered ? (
                            <>
                              <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Sampai (Centang Dua)</span>
                            </>
                          ) : isSent ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-blue-600" />
                              <span>Terkirim (Centang Satu)</span>
                            </>
                          ) : isFailed ? (
                            <>
                              <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                              <span>Gagal Terkirim</span>
                            </>
                          ) : (
                            <span>Antrean (Pending)</span>
                          )}
                        </span>

                        {item.errorMessage && (
                          <div className="text-[10px] text-red-600 mt-1 max-w-xs truncate">
                            {item.errorMessage}
                          </div>
                        )}
                      </td>

                      {/* Timestamps */}
                      <td className="py-3 px-4 text-slate-600">
                        {item.sentAt ? (
                          new Date(item.sentAt).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-emerald-700 font-medium">
                        {item.deliveredAt ? (
                          new Date(item.deliveredAt).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-purple-700 font-bold">
                        {item.readAt ? (
                          new Date(item.readAt).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Message Snippet */}
                      <td className="py-3 px-4 max-w-xs truncate text-slate-500">
                        <span title={item.personalizedMessage}>
                          {item.personalizedMessage}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
          <span>Menampilkan <strong>{items.length}</strong> event pengiriman</span>
          <span className="text-[11px] text-slate-400">
            Status diperbarui otomatis setiap kali webhook WAHA menerima tanda centang
          </span>
        </div>
      </div>
    </div>
  );
};
export default Tracking;

