import React, { useEffect, useState } from 'react';
import { X, RefreshCw, CheckCircle, AlertCircle, Smartphone } from 'lucide-react';
import api from '../services/api';
import { WahaStatus } from '../types';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStatusChange?: (status: WahaStatus) => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({
  isOpen,
  onClose,
  onStatusChange,
}) => {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('CHECKING');
  const [error, setError] = useState<string | null>(null);

  const fetchQr = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Check status
      const statusRes = await api.getWahaStatus();
      if (onStatusChange) onStatusChange(statusRes);

      if (statusRes.sessionStatus === 'WORKING') {
        setStatus('WORKING');
        setLoading(false);
        return;
      }

      // If session is STOPPED or NOT_FOUND, start it first
      if (statusRes.sessionStatus === 'STOPPED' || statusRes.sessionStatus === 'NOT_FOUND') {
        try {
          await api.startWahaSession();
        } catch {}
      }

      // 2. Fetch QR
      const qrRes = await api.getWahaQr();
      setStatus(qrRes.status);
      if (qrRes.qr) {
        setQrCode(qrRes.qr);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Gagal memuat QR Code');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isOpen) {
      fetchQr();

      // Poll every 5 seconds while open until connected
      timer = setInterval(() => {
        if (status !== 'WORKING') {
          fetchQr();
        }
      }, 6000);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-slate-100">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-5">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Smartphone className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">Scan QR WhatsApp</h3>
          <p className="text-xs text-slate-500 mt-1">
            Tautkan akun WhatsApp Anda ke server WAHA CRM
          </p>
        </div>

        {/* Content Area */}
        <div className="flex flex-col items-center justify-center min-h-[260px] bg-slate-50 rounded-xl border border-slate-200 p-4">
          {loading && !qrCode ? (
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
              <span className="text-xs text-slate-500">Menghubungkan ke WAHA...</span>
            </div>
          ) : status === 'WORKING' ? (
            <div className="text-center py-6">
              <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
              <h4 className="font-semibold text-slate-800 text-base">WhatsApp Sudah Terhubung!</h4>
              <p className="text-xs text-slate-500 mt-1">
                Sesi WhatsApp sudah aktif dan siap mengirim broadcast & melayani leads.
              </p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold"
              >
                Tutup & Mulai
              </button>
            </div>
          ) : qrCode ? (
            <div className="flex flex-col items-center">
              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                <img
                  src={qrCode}
                  alt="WhatsApp QR Code"
                  className="w-56 h-56 object-contain"
                />
              </div>
              <p className="text-xs text-slate-500 mt-3 text-center">
                Buka WhatsApp &gt; Tautkan Perangkat &gt; Arahkan kamera ke layar ini
              </p>
            </div>
          ) : (
            <div className="text-center py-4">
              <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-2" />
              <p className="text-xs text-slate-600 max-w-xs">{error || 'Sedang menyiapkan sesi QR...'}</p>
              <button
                onClick={fetchQr}
                className="mt-3 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded text-xs font-medium inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Coba Lagi</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="mt-5 flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                status === 'WORKING' ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            <span>Status: <strong className="text-slate-700">{status}</strong></span>
          </div>

          <button
            onClick={fetchQr}
            disabled={loading}
            className="text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Segarkan QR</span>
          </button>
        </div>
      </div>
    </div>
  );
};
export default QRCodeModal;
