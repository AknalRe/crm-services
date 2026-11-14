import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Check,
  CreditCard,
  Receipt,
  Printer,
  CheckCircle2,
  Clock,
  Copy,
  RefreshCw,
} from 'lucide-react';
import { api } from '../services/api';
import { LicenseInfo, LicensePlan, LicenseOrder, PaymentMethodItem } from '../types';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useToast } from './ui/ToastProvider';
import { LoadingState, ErrorState } from './ui/StateBlocks';

interface PlansModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLicense: LicenseInfo | null;
  onLicenseUpdated: () => void;
  defaultBuyer?: { name: string; email: string };
}

export const PlansModal: React.FC<PlansModalProps> = ({
  isOpen,
  onClose,
  currentLicense,
  onLicenseUpdated,
  defaultBuyer,
}) => {
  const toast = useToast();
  const [plans, setPlans] = useState<LicensePlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [selectedPlanSlug, setSelectedPlanSlug] = useState<string>('pro-monthly');

  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeOrder, setActiveOrder] = useState<LicenseOrder | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodItem[]>([]);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const loadPlans = async () => {
    try {
      setLoadingPlans(true);
      setPlansError(null);
      const data = await api.getLicensePlans();
      setPlans(data);
      const highlighted = data.find((p) => p.highlighted);
      if (highlighted) {
        setSelectedPlanSlug(highlighted.slug);
      } else if (data.length > 0) {
        setSelectedPlanSlug(data[0].slug);
      }
    } catch (err: any) {
      setPlansError(err.response?.data?.error || err.message || 'Gagal memuat daftar paket dari Reneo');
    } finally {
      setLoadingPlans(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadPlans();
      setActiveOrder(null);
      setPaymentSuccess(false);
      if (defaultBuyer?.name && !buyerName) {
        setBuyerName(defaultBuyer.name);
      }
    }
  }, [isOpen, defaultBuyer?.name]);

  const handleCreateOrder = async () => {
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      const res = await api.createLicenseOrder({
        planSlug: selectedPlanSlug,
        buyerName: buyerName.trim() || defaultBuyer?.name || 'Pelanggan CRM',
        buyerEmail: defaultBuyer?.email,
        buyerPhone: buyerPhone.trim(),
        paymentMethod: 'transfer',
      });

      setActiveOrder(res.order);
      setPaymentMethods(res.paymentMethods || []);
      toast.success(`Invoice ${res.order.invoiceNumber} berhasil diterbitkan`);
    } catch (err: any) {
      toast.error('Gagal menerbitkan invoice: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckOrderStatus = async () => {
    if (!activeOrder || isPaying) return;
    try {
      setIsPaying(true);
      const res = await api.getLicenseOrder(activeOrder.publicId);
      setActiveOrder(res.order);
      if (res.paymentMethods) {
        setPaymentMethods(res.paymentMethods);
      }
      if (res.order.status === 'paid') {
        setPaymentSuccess(true);
        await api.syncLicense();
        onLicenseUpdated();
        toast.success('Pembayaran telah dikonfirmasi. Lisensi aktif!');
      } else {
        toast.info('Status invoice masih menunggu konfirmasi pembayaran.');
      }
    } catch (err: any) {
      toast.error('Gagal memeriksa status invoice: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsPaying(false);
    }
  };

  const copyValue = (label: string, value: string) => {
    navigator.clipboard.writeText(value);
    toast.success(`${label} disalin`);
  };

  const footerContent = !activeOrder ? (
    <div className="w-full flex items-center justify-between gap-3 flex-wrap">
      <div className="text-xs text-gray-500">
        Paket Terpilih:{' '}
        <strong className="text-gray-900">
          {plans.find((p) => p.slug === selectedPlanSlug)?.name || 'Pro Bulanan'}
        </strong>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
          Batal
        </Button>
        <Button
          variant="primary"
          onClick={handleCreateOrder}
          isLoading={isSubmitting}
          disabled={loadingPlans || plans.length === 0}
          leftIcon={<Receipt className="w-4 h-4" />}
        >
          Terbitkan Invoice
        </Button>
      </div>
    </div>
  ) : (
    <div className="w-full flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => window.print()}
          leftIcon={<Printer className="w-3.5 h-3.5" />}
        >
          Cetak
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setActiveOrder(null)} disabled={isPaying}>
          Ganti Paket
        </Button>
      </div>
      <div className="flex items-center gap-2">
        {!paymentSuccess && (
          <Button
            variant="primary"
            onClick={handleCheckOrderStatus}
            isLoading={isPaying}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Cek Status Pembayaran
          </Button>
        )}
        <Button variant="secondary" onClick={onClose} disabled={isPaying}>
          Selesai
        </Button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={activeOrder ? 'Tagihan & Invoice Lisensi' : 'Pilih Paket & Lisensi Reneo'}
      subtitle={
        activeOrder
          ? `Invoice ${activeOrder.invoiceNumber} diterbitkan melalui gateway Reneo`
          : 'Paket lisensi disinkronkan langsung dengan Reneo Panel'
      }
      maxWidthClass="max-w-4xl"
      isLoading={isSubmitting || isPaying}
      footer={footerContent}
    >
      <div className="space-y-5">
        {!activeOrder ? (
          <>
            {currentLicense && (
              <div className="p-3.5 rounded-lg border border-gray-200 bg-gray-50 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="text-emerald-600 shrink-0 w-4 h-4" />
                  <span className="text-gray-600">Status Saat Ini:</span>
                  <strong className="text-gray-900 font-semibold tabular-nums">
                    {currentLicense.plan} ({currentLicense.daysLeft} hari tersisa)
                  </strong>
                </div>
                <div className="font-mono text-[11px] text-gray-600 bg-white px-2 py-1 rounded border border-gray-200">
                  Key: {currentLicense.licenseKey}
                </div>
              </div>
            )}

            {loadingPlans ? (
              <LoadingState message="Mengambil daftar paket dari Reneo..." />
            ) : plansError ? (
              <ErrorState message={plansError} onRetry={loadPlans} />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {plans.map((p) => {
                  const isSelected = selectedPlanSlug === p.slug;
                  return (
                    <div
                      key={p.slug}
                      onClick={() => setSelectedPlanSlug(p.slug)}
                      className={`cursor-pointer rounded-lg p-4 border transition-colors flex flex-col justify-between relative ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                            {p.period === 'annual' ? '12 Bulan' : '1 Bulan'}
                          </span>
                          <div className="flex items-center gap-2">
                            {p.highlighted && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                Populer
                              </span>
                            )}
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                isSelected
                                  ? 'border-indigo-600 bg-indigo-600 text-white'
                                  : 'border-gray-300 bg-white'
                              }`}
                            >
                              {isSelected && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                            </div>
                          </div>
                        </div>

                        <div>
                          <h3 className="font-semibold text-sm text-gray-900">{p.name}</h3>
                          <p className="text-xs text-gray-500 mt-0.5">{p.tagline}</p>
                        </div>

                        <div className="text-xl font-bold text-gray-900 tabular-nums">
                          Rp {p.priceAmount.toLocaleString('id-ID')}
                          <span className="text-xs font-normal text-gray-500">
                            /{p.period === 'annual' ? 'thn' : 'bln'}
                          </span>
                        </div>

                        <div className="border-t border-gray-200 pt-3 space-y-1.5 text-xs text-gray-700">
                          <div className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{p.features?.maxContacts?.toLocaleString?.() || '10.000'} Kontak</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>
                              {p.features?.unlimitedBroadcast ? 'Siaran WA Unlimited' : 'Siaran WA Terjadwal'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>Otomasi Ucapan Ulang Tahun</span>
                          </div>
                          {p.features?.liveChat && (
                            <div className="flex items-center gap-2">
                              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>Live Chat CRM</span>
                            </div>
                          )}
                          {(p.features?.multiSession ?? p.features?.liveChat) && (
                            <div className="flex items-center gap-2">
                              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>
                                Multi-Sesi WhatsApp (hingga {p.features?.maxSessions || (p.slug?.includes('enterprise') ? 25 : 5)} sesi)
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="p-4 rounded-lg border border-gray-200 bg-gray-50 space-y-3.5 text-xs">
              <h4 className="font-semibold text-sm text-gray-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-gray-600" />
                Informasi Pemesan & Metode Pembayaran
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    Nama Pemesan (di Invoice)
                  </label>
                  <input
                    type="text"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    placeholder="Contoh: PT Sumber Makmur"
                    className="w-full h-9 px-3 text-[13px] rounded-md border border-gray-200 bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    Nomor WhatsApp Pembeli
                  </label>
                  <input
                    type="text"
                    value={buyerPhone}
                    onChange={(e) => setBuyerPhone(e.target.value)}
                    placeholder="Contoh: 08123456789"
                    className="w-full h-9 px-3 text-[13px] rounded-md border border-gray-200 bg-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="text-[11px] text-gray-500">
                Setelah invoice diterbitkan, instruksi rekening / e-wallet pembayaran resmi dari Pengaturan Reneo akan ditampilkan beserta kode unik transfer.
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-4 text-xs">
            {paymentSuccess ? (
              <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <strong className="block text-sm">Pembayaran Berhasil Diverifikasi</strong>
                  <span>Lisensi Reneo CRM Anda telah diperpanjang dan aktif.</span>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <strong className="block text-sm">Menunggu Pembayaran</strong>
                    <span>
                      Batas waktu:{' '}
                      {new Date(activeOrder.expiresAt).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
                <span className="font-mono text-xs font-semibold px-2 py-1 rounded bg-white border border-amber-200 text-amber-900">
                  {activeOrder.invoiceNumber}
                </span>
              </div>
            )}

            <div className="p-4 rounded-lg border border-gray-200 bg-white space-y-3">
              <div className="flex items-start justify-between border-b border-gray-200 pb-3">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-gray-400 tracking-wider">
                    Penerbit
                  </span>
                  <h4 className="font-semibold text-gray-900 text-sm">Reneo Platform</h4>
                  <p className="text-gray-500 text-[11px]">PT Reneo Teknologi Indonesia</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-semibold text-gray-400 tracking-wider">
                    Ditagihkan Kepada
                  </span>
                  <h4 className="font-semibold text-gray-900 text-sm">{activeOrder.buyerName}</h4>
                  {activeOrder.buyerPhone && (
                    <p className="text-gray-500 font-mono text-[11px]">{activeOrder.buyerPhone}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-gray-700">
                  <span>
                    {activeOrder.appName} - {activeOrder.planName} ({activeOrder.months} Bulan)
                  </span>
                  <span className="font-semibold tabular-nums">
                    Rp {activeOrder.amountList.toLocaleString('id-ID')}
                  </span>
                </div>
                {activeOrder.uniqueCode > 0 && (
                  <div className="flex items-center justify-between text-gray-500 text-[11px]">
                    <span>Kode Unik Pembayaran</span>
                    <span className="font-mono tabular-nums">Rp {activeOrder.uniqueCode}</span>
                  </div>
                )}
                <div className="border-t border-gray-200 pt-2 flex items-center justify-between font-bold text-sm text-gray-900">
                  <span>Transfer Tepat Sejumlah</span>
                  <div className="flex items-center gap-2">
                    <span className="text-base text-indigo-600 tabular-nums font-mono">
                      Rp {activeOrder.amountTotal.toLocaleString('id-ID')}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyValue('Nominal transfer', String(activeOrder.amountTotal))}
                      className="p-1 rounded border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                      title="Salin nominal"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {!paymentSuccess && (
              <div className="p-4 rounded-lg border border-gray-200 bg-gray-50 space-y-2.5">
                <h5 className="font-semibold text-gray-900 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-gray-600" />
                  Rekening / Tujuan Pembayaran Resmi
                </h5>
                {paymentMethods.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {paymentMethods.map((m) => (
                      <div
                        key={m.id}
                        className="p-2.5 rounded-md border border-gray-200 bg-white text-[11px] flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-gray-900 block">{m.name}</span>
                          <span className="font-mono font-semibold text-indigo-600 text-xs break-all">
                            {m.account}
                          </span>
                          <span className="block text-gray-500 text-[10px]">a/n {m.holder}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyValue(m.name, m.account)}
                          className="p-1 rounded border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50 shrink-0"
                          title="Salin nomor rekening"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2.5">
                    Belum ada metode pembayaran aktif di Pengaturan Situs Reneo. Silakan hubungi admin atau lengkapi rekening di Reneo Panel.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
