import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
  Zap,
  Check,
  X,
  CreditCard,
  Building,
  Wallet,
  Receipt,
  Printer,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { api } from '../services/api';
import { LicenseInfo, LicensePlan, LicenseOrder, PaymentMethodItem } from '../types';

interface PlansModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLicense: LicenseInfo | null;
  onLicenseUpdated: () => void;
}

export const PlansModal: React.FC<PlansModalProps> = ({
  isOpen,
  onClose,
  currentLicense,
  onLicenseUpdated,
}) => {
  const [plans, setPlans] = useState<LicensePlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [selectedPlanSlug, setSelectedPlanSlug] = useState<string>('pro-monthly');

  // Buyer inputs
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'saldo' | 'qris' | 'transfer'>('saldo');

  // Order & Invoice states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeOrder, setActiveOrder] = useState<LicenseOrder | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodItem[]>([]);
  const [invoiceUrl, setInvoiceUrl] = useState('');
  const [isPaying, setIsPaying] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadPlans();
      setActiveOrder(null);
      setPaymentSuccess(false);
    }
  }, [isOpen]);

  const loadPlans = async () => {
    try {
      setLoadingPlans(true);
      const data = await api.getLicensePlans();
      setPlans(data);
      const highlighted = data.find((p) => p.highlighted);
      if (highlighted) {
        setSelectedPlanSlug(highlighted.slug);
      } else if (data.length > 0) {
        setSelectedPlanSlug(data[0].slug);
      }
    } catch (err) {
      console.error('Failed to load plans from Reneo:', err);
    } finally {
      setLoadingPlans(false);
    }
  };

  const handleCreateOrder = async () => {
    try {
      setIsSubmitting(true);
      const res = await api.createLicenseOrder({
        planSlug: selectedPlanSlug,
        buyerName: buyerName || 'Pelanggan CRM',
        buyerPhone,
        paymentMethod,
      });

      setActiveOrder(res.order);
      setPaymentMethods(res.paymentMethods || []);
      setInvoiceUrl(res.invoiceUrl || '');
    } catch (err: any) {
      alert('Gagal menerbitkan invoice: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePayOrder = async () => {
    if (!activeOrder) return;
    try {
      setIsPaying(true);
      const res = await api.payLicenseOrder(activeOrder.publicId, paymentMethod);
      setActiveOrder(res.order);
      setPaymentSuccess(true);
      onLicenseUpdated();
    } catch (err: any) {
      alert('Gagal memproses pembayaran: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsPaying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative bg-white dark:bg-slate-900 rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {activeOrder ? 'Lembar Tagihan & Invoice Lisensi' : 'Pilih Paket & Terbitkan Invoice'}
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                  Reneo Managed
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {activeOrder
                  ? `Invoice ${activeOrder.invoiceNumber} diterbitkan resmi melalui gateway Reneo`
                  : 'Tarif paket lisensi diatur langsung dari Reneo Panel dengan pembayaran terverifikasi otomatis'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* STEP 1: Plan Selection */}
          {!activeOrder ? (
            <>
              {/* Current Status banner */}
              {currentLicense && (
                <div className="p-4 rounded-2xl border border-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/20 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="text-emerald-500 shrink-0" size={18} />
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Status Saat Ini: </span>
                      <strong className="text-emerald-700 dark:text-emerald-400 font-semibold">
                        {currentLicense.plan} ({currentLicense.daysLeft} hari tersisa)
                      </strong>
                    </div>
                  </div>
                  <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                    Key: {currentLicense.licenseKey}
                  </div>
                </div>
              )}

              {/* Plans Grid */}
              {loadingPlans ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="animate-spin text-emerald-500" size={32} />
                  <span className="text-xs text-slate-500">Menghubungkan ke Reneo untuk mengambil daftar paket...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {plans.map((p) => {
                    const isSelected = selectedPlanSlug === p.slug;
                    return (
                      <div
                        key={p.slug}
                        onClick={() => setSelectedPlanSlug(p.slug)}
                        className={`cursor-pointer rounded-2xl p-5 border-2 transition-all flex flex-col justify-between relative ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20 shadow-md ring-2 ring-emerald-500/20'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        {p.highlighted && (
                          <span className="absolute -top-3 right-4 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white shadow-sm">
                            Paling Populer
                          </span>
                        )}

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                              {p.period === 'annual' ? '12 Bulan (1 Tahun)' : '1 Bulan'}
                            </span>
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                isSelected
                                  ? 'border-emerald-500 bg-emerald-500 text-white'
                                  : 'border-slate-300 dark:border-slate-700'
                              }`}
                            >
                              {isSelected && <Check size={10} strokeWidth={3} />}
                            </div>
                          </div>

                          <div>
                            <h3 className="font-bold text-base text-slate-900 dark:text-white">{p.name}</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{p.tagline}</p>
                          </div>

                          <div className="pt-2">
                            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                              Rp {p.priceAmount.toLocaleString('id-ID')}
                              <span className="text-xs font-normal text-slate-500">
                                /{p.period === 'annual' ? 'thn' : 'bln'}
                              </span>
                            </div>
                          </div>

                          <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2 text-xs">
                            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                              <Check size={14} className="text-emerald-500 shrink-0" />
                              <span>{p.features?.maxContacts?.toLocaleString?.() || '10.000'} Kontak</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                              <Check size={14} className="text-emerald-500 shrink-0" />
                              <span>
                                {p.features?.unlimitedBroadcast ? 'Broadcast WA Unlimited' : 'Broadcast WA Terjadwal'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                              <Check size={14} className="text-emerald-500 shrink-0" />
                              <span>Bot Ucapan Ulang Tahun</span>
                            </div>
                            {p.features?.liveChat && (
                              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                                <Check size={14} className="text-emerald-500 shrink-0" />
                                <span>Live Chat & Conversation CRM</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Buyer Form & Payment Method */}
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-4 text-xs">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <CreditCard size={16} className="text-emerald-500" />
                  Informasi Pemesan & Metode Pembayaran:
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                      Nama Pemesan (untuk di Invoice):
                    </label>
                    <input
                      type="text"
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                      placeholder="Contoh: PT Sumber Makmur / Budi"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                      Nomor WhatsApp Pembeli:
                    </label>
                    <input
                      type="text"
                      value={buyerPhone}
                      onChange={(e) => setBuyerPhone(e.target.value)}
                      placeholder="Contoh: 08123456789"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1.5">
                    Pilih Metode Pembayaran di Reneo:
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('saldo')}
                      className={`p-3 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                        paymentMethod === 'saldo'
                          ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-600 font-bold'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500'
                      }`}
                    >
                      <Wallet size={18} />
                      <span>Saldo Reneo</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('qris')}
                      className={`p-3 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                        paymentMethod === 'qris'
                          ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-600 font-bold'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500'
                      }`}
                    >
                      <CreditCard size={18} />
                      <span>QRIS Instan</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('transfer')}
                      className={`p-3 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                        paymentMethod === 'transfer'
                          ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-600 font-bold'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500'
                      }`}
                    >
                      <Building size={18} />
                      <span>Transfer Bank</span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* STEP 2: Invoice & Payment Sheet */
            <div className="space-y-5 text-xs">
              {/* Payment Success Banner */}
              {paymentSuccess ? (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 flex items-center gap-3">
                  <CheckCircle2 size={24} className="text-emerald-500 shrink-0" />
                  <div>
                    <strong className="block text-sm">Pembayaran Berhasil Diverifikasi!</strong>
                    <span>
                      Lisensi aplikasi Reneo CRM Anda telah resmi diperpanjang dan aktif. Semua batasan fitur telah
                      terbuka.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-400 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Clock size={20} className="text-amber-500 shrink-0" />
                    <div>
                      <strong className="block text-sm">Menunggu Pembayaran</strong>
                      <span>
                        Selesaikan pembayaran sebelum batas waktu:{' '}
                        {new Date(activeOrder.expiresAt).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200">
                    {activeOrder.invoiceNumber}
                  </span>
                </div>
              )}

              {/* Itemized Invoice Paper */}
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
                <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Penerbit:</span>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">Reneo Platform & Hosting</h4>
                    <p className="text-slate-500 text-[11px]">PT Reneo Teknologi Indonesia</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Ditagihkan Kepada:</span>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">{activeOrder.buyerName}</h4>
                    {activeOrder.buyerPhone && <p className="text-slate-500 text-[11px]">{activeOrder.buyerPhone}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                    <span>
                      {activeOrder.appName} - {activeOrder.planName} ({activeOrder.months} Bulan)
                    </span>
                    <span className="font-semibold">Rp {activeOrder.amountList.toLocaleString('id-ID')}</span>
                  </div>

                  {activeOrder.uniqueCode > 0 && (
                    <div className="flex items-center justify-between text-slate-500 text-[11px]">
                      <span>Kode Unik Pembayaran:</span>
                      <span className="font-mono">Rp {activeOrder.uniqueCode}</span>
                    </div>
                  )}

                  <div className="border-t border-slate-100 dark:border-slate-800 pt-2 flex items-center justify-between font-bold text-sm text-slate-900 dark:text-white">
                    <span>Total Pembayaran:</span>
                    <span className="text-base text-emerald-600 dark:text-emerald-400">
                      Rp {activeOrder.amountTotal.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment instructions */}
              {!paymentSuccess && paymentMethods.length > 0 && (
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2.5">
                  <h5 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <CreditCard size={15} className="text-emerald-500" />
                    Pilihan Rekening Pembayaran Resmi:
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {paymentMethods.map((m) => (
                      <div
                        key={m.id}
                        className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                      >
                        <span className="font-bold text-slate-900 dark:text-white block">{m.name}</span>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                          {m.account}
                        </span>
                        <span className="block text-slate-500 text-[10px]">a/n {m.holder}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between shrink-0">
          {!activeOrder ? (
            <>
              <div className="text-xs">
                <span className="text-slate-400">Paket Terpilih: </span>
                <strong className="text-slate-900 dark:text-white">
                  {plans.find((p) => p.slug === selectedPlanSlug)?.name || 'Pro Bulanan'}
                </strong>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleCreateOrder}
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Receipt size={14} />
                  )}
                  Terbitkan Invoice & Lanjutkan
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition"
                >
                  <Printer size={13} />
                  Cetak Lembar
                </button>

                <button
                  type="button"
                  onClick={() => setActiveOrder(null)}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition"
                >
                  Ganti Paket
                </button>
              </div>

              <div className="flex items-center gap-2">
                {!paymentSuccess && (
                  <button
                    type="button"
                    onClick={handlePayOrder}
                    disabled={isPaying}
                    className="px-5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
                  >
                    {isPaying ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    Bayar Sekarang (Saldo Reneo)
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Selesai
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
