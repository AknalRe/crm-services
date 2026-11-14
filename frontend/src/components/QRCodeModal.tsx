import React, { useEffect, useState, useCallback, useRef } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../services/api';
import { WahaStatus } from '../types';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStatusChange?: (status: WahaStatus) => void;
  sessionName?: string;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({
  isOpen,
  onClose,
  onStatusChange,
  sessionName,
}) => {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('CHECKING');
  const [error, setError] = useState<string | null>(null);

  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const statusRef = useRef(status);
  statusRef.current = status;
  const inFlightRef = useRef(false);
  const autoRecoveredRef = useRef(false);

  const fetchQr = useCallback(async (forceRecover = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const statusRes = await api.getWahaStatus();
      if (onStatusChangeRef.current) onStatusChangeRef.current(statusRes);

      if (!sessionName && statusRes.sessionStatus === 'WORKING') {
        setStatus('WORKING');
        return;
      }

      if (
        forceRecover ||
        (!sessionName &&
          (statusRes.sessionStatus === 'STOPPED' ||
            statusRes.sessionStatus === 'NOT_FOUND' ||
            (statusRes.sessionStatus === 'FAILED' && !autoRecoveredRef.current)))
      ) {
        autoRecoveredRef.current = true;
        try {
          await api.startWahaSession(sessionName);
        } catch {
          // Abaikan jika sesi sedang dimulai
        }
      }

      const qrRes = await api.getWahaQr(sessionName);
      if (qrRes.status === 'FAILED' && !autoRecoveredRef.current) {
        autoRecoveredRef.current = true;
        try {
          await api.startWahaSession(sessionName);
          const retryRes = await api.getWahaQr(sessionName);
          setStatus(retryRes.status);
          if (retryRes.qr && retryRes.qr.startsWith('data:image/')) {
            setQrCode(retryRes.qr);
          } else {
            setQrCode(null);
          }
          return;
        } catch {
          // Lanjutkan tampilkan status FAILED bila pemulihan gagal
        }
      }
      setStatus(qrRes.status);
      if (qrRes.qr && qrRes.qr.startsWith('data:image/')) {
        setQrCode(qrRes.qr);
      } else if (qrRes.status === 'FAILED' || qrRes.status === 'STOPPED') {
        setQrCode(null);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Gagal memuat QR Code');
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [sessionName]);

  useEffect(() => {
    if (!isOpen) {
      autoRecoveredRef.current = false;
      return;
    }
    void fetchQr();

    const timer = setInterval(() => {
      if (statusRef.current !== 'WORKING' && statusRef.current !== 'FAILED') {
        void fetchQr();
      }
    }, 6000);

    return () => clearInterval(timer);
  }, [isOpen, fetchQr]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Scan QR WhatsApp"
      subtitle="Tautkan akun WhatsApp Anda ke server WAHA CRM"
      maxWidthClass="max-w-md"
      footer={
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span
              className={`w-2 h-2 rounded-full ${
                status === 'WORKING' ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            <span>
              Status: <strong className="font-mono text-gray-900">{status}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void fetchQr(true)}
              isLoading={loading}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Segarkan QR
            </Button>
            <Button variant="primary" size="sm" onClick={onClose}>
              Tutup
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col items-center justify-center min-h-[260px] bg-gray-50 rounded-lg border border-gray-200 p-4">
        {loading && !qrCode ? (
          <div className="flex flex-col items-center gap-2.5">
            <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin" />
            <span className="text-xs text-gray-500">Menghubungkan ke WAHA...</span>
          </div>
        ) : status === 'WORKING' ? (
          <div className="text-center py-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2.5" />
            <h4 className="font-semibold text-gray-900 text-sm">WhatsApp Sudah Terhubung</h4>
            <p className="text-xs text-gray-500 mt-1 max-w-xs">
              Sesi WhatsApp aktif dan siap mengirim siaran serta melayani percakapan pelanggan.
            </p>
          </div>
        ) : qrCode ? (
          <div className="flex flex-col items-center">
            <div className="bg-white p-3 rounded-lg border border-gray-200">
              <img
                src={qrCode}
                alt="WhatsApp QR Code"
                className="w-56 h-56 object-contain"
              />
            </div>
            <p className="text-xs text-gray-500 mt-3 text-center">
              Buka WhatsApp &gt; Perangkat Tertaut &gt; Tautkan Perangkat
            </p>
          </div>
        ) : (
          <div className="text-center py-4">
            <AlertCircle className="w-8 h-8 text-amber-600 mx-auto mb-2" />
            <p className="text-xs text-gray-600 max-w-xs">
              {error || 'Sedang menyiapkan sesi QR...'}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default QRCodeModal;
