import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  KeyRound,
  Check,
  CreditCard,
  CheckCircle2,
  Clock,
  Copy,
  RefreshCw,
  ArrowLeft,
  AlertTriangle,
  Lock,
  Calendar,
  Minus,
  Plus,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Building2,
} from 'lucide-react';
import { api } from '../services/api';
import { LicenseInfo, LicensePlan, LicenseOrder, PaymentMethodItem } from '../types';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useToast } from './ui/ToastProvider';
import { LoadingState, ErrorState } from './ui/StateBlocks';

export type PlansModalView = 'overview' | 'plans';

interface PlansModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLicense: LicenseInfo | null;
  onLicenseUpdated: () => void;
  defaultBuyer?: { name: string; email: string };
  initialView?: PlansModalView;
}

function formatDateId(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function addMonthsSafe(baseDate: Date, months: number): Date {
  const res = new Date(baseDate.getTime());
  res.setMonth(res.getMonth() + months);
  return res;
}

function formatStorageQuota(mb?: number): string {
  const n = Number(mb || 0);
  if (!Number.isFinite(n) || n <= 0) return '5 GB';
  if (n >= 1024 && n % 1024 === 0) return `${n / 1024} GB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} GB`;
  return `${n.toLocaleString('id-ID')} MB`;
}

function matchCurrentPlanSlug(lic: LicenseInfo | null, planList: LicensePlan[]): string {
  if (planList.length === 0) return 'pro-monthly';
  if (lic) {
    const planLower = (lic.plan || '').toLowerCase();
    const byName = planList.find(
      (p) =>
        planLower.includes(p.name.toLowerCase()) ||
        planLower.includes(p.slug.split('-')[0])
    );
    if (byName) return byName.slug;
  }
  const highlighted = planList.find((p) => p.highlighted);
  return highlighted ? highlighted.slug : planList[0].slug;
}

export const PlansModal: React.FC<PlansModalProps> = ({
  isOpen,
  onClose,
  currentLicense,
  onLicenseUpdated,
  defaultBuyer,
  initialView = 'overview',
}) => {
  const toast = useToast();
  const hasRegisteredLicense = Boolean(currentLicense && currentLicense.status !== 'UNLICENSED');

  const [view, setView] = useState<PlansModalView>('overview');
  const [plans, setPlans] = useState<LicensePlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [selectedPlanSlug, setSelectedPlanSlug] = useState<string>('pro-monthly');
  const [quantity, setQuantity] = useState<number>(1);
  const [isRenewalMode, setIsRenewalMode] = useState(false);

  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeOrder, setActiveOrder] = useState<LicenseOrder | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodItem[]>([]);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [startingTrialSlug, setStartingTrialSlug] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [manualKey, setManualKey] = useState('');
  const [activatingKey, setActivatingKey] = useState(false);
  const [expandedPlanDetails, setExpandedPlanDetails] = useState<Record<string, boolean>>({});
  const [showAllOverviewQuotas, setShowAllOverviewQuotas] = useState(false);
  const plansScrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updatePlansScrollState = () => {
    const el = plansScrollRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    if (!isOpen || view !== 'plans') return;
    const raf = requestAnimationFrame(updatePlansScrollState);
    window.addEventListener('resize', updatePlansScrollState);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updatePlansScrollState);
    };
  }, [isOpen, view, plans.length]);

  const togglePlanDetails = (slug: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedPlanDetails((prev) => ({ ...prev, [slug]: !prev[slug] }));
  };

  const scrollPlansBy = (delta: number) => {
    plansScrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const loadPlans = async () => {
    try {
      setLoadingPlans(true);
      setPlansError(null);
      const data = await api.getLicensePlans();
      setPlans(data);
      setSelectedPlanSlug(matchCurrentPlanSlug(currentLicense, data));
    } catch (err: any) {
      setPlansError(
        err.response?.data?.error || err.message || 'Gagal memuat daftar paket dari Reneo'
      );
    } finally {
      setLoadingPlans(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setActiveOrder(null);
    setPaymentSuccess(false);
    setShowKeyForm(false);
    setManualKey('');
    setQuantity(1);
    setIsRenewalMode(false);
    const nextView: PlansModalView =
      initialView === 'plans' || !hasRegisteredLicense ? 'plans' : 'overview';
    setView(nextView);
    if (defaultBuyer?.name && !buyerName) {
      setBuyerName(defaultBuyer.name);
    }
    void loadPlans();
  }, [isOpen, initialView, hasRegisteredLicense, defaultBuyer?.name]);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.slug === selectedPlanSlug) || plans[0] || null,
    [plans, selectedPlanSlug]
  );

  const maxQty = selectedPlan?.period === 'annual' ? 5 : 24;
  const clampedQty = Math.min(maxQty, Math.max(1, quantity));
  const unitMonths = selectedPlan?.months || (selectedPlan?.period === 'annual' ? 12 : 1);
  const totalAddedMonths = unitMonths * clampedQty;
  const totalSubtotal = (selectedPlan?.priceAmount || 0) * clampedQty;
  const totalOriginalSubtotal =
    ((selectedPlan?.originalPriceAmount && selectedPlan.originalPriceAmount > selectedPlan.priceAmount)
      ? selectedPlan.originalPriceAmount
      : selectedPlan?.priceAmount || 0) * clampedQty;
  const totalDiscountSavings = totalOriginalSubtotal - totalSubtotal;

  const estimatedNewExpiry = useMemo(() => {
    const now = new Date();
    const curExp = currentLicense?.expiresAt ? new Date(currentLicense.expiresAt) : null;
    const base =
      currentLicense && !currentLicense.isExpired && curExp && curExp.getTime() > now.getTime()
        ? curExp
        : now;
    return addMonthsSafe(base, totalAddedMonths);
  }, [currentLicense, totalAddedMonths]);

  const handleOpenExtend = () => {
    setSelectedPlanSlug(matchCurrentPlanSlug(currentLicense, plans));
    setQuantity(1);
    setIsRenewalMode(true);
    setView('plans');
  };

  const handleOpenUpgrade = () => {
    setIsRenewalMode(false);
    setQuantity(1);
    const higher = plans.find((p) => p.highlighted) || plans[plans.length - 1];
    if (higher) setSelectedPlanSlug(higher.slug);
    setView('plans');
  };

  const handleSyncLicense = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await api.syncLicense();
      onLicenseUpdated();
      toast.success('Status lisensi berhasil disinkronkan dengan Reneo.');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyinkronkan lisensi.');
    } finally {
      setSyncing(false);
    }
  };

  const handleActivateManualKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualKey.trim() || activatingKey) return;
    setActivatingKey(true);
    try {
      await api.activateLicense(manualKey.trim());
      toast.success('Kunci lisensi berhasil diaktivasi!');
      setManualKey('');
      setShowKeyForm(false);
      onLicenseUpdated();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mengaktivasi kunci lisensi');
    } finally {
      setActivatingKey(false);
    }
  };

  const handleStartTrial = async (planSlug: string) => {
    if (startingTrialSlug || isSubmitting) return;
    const cleanPhone = buyerPhone.trim();
    if (!cleanPhone) {
      toast.error('Masukkan nomor WhatsApp aktif terlebih dahulu untuk mengaktifkan trial.');
      const input = document.getElementById('plans-trial-whatsapp-input') as HTMLInputElement | null;
      input?.focus();
      return;
    }
    try {
      setStartingTrialSlug(planSlug);
      const lic = await api.startLicenseTrial(planSlug, cleanPhone);
      toast.success(`Paket ${lic.plan} berhasil diaktifkan!`);
      onLicenseUpdated();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Gagal mengaktifkan paket trial');
    } finally {
      setStartingTrialSlug(null);
    }
  };

  const handleCreateOrder = async () => {
    if (isSubmitting || !selectedPlan) return;
    try {
      setIsSubmitting(true);
      const res = await api.createLicenseOrder({
        planSlug: selectedPlan.slug,
        quantity: clampedQty,
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

  const licenseStatusMeta = (() => {
    if (!currentLicense || currentLicense.status === 'UNLICENSED') {
      return {
        label: 'Belum Diaktivasi',
        badgeCls: 'bg-gray-100 text-gray-700 border-gray-300',
        bannerCls: 'border-gray-200 bg-gray-50',
        progressCls: 'bg-gray-400',
        pct: 0,
      };
    }
    if (currentLicense.status === 'SUSPENDED') {
      return {
        label: 'Disuspend Admin',
        badgeCls: 'bg-red-50 text-red-700 border-red-200',
        bannerCls: 'border-red-200 bg-red-50/40',
        progressCls: 'bg-red-500',
        pct: 0,
      };
    }
    if (currentLicense.isExpired || currentLicense.status === 'EXPIRED') {
      return {
        label: 'Masa Aktif Berakhir',
        badgeCls: 'bg-red-50 text-red-700 border-red-200',
        bannerCls: 'border-red-200 bg-red-50/40',
        progressCls: 'bg-red-500',
        pct: 0,
      };
    }
    if (currentLicense.status === 'TRIAL') {
      return {
        label: 'Trial Aktif',
        badgeCls: 'bg-sky-50 text-sky-700 border-sky-200',
        bannerCls: 'border-sky-200 bg-sky-50/30',
        progressCls: 'bg-sky-500',
        pct: Math.min(100, Math.max(8, Math.round((currentLicense.daysLeft / 7) * 100))),
      };
    }
    if (currentLicense.daysLeft <= 7) {
      return {
        label: 'Segera Berakhir',
        badgeCls: 'bg-amber-50 text-amber-800 border-amber-200',
        bannerCls: 'border-amber-200 bg-amber-50/30',
        progressCls: 'bg-amber-500',
        pct: Math.min(100, Math.max(6, Math.round((currentLicense.daysLeft / 30) * 100))),
      };
    }
    const baseCycleDays = currentLicense.period === 'annual' ? 365 : 30;
    return {
      label: 'Lisensi Aktif',
      badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      bannerCls: 'border-gray-200 bg-white',
      progressCls: 'bg-emerald-500',
      pct: Math.min(100, Math.max(10, Math.round((currentLicense.daysLeft / baseCycleDays) * 100))),
    };
  })();

  const durationPresets =
    selectedPlan?.period === 'annual'
      ? [
          { qty: 1, label: '1 Tahun' },
          { qty: 2, label: '2 Tahun' },
          { qty: 3, label: '3 Tahun' },
        ]
      : [
          { qty: 1, label: '1 Bulan' },
          { qty: 3, label: '3 Bulan' },
          { qty: 6, label: '6 Bulan' },
          { qty: 12, label: '12 Bulan' },
        ];

  const modalTitle = activeOrder
    ? 'Tagihan & Instruksi Pembayaran'
    : view === 'overview'
    ? 'Informasi Lisensi CRM'
    : isRenewalMode
    ? 'Perpanjang Masa Aktif Lisensi'
    : 'Pilih Paket & Durasi Langganan';

  const modalSubtitle = activeOrder
    ? `Invoice ${activeOrder.invoiceNumber} — ${activeOrder.planName} (${activeOrder.months} Bulan)`
    : view === 'overview'
    ? 'Ringkasan status paket aktif, kuota modul, masa berlaku, dan opsi perpanjangan'
    : 'Pilih paket dan durasi langganan sesuai kebutuhan Anda';

  const footerContent = activeOrder ? (
    <div className="w-full flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
      <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => window.print()} className="justify-center">
          Cetak Invoice
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setActiveOrder(null)}
          disabled={isPaying}
          className="justify-center"
        >
          Ubah Paket
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
        {!paymentSuccess && (
          <Button
            variant="primary"
            size="sm"
            onClick={handleCheckOrderStatus}
            isLoading={isPaying}
            className="justify-center col-span-2 sm:col-span-1"
          >
            Cek Status Pembayaran
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={onClose}
          disabled={isPaying}
          className={`justify-center ${paymentSuccess ? 'col-span-2 sm:col-span-1' : 'hidden sm:inline-flex'}`}
        >
          Selesai
        </Button>
      </div>
    </div>
  ) : view === 'overview' ? (
    <div className="w-full flex items-center justify-between gap-2">
      <Button variant="secondary" size="sm" onClick={onClose} className="hidden sm:inline-flex">
        Tutup
      </Button>
      <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleOpenUpgrade}
          className="justify-center whitespace-nowrap"
        >
          <span className="sm:hidden">Ganti Paket</span>
          <span className="hidden sm:inline">Upgrade / Ganti Paket</span>
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleOpenExtend}
          className="justify-center whitespace-nowrap"
        >
          <span className="sm:hidden">Perpanjang</span>
          <span className="hidden sm:inline">Perpanjang Masa Aktif</span>
        </Button>
      </div>
    </div>
  ) : (
    <div className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
      <div className="text-xs text-gray-600 truncate">
        {selectedPlan ? (
          <span>
            <strong className="text-gray-900">{selectedPlan.name}</strong> &middot;{' '}
            <span className="font-mono font-semibold text-indigo-700">{totalAddedMonths} Bln</span> &middot;{' '}
            {totalDiscountSavings > 0 && (
              <span className="line-through text-gray-400 mr-1.5 tabular-nums">
                Rp {totalOriginalSubtotal.toLocaleString('id-ID')}
              </span>
            )}
            <span className="font-mono font-semibold text-gray-900 tabular-nums">
              Rp {totalSubtotal.toLocaleString('id-ID')}
            </span>
            {totalDiscountSavings > 0 && (
              <span className="ml-1.5 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                Hemat Rp {totalDiscountSavings.toLocaleString('id-ID')}
              </span>
            )}
          </span>
        ) : (
          <span>Pilih paket untuk melanjutkan</span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
        {hasRegisteredLicense ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setView('overview')}
            disabled={isSubmitting}
            className="justify-center"
          >
            Info Lisensi
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
            className="justify-center"
          >
            Batal
          </Button>
        )}
        {hasRegisteredLicense && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
            className="hidden sm:inline-flex"
          >
            Batal
          </Button>
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={handleCreateOrder}
          isLoading={isSubmitting}
          disabled={loadingPlans || plans.length === 0}
          className="justify-center whitespace-nowrap"
        >
          Terbitkan Invoice
        </Button>
      </div>
    </div>
  );

  const periodLabel =
    currentLicense?.period === 'annual'
      ? 'Tahunan'
      : currentLicense?.period === 'trial'
      ? 'Trial'
      : 'Bulanan';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      subtitle={modalSubtitle}
      maxWidthClass="max-w-4xl"
      isLoading={isSubmitting || isPaying}
      footer={footerContent}
    >
      <div className="space-y-5">
        {activeOrder ? (
          <div className="space-y-4 text-xs">
            {paymentSuccess ? (
              <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <strong className="block text-sm">Pembayaran Berhasil Diverifikasi</strong>
                  <span>
                    Lisensi Reneo CRM Anda telah aktif / diperpanjang selama {activeOrder.months} bulan.
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <strong className="block text-sm">Menunggu Pembayaran</strong>
                    <span>
                      Batas waktu: {formatDateId(activeOrder.expiresAt)}
                    </span>
                  </div>
                </div>
                <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded bg-white border border-amber-200 text-amber-900">
                  {activeOrder.invoiceNumber}
                </span>
              </div>
            )}

            <div className="p-3.5 sm:p-4 rounded-lg border border-gray-200 bg-white space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-gray-200 pb-3">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-gray-400 tracking-wider">
                    Penerbit
                  </span>
                  <h4 className="font-semibold text-gray-900 text-sm">Reneo Platform</h4>
                  <p className="text-gray-500 text-[11px]">Gateway Pembayaran Panel Reneo</p>
                </div>
                <div className="sm:text-right">
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
                    {activeOrder.appName} &mdash; {activeOrder.planName}{' '}
                    <span className="font-mono font-semibold text-gray-900">
                      ({activeOrder.months} Bulan)
                    </span>
                  </span>
                  <span className="font-semibold font-mono tabular-nums">
                    Rp {activeOrder.amountList.toLocaleString('id-ID')}
                  </span>
                </div>
                {activeOrder.uniqueCode > 0 && (
                  <div className="flex items-center justify-between text-gray-500 text-[11px]">
                    <span>Kode Unik Verifikasi</span>
                    <span className="font-mono tabular-nums">Rp {activeOrder.uniqueCode}</span>
                  </div>
                )}
                <div className="border-t border-gray-200 pt-2.5 flex items-center justify-between font-bold text-sm text-gray-900">
                  <span>Total Transfer Tepat</span>
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
        ) : view === 'overview' && currentLicense ? (
          <div className="space-y-3 sm:space-y-4">
            {/* License Status Hero Card */}
            <div className={`rounded-xl border p-3 sm:p-5 space-y-3 sm:space-y-4 ${licenseStatusMeta.bannerCls}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${licenseStatusMeta.badgeCls}`}
                    >
                      {currentLicense.isExpired || currentLicense.status === 'SUSPENDED' ? (
                        <AlertTriangle className="w-3 h-3" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3" />
                      )}
                      {licenseStatusMeta.label}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200 text-[11px] font-medium">
                      Siklus {periodLabel}
                    </span>
                    {currentLicense.companyName && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-medium">
                        <Building2 className="w-3 h-3 shrink-0" />
                        <span>Bisnis: {currentLicense.companyName}</span>
                      </span>
                    )}
                  </div>
                  <h4 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight leading-snug">
                    {currentLicense.plan}
                  </h4>
                  <p className="text-[11px] text-gray-500">
                    Lisensi berlaku khusus untuk bisnis ini. Penambahan bisnis baru menggunakan paket lisensi masing-masing.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleSyncLicense()}
                  isLoading={syncing}
                  className="shrink-0"
                  title="Sinkronkan Status"
                >
                  <RefreshCw className={`w-3.5 h-3.5 sm:mr-1 ${syncing ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Sinkronkan Status</span>
                </Button>
              </div>

              {/* 3 Key Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 text-xs">
                <div className="p-2.5 sm:p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-1.5">
                  <span className="text-[11px] text-gray-500 block">Sisa Masa Aktif</span>
                  <div className="flex items-baseline justify-between gap-1.5">
                    <strong className="text-sm sm:text-base font-bold text-gray-900 font-mono tabular-nums">
                      {currentLicense.isExpired ? '0 Hari' : `${currentLicense.daysLeft} Hari`}
                    </strong>
                    {currentLicense.daysLeft > 0 && currentLicense.daysLeft <= 7 && (
                      <span className="text-[10px] font-medium text-amber-700">Segera</span>
                    )}
                  </div>
                  <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${licenseStatusMeta.progressCls}`}
                      style={{ width: `${licenseStatusMeta.pct}%` }}
                    />
                  </div>
                </div>

                <div className="p-2.5 sm:p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-1">
                  <span className="text-[11px] text-gray-500 inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3 shrink-0" />
                    Berlaku Hingga
                  </span>
                  <div className="text-xs font-semibold text-gray-900 leading-snug">
                    {formatDateId(currentLicense.expiresAt)}
                  </div>
                  {currentLicense.startedAt && (
                    <div className="text-[10px] text-gray-500 truncate">
                      Mulai: {formatDateId(currentLicense.startedAt)}
                    </div>
                  )}
                </div>

                <div className="col-span-2 sm:col-span-1 p-2.5 sm:p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-1">
                  <span className="text-[11px] text-gray-500 inline-flex items-center gap-1">
                    <KeyRound className="w-3 h-3 shrink-0" />
                    Kunci Lisensi
                  </span>
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-mono text-[11px] font-semibold text-gray-900 truncate">
                      {currentLicense.licenseKey || '-'}
                    </span>
                    {currentLicense.licenseKey && (
                      <button
                        type="button"
                        onClick={() => copyValue('Kunci lisensi', currentLicense.licenseKey!)}
                        className="p-1 rounded border border-gray-200 bg-white text-gray-500 hover:text-gray-800 shrink-0"
                        title="Salin kunci lisensi"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowKeyForm((v) => !v)}
                    className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    {showKeyForm ? 'Tutup input kunci' : 'Ganti / Pasang Kunci Baru'}
                  </button>
                </div>
              </div>

              {showKeyForm && (
                <form
                  onSubmit={handleActivateManualKey}
                  className="p-3 rounded-lg bg-gray-50 border border-gray-200 flex flex-col sm:flex-row gap-2"
                >
                  <input
                    type="text"
                    required
                    value={manualKey}
                    onChange={(e) => setManualKey(e.target.value)}
                    placeholder="Tempel kunci lisensi baru (mis. RN-CRM-...)"
                    className="flex-1 h-9 px-3 rounded-md border border-gray-200 bg-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={activatingKey}
                    disabled={!manualKey.trim()}
                    className="h-9 shrink-0"
                  >
                    Aktivasi Kunci
                  </Button>
                </form>
              )}
            </div>

            {/* Active Quotas & Unlocked Modules */}
            <div className="rounded-xl border border-gray-200 bg-white p-3.5 sm:p-4 space-y-4">
              {/* Section 1: Rincian Pemakaian Kuota */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h5 className="text-[11px] font-semibold text-gray-900 uppercase tracking-wider">
                    Rincian Pemakaian Kuota
                  </h5>
                  <span className="text-[11px] text-gray-500">
                    Support:{' '}
                    <strong className="uppercase text-gray-800 font-mono">
                      {currentLicense.features?.supportPriority || 'standard'}
                    </strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(() => {
                    const storageUsedMb = currentLicense.usage?.storageUsedMb ?? 0;
                    const storageMaxMb = currentLicense.features?.maxStorageMb || 1024;
                    const storagePct = storageMaxMb > 0 ? Math.min(100, Math.round((storageUsedMb / storageMaxMb) * 100)) : 0;

                    const contactsUsed = currentLicense.usage?.contacts ?? 0;
                    const contactsMax = currentLicense.features?.maxContacts ?? 0;
                    const contactsPct = contactsMax > 0 ? Math.min(100, Math.round((contactsUsed / contactsMax) * 100)) : 0;

                    const agentsUsed = currentLicense.usage?.agents ?? 1;
                    const agentsMax = currentLicense.features?.multiAgent
                      ? currentLicense.features?.maxAgents || 5
                      : 1;
                    const agentsPct = agentsMax > 0 ? Math.min(100, Math.round((agentsUsed / agentsMax) * 100)) : 0;

                    const broadcastsUsed = currentLicense.usage?.broadcastsThisMonth ?? 0;
                    const broadcastsUnlimited = Boolean(currentLicense.features?.unlimitedBroadcast);
                    const broadcastsMax = currentLicense.features?.maxBroadcastPerMonth || 1500;
                    const broadcastsPct =
                      !broadcastsUnlimited && broadcastsMax > 0
                        ? Math.min(100, Math.round((broadcastsUsed / broadcastsMax) * 100))
                        : 0;

                    const channelsUsed = currentLicense.usage?.channels ?? 0;
                    const channelsMax = currentLicense.features?.maxChannels ?? 0;
                    const maxSessions = currentLicense.features?.multiSession
                      ? currentLicense.features?.maxSessions || 3
                      : currentLicense.features?.maxSessions || 1;
                    const templatesUsed = currentLicense.usage?.templates ?? 0;

                    const barColor = (pct: number) =>
                      pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';

                    const quotaCards = [
                      {
                        label: 'Penyimpanan Dokumen & Media',
                        usedText: `${storageUsedMb.toLocaleString('id-ID')} MB`,
                        limitText: formatStorageQuota(storageMaxMb),
                        subText: `Batas unggah maks ${currentLicense.features?.maxAttachmentSizeMb || 10} MB per file`,
                        pct: storagePct,
                        hasBar: storageMaxMb > 0,
                      },
                      {
                        label: 'Kapasitas Kontak Pelanggan',
                        usedText: `${contactsUsed.toLocaleString('id-ID')} Kontak`,
                        limitText: contactsMax === 0 ? 'Tanpa Batas' : contactsMax.toLocaleString('id-ID'),
                        subText: contactsMax === 0 ? 'Tidak ada batas jumlah kontak pada paket ini' : `${contactsPct}% dari kapasitas tersimpan`,
                        pct: contactsPct,
                        hasBar: contactsMax > 0,
                      },
                      {
                        label: 'Tim & Agen CS Aktif',
                        usedText: `${agentsUsed.toLocaleString('id-ID')} Akun`,
                        limitText: currentLicense.features?.multiAgent ? `${agentsMax} Akun` : '1 Admin',
                        subText: currentLicense.features?.multiAgent ? 'Mendukung pembagian peran & hak akses' : 'Mode admin tunggal',
                        pct: agentsPct,
                        hasBar: true,
                      },
                      {
                        label: 'Siaran & Kampanye WA (Bulan Ini)',
                        usedText: `${broadcastsUsed.toLocaleString('id-ID')} Terkirim`,
                        limitText: broadcastsUnlimited ? 'Tanpa Batas' : `${broadcastsMax.toLocaleString('id-ID')}/bln`,
                        subText: `${templatesUsed.toLocaleString('id-ID')} template pesan tersimpan · ${channelsUsed} kanal aktif (maks ${maxSessions} sesi WA${
                          channelsMax > 0 ? `, ${channelsMax} kanal` : ''
                        })`,
                        pct: broadcastsPct,
                        hasBar: !broadcastsUnlimited && broadcastsMax > 0,
                      },
                    ];

                    return quotaCards.map((q) => (
                      <div
                        key={q.label}
                        className="p-3 rounded-lg border border-gray-200 bg-gray-50/80 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-medium text-gray-800 leading-snug">
                            {q.label}
                          </span>
                          <span className="font-mono text-[11px] font-semibold text-gray-900 tabular-nums shrink-0">
                            {q.usedText}{' '}
                            <span className="text-gray-400 font-normal">/ {q.limitText}</span>
                          </span>
                        </div>
                        {q.hasBar && (
                          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${barColor(q.pct)}`}
                              style={{ width: `${Math.max(q.pct > 0 ? 4 : 0, q.pct)}%` }}
                            />
                          </div>
                        )}
                        <p className="text-[11px] text-gray-500 leading-snug">{q.subText}</p>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Section 2: Modul & Fitur Termasuk */}
              <div className="pt-3 border-t border-gray-200 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h5 className="text-[11px] font-semibold text-gray-900 uppercase tracking-wider">
                    Modul &amp; Fitur pada Paket Ini
                  </h5>
                  <button
                    type="button"
                    onClick={() => setShowAllOverviewQuotas((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    <span>{showAllOverviewQuotas ? 'Ringkas modul' : 'Lihat semua modul'}</span>
                    {showAllOverviewQuotas ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {[
                    {
                      label: 'Inbox Live Chat CRM & CSAT',
                      value: currentLicense.features?.liveChatCrm ? 'Terbuka' : 'Terkunci',
                      unlocked: Boolean(currentLicense.features?.liveChatCrm),
                    },
                    {
                      label: 'Multi-Sesi Nomor WhatsApp',
                      value: currentLicense.features?.multiSession
                        ? `Hingga ${currentLicense.features?.maxSessions || 3} Sesi`
                        : `Maks ${currentLicense.features?.maxSessions || 1} Sesi`,
                      unlocked: Boolean(currentLicense.features?.multiSession),
                    },
                    {
                      label: 'Batas Ganti Nomor / Identitas',
                      value: `Maks ${currentLicense.features?.maxSessionIdentitySwitches ?? 2}x per Sesi`,
                      unlocked: true,
                    },
                    {
                      label: 'Komentar, Feed & Omnichannel',
                      value: currentLicense.features?.omnichannel
                        ? currentLicense.features?.maxChannels === 0
                          ? 'Terbuka (Tanpa Batas)'
                          : `Terbuka (${currentLicense.features?.maxChannels || 4} Kanal)`
                        : 'Terkunci',
                      unlocked: Boolean(currentLicense.features?.omnichannel),
                    },
                    {
                      label: 'Jadwal Post, Story & Ide Konten',
                      value: currentLicense.features?.scheduledPosts ? 'Terbuka' : 'Terkunci',
                      unlocked: Boolean(currentLicense.features?.scheduledPosts),
                    },
                    {
                      label: 'Otomasi Komentar & Auto-Reply',
                      value:
                        currentLicense.features?.autoReply !== false ? 'Terbuka' : 'Terkunci',
                      unlocked: currentLicense.features?.autoReply !== false && !currentLicense.isExpired,
                    },
                    {
                      label: 'Otomasi Ulang Tahun & Galeri Media',
                      value: currentLicense.features?.birthdayAutomation ? 'Terbuka' : 'Terkunci',
                      unlocked: Boolean(currentLicense.features?.birthdayAutomation),
                    },
                    {
                      label: 'Agent AI, Knowledge Book & Konektor MCP',
                      value: currentLicense.features?.aiAgent ? 'Terbuka' : 'Terkunci',
                      unlocked: Boolean(currentLicense.features?.aiAgent),
                    },
                    {
                      label: 'Ekspor Laporan CSV & Akses API',
                      value: currentLicense.features?.exportReports
                        ? currentLicense.features?.apiAccess
                          ? 'CSV + API Aktif'
                          : 'Ekspor CSV Aktif'
                        : 'Terkunci',
                      unlocked: Boolean(currentLicense.features?.exportReports),
                    },
                  ]
                    .slice(0, showAllOverviewQuotas ? 8 : 4)
                    .map((feat) => (
                      <div
                        key={feat.label}
                        className={`px-3 py-2 rounded-lg border flex items-center justify-between gap-2 ${
                          feat.unlocked
                            ? 'bg-emerald-50/40 border-emerald-200/80 text-gray-800'
                            : 'bg-gray-50 border-gray-200 text-gray-500'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {feat.unlocked ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          )}
                          <span className="leading-snug">{feat.label}</span>
                        </div>
                        <span
                          className={`font-mono text-[11px] font-semibold shrink-0 ${
                            feat.unlocked ? 'text-emerald-800' : 'text-gray-500'
                          }`}
                        >
                          {feat.value}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* View: Pilih Paket & Durasi */
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {hasRegisteredLicense && (
                  <button
                    type="button"
                    onClick={() => setView('overview')}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Kembali ke Info Lisensi</span>
                  </button>
                )}
                {currentLicense && !currentLicense.isExpired && (
                  <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                    Sisa <strong>{currentLicense.daysLeft} hari</strong> Anda tidak hangus — durasi baru ditambahkan otomatis.
                  </span>
                )}
              </div>

              {plans.length > 1 && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-[11px] text-gray-400 hidden sm:inline">
                    Geser paket ({plans.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => scrollPlansBy(-256)}
                    disabled={!canScrollLeft}
                    className="w-7 h-7 rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center text-gray-600 transition-colors"
                    title="Geser ke kiri"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollPlansBy(256)}
                    disabled={!canScrollRight}
                    className="w-7 h-7 rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center text-gray-600 transition-colors"
                    title="Geser ke kanan"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {loadingPlans ? (
              <LoadingState message="Mengambil daftar paket dari Reneo..." />
            ) : plansError ? (
              <ErrorState message={plansError} onRetry={loadPlans} />
            ) : (
              <>
                {(!currentLicense ||
                  currentLicense.status === 'UNLICENSED' ||
                  currentLicense.status === 'EXPIRED' ||
                  currentLicense.isExpired) && (
                  <div className="p-3 rounded-lg border border-gray-200 bg-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                    <div className="min-w-0">
                      <label htmlFor="plans-trial-whatsapp-input" className="font-semibold text-gray-800 block">
                        Nomor WhatsApp Aktif (Untuk Trial &amp; Tagihan)
                      </label>
                      <span className="text-[11px] text-gray-500">
                        Wajib diisi sekali untuk aktivasi Coba Gratis atau penerbitan invoice paket.
                      </span>
                    </div>
                    <input
                      id="plans-trial-whatsapp-input"
                      type="tel"
                      value={buyerPhone}
                      onChange={(e) => setBuyerPhone(e.target.value)}
                      placeholder="081234567890"
                      className="w-full sm:w-56 h-9 px-3 rounded-md border border-gray-300 bg-white text-xs font-mono text-gray-900 focus:outline-none focus:border-indigo-500 shrink-0"
                    />
                  </div>
                )}

                {/* Horizontal Scrollable Plan Cards (Single Row, no visible scrollbar) */}
                <div className="relative">
                  <div
                    ref={plansScrollRef}
                    onScroll={updatePlansScrollState}
                    className="flex flex-nowrap gap-3 overflow-x-auto py-0.5 snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {plans.map((p) => {
                      const isSelected = selectedPlanSlug === p.slug;
                      const isExpanded = Boolean(expandedPlanDetails[p.slug]);
                      const isCurrentTier = Boolean(
                        currentLicense &&
                          currentLicense.status !== 'UNLICENSED' &&
                          (currentLicense.plan.toLowerCase().includes(p.name.toLowerCase()) ||
                            currentLicense.plan.toLowerCase().includes(p.slug.split('-')[0]))
                      );
                      return (
                        <div
                          key={p.slug}
                          onClick={() => {
                            setSelectedPlanSlug(p.slug);
                            setQuantity(1);
                          }}
                          className={`w-[236px] sm:w-[244px] shrink-0 snap-start cursor-pointer rounded-xl p-3.5 sm:p-4 border transition-all flex flex-col justify-between relative ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                              {p.period === 'annual' ? '12 Bulan' : `${p.months || 1} Bulan`}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {isCurrentTier && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Paket Anda
                                </span>
                              )}
                              {p.highlighted && !isCurrentTier && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 inline-flex items-center gap-0.5">
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
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{p.tagline}</p>
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {p.originalPriceAmount && p.originalPriceAmount > p.priceAmount && (
                                <span className="line-through text-xs font-semibold text-gray-400 tabular-nums">
                                  Rp {p.originalPriceAmount.toLocaleString('id-ID')}
                                </span>
                              )}
                              {p.discountPercent && p.discountPercent > 0 && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                  Hemat {p.discountPercent}%
                                </span>
                              )}
                            </div>
                            <div className="text-xl font-bold text-gray-900 tabular-nums">
                              Rp {p.priceAmount.toLocaleString('id-ID')}
                              <span className="text-xs font-normal text-gray-500">
                                /{p.period === 'annual' ? 'thn' : 'bln'}
                              </span>
                            </div>
                            {p.promoValidUntil && (
                              <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200/80 rounded px-1.5 py-0.5 inline-flex items-center gap-1 font-medium">
                                <Clock className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                <span>Promo s/d {p.promoValidUntil}</span>
                              </div>
                            )}
                          </div>

                          {(() => {
                            const slugLow = (p.slug || '').toLowerCase();
                            const isStarterPlan = slugLow.includes('starter');
                            const isBusinessPlan = slugLow.includes('business');
                            const isEntPlan = slugLow.includes('enterprise');
                            const hasLiveChat = Boolean(
                              p.features?.liveChat ?? p.features?.liveChatCrm ?? !isStarterPlan
                            );
                            const hasMultiSess = Boolean(p.features?.multiSession ?? !isStarterPlan);
                            const maxSess =
                              p.features?.maxSessions ||
                              (isEntPlan ? 25 : isBusinessPlan ? 10 : hasMultiSess ? 3 : 1);
                            const hasMultiAg = Boolean(p.features?.multiAgent ?? !isStarterPlan);
                            const maxAg =
                              p.features?.maxAgents ||
                              p.features?.maxUsers ||
                              (isEntPlan ? 35 : isBusinessPlan ? 15 : hasMultiAg ? 5 : 1);
                            const hasOmni = Boolean(p.features?.omnichannel ?? !isStarterPlan);
                            const maxChan =
                              p.features?.maxChannels !== undefined
                                ? Number(p.features.maxChannels)
                                : isEntPlan
                                ? 0
                                : isBusinessPlan
                                ? 12
                                : hasOmni
                                ? 4
                                : 0;
                            const hasSched = Boolean(p.features?.scheduledPosts ?? !isStarterPlan);
                            const hasAi = Boolean(
                              p.features?.aiAgent ?? (isBusinessPlan || isEntPlan)
                            );
                            const hasMcp = Boolean(
                              p.features?.mcpTools ?? (isBusinessPlan || isEntPlan)
                            );
                            const hasExport = Boolean(p.features?.exportReports ?? !isStarterPlan);
                            const storageMb =
                              Number(p.features?.maxStorageMb) ||
                              (isEntPlan
                                ? (p.period === 'annual' ? 40960 : 25600)
                                : isBusinessPlan
                                ? (p.period === 'annual' ? 10240 : 6144)
                                : isStarterPlan
                                ? 500
                                : (p.period === 'annual' ? 2048 : 1536));
                            const fileLimitMb =
                              Number(p.features?.maxAttachmentSizeMb) ||
                              (isEntPlan ? (p.period === 'annual' ? 50 : 40) : isBusinessPlan ? 25 : isStarterPlan ? 10 : 15);

                            return (
                              <div className="border-t border-gray-200 pt-2.5 space-y-1.5 text-xs text-gray-700">
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                  Ringkasan Kuota
                                </div>
                                <div className="flex items-center gap-2">
                                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span>
                                    Penyimpanan: <strong>{formatStorageQuota(storageMb)}</strong>{' '}
                                    (maks {fileLimitMb} MB/file)
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span>
                                    {p.features?.maxContacts === 0 || p.features?.unlimitedContacts
                                      ? 'Kontak Tanpa Batas'
                                      : `Hingga ${(Number(p.features?.maxContacts) || (isEntPlan ? (p.period === 'annual' ? 200000 : 150000) : isBusinessPlan ? 50000 : isStarterPlan ? 2500 : 10000)).toLocaleString('id-ID')} Kontak`}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span>
                                    {hasMultiSess ? `${maxSess} Sesi WA` : '1 Sesi WA'} &middot;{' '}
                                    {hasMultiAg ? `${maxAg} Akun CS` : '1 Akun Admin'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span>
                                    Siaran Promo:{' '}
                                    <strong>
                                      {p.features?.unlimitedBroadcast || p.features?.maxBroadcastPerMonth === 0
                                        ? 'Tanpa Batas Prioritas'
                                        : `${(Number(p.features?.maxBroadcastPerMonth) || (isStarterPlan ? 2500 : isBusinessPlan ? 100000 : 25000)).toLocaleString('id-ID')} pesan/bln`}
                                    </strong>
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span>
                                    Batas Ganti Nomor:{' '}
                                    <strong>
                                      {Number(p.features?.maxSessionIdentitySwitches) ||
                                        (isEntPlan ? (p.period === 'annual' ? 45 : 30) : isBusinessPlan ? 15 : isStarterPlan ? 2 : 5)}
                                      x
                                    </strong>{' '}
                                    per sesi
                                  </span>
                                </div>

                                {isExpanded && (
                                  <div className="pt-1.5 space-y-1.5 border-t border-gray-100">
                                    <div className="flex items-center gap-2">
                                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      <span>
                                        {p.features?.unlimitedBroadcast
                                          ? 'Siaran & Kampanye WA Tanpa Batas'
                                          : `Siaran WA (${(p.features?.maxBroadcastPerMonth || 1500).toLocaleString('id-ID')} pesan/bln)`}
                                      </span>
                                    </div>
                                    <div className="pt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                      Akses Menu Aplikasi
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      <span>Dashboard, Kontak, Siaran, Galeri &amp; Ultah</span>
                                    </div>
                                    <div
                                      className={`flex items-center gap-2 ${
                                        hasLiveChat ? '' : 'text-gray-400'
                                      }`}
                                    >
                                      {hasLiveChat ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      ) : (
                                        <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                      )}
                                      <span>Inbox Live Chat CRM, SLA &amp; CSAT</span>
                                    </div>
                                    <div
                                      className={`flex items-center gap-2 ${
                                        hasOmni ? '' : 'text-gray-400'
                                      }`}
                                    >
                                      {hasOmni ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      ) : (
                                        <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                      )}
                                      <span>
                                        Komentar, Feed &amp; Omnichannel{' '}
                                        {hasOmni
                                          ? `(${maxChan === 0 ? 'Tanpa Batas' : maxChan + ' kanal'})`
                                          : ''}
                                      </span>
                                    </div>
                                    <div
                                      className={`flex items-center gap-2 ${
                                        hasSched ? '' : 'text-gray-400'
                                      }`}
                                    >
                                      {hasSched ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      ) : (
                                        <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                      )}
                                      <span>Jadwal Post, Story WA &amp; Ide Konten</span>
                                    </div>
                                    <div
                                      className={`flex items-center gap-2 ${
                                        hasAi ? '' : 'text-gray-400'
                                      }`}
                                    >
                                      {hasAi ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      ) : (
                                        <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                      )}
                                      <span>
                                        Agent AI, Knowledge Book{hasMcp ? ' & MCP Tools' : ''}
                                      </span>
                                    </div>
                                    <div
                                      className={`flex items-center gap-2 ${
                                        hasExport ? '' : 'text-gray-400'
                                      }`}
                                    >
                                      {hasExport ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      ) : (
                                        <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                      )}
                                      <span>
                                        Ekspor CSV{p.features?.apiAccess ? ' & Akses API' : ''}
                                      </span>
                                    </div>
                                  </div>
                                )}

                                <button
                                  type="button"
                                  onClick={(e) => togglePlanDetails(p.slug, e)}
                                  className="pt-1 inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
                                >
                                  <span>
                                    {isExpanded ? 'Sembunyikan detail' : 'Lihat detail fitur & menu'}
                                  </span>
                                  {isExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            );
                          })()}
                        </div>

                        {(!currentLicense ||
                          currentLicense.status === 'UNLICENSED' ||
                          currentLicense.status === 'EXPIRED' ||
                          currentLicense.isExpired) && (
                          <div className="pt-3 mt-3 border-t border-gray-100">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              isLoading={startingTrialSlug === p.slug}
                              disabled={Boolean(startingTrialSlug) || isSubmitting}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleStartTrial(p.slug);
                              }}
                              className="w-full justify-center"
                            >
                              Coba Trial {p.trialDays || 7} Hari
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  </div>
                  {canScrollLeft && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 left-0 w-7 bg-gradient-to-r from-white via-white/75 to-transparent"
                    />
                  )}
                  {canScrollRight && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 right-0 w-9 bg-gradient-to-l from-white via-white/75 to-transparent"
                    />
                  )}
                </div>
              </>
            )}

            {/* Duration Selector + Summary */}
            {selectedPlan && (
              <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/30 space-y-3 text-xs">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-sm text-gray-900">Pilih Durasi</h4>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {durationPresets.map((preset) => (
                        <button
                          key={preset.qty}
                          type="button"
                          onClick={() => setQuantity(preset.qty)}
                          className={`h-8 px-2.5 rounded-md border text-[11px] font-medium transition-colors ${
                            clampedQty === preset.qty
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    <div className="inline-flex items-center rounded-md border border-gray-200 bg-white overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                        disabled={clampedQty <= 1}
                        className="h-8 w-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                        aria-label="Kurangi durasi"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={maxQty}
                        value={clampedQty}
                        onChange={(e) => {
                          const v = Number.parseInt(e.target.value, 10);
                          if (Number.isFinite(v)) {
                            setQuantity(Math.min(maxQty, Math.max(1, v)));
                          }
                        }}
                        className="w-12 h-8 text-center text-xs font-mono font-semibold text-gray-900 border-x border-gray-200 focus:outline-none"
                        aria-label="Durasi langganan"
                      />
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                        disabled={clampedQty >= maxQty}
                        className="h-8 w-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                        aria-label="Tambah durasi"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5 pt-2 border-t border-indigo-100">
                  <div className="px-2.5 sm:px-3 py-2 rounded-lg bg-white border border-gray-200">
                    <span className="text-[10px] text-gray-500 block">Durasi</span>
                    <strong className="text-xs font-semibold font-mono text-gray-900">
                      {totalAddedMonths} Bulan
                    </strong>
                  </div>
                  <div className="px-2.5 sm:px-3 py-2 rounded-lg bg-white border border-gray-200">
                    <span className="text-[10px] text-gray-500 block">Aktif Hingga</span>
                    <strong className="text-xs font-semibold text-emerald-700">
                      {formatDateId(estimatedNewExpiry.toISOString())}
                    </strong>
                  </div>
                  <div className="px-2.5 sm:px-3 py-2 rounded-lg bg-white border border-gray-200">
                    <span className="text-[10px] text-gray-500 block">Harga Normal</span>
                    <strong className="text-xs font-semibold font-mono text-gray-400 line-through tabular-nums">
                      Rp {totalOriginalSubtotal.toLocaleString('id-ID')}
                    </strong>
                  </div>
                  <div className="col-span-2 sm:col-span-1 px-2.5 sm:px-3 py-2 rounded-lg bg-white border border-gray-200 flex items-center justify-between sm:block">
                    <span className="text-[10px] text-gray-500 block">Total Promo</span>
                    <strong className="text-sm font-bold font-mono text-indigo-700 tabular-nums">
                      Rp {totalSubtotal.toLocaleString('id-ID')}
                    </strong>
                  </div>
                </div>
                {selectedPlan.promoValidUntil && (
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200/80 rounded-md px-2.5 py-1.5 font-medium">
                    <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>
                      Harga diskon promo berlaku hingga <strong>{selectedPlan.promoValidUntil}</strong>.
                      {totalDiscountSavings > 0 && (
                        <span className="ml-1 text-rose-700 font-semibold">
                          (Hemat Rp {totalDiscountSavings.toLocaleString('id-ID')})
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 space-y-3 text-xs">
              <h4 className="font-semibold text-sm text-gray-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-gray-600" />
                Informasi Pemesan &amp; Metode Pembayaran
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
                Setelah invoice diterbitkan, instruksi rekening / e-wallet pembayaran resmi dari Pengaturan Reneo akan ditampilkan beserta kode unik transfer 3 digit.
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
