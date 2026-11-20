import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Button } from './ui/Button';
import { useToast } from './ui/ToastProvider';
import { ReneoCrmLogo } from './ReneoCrmLogo';

interface SetupLoginGateProps {
  initialized: boolean;
  initialMode?: 'login' | 'setup';
  onAuthenticated: (user: { name: string; email: string }) => void;
  onBackToLanding?: () => void;
}

export const SetupLoginGate: React.FC<SetupLoginGateProps> = ({
  initialized,
  initialMode,
  onAuthenticated,
  onBackToLanding,
}) => {
  const toast = useToast();
  const [mode, setMode] = useState<'login' | 'setup'>(
    initialMode ?? (initialized ? 'login' : 'setup')
  );
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialMode) {
      setMode(initialMode);
    } else if (initialized) {
      setMode('login');
    }
  }, [initialized, initialMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const res = await api.loginAuth({ email: email.trim(), password });
        toast.success('Berhasil masuk ke Reneo CRM.');
        onAuthenticated(res.user);
      } else {
        let res: { user: { name: string; email: string } };
        if (initialized) {
          // Sistem sudah ada admin utama -> pendaftaran tenant perusahaan baru
          res = await api.registerCompany({
            companyName: companyName.trim() || name.trim() || 'Perusahaan Baru',
            name: name.trim(),
            email: email.trim(),
            password,
          });
          toast.success('Pendaftaran perusahaan baru berhasil.');
        } else {
          // Setup pertama kali
          res = await api.setupAuth({
            name: name.trim(),
            email: email.trim(),
            password,
          });
          toast.success('Akun admin CRM berhasil disiapkan.');
        }
        onAuthenticated(res.user);
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.message || 'Gagal memproses autentikasi.';
      const status = err.response?.status;
      const lowerErr = errMsg.toLowerCase();
      if (
        status === 409 ||
        lowerErr.includes('sudah terdaftar') ||
        lowerErr.includes('silakan login') ||
        lowerErr.includes('already registered')
      ) {
        toast.info('Akun admin sudah terdaftar. Silakan masukkan kata sandi Anda untuk masuk.');
        setMode('login');
      } else {
        toast.error(errMsg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const currentHost =
    typeof window !== 'undefined' && window.location.host
      ? window.location.host
      : 'panel.reneo.my.id';

  return (
    <div className="min-h-screen supports-[height:100dvh]:min-h-dvh bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg border border-gray-200 p-5 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            <ReneoCrmLogo className="w-6 h-6 shrink-0" />
            <span className="text-xs font-semibold text-gray-800 truncate">Reneo CRM</span>
          </div>
          <span className="text-[11px] font-mono text-gray-500 truncate">{currentHost}</span>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-gray-100 rounded-lg text-xs font-medium">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 py-1.5 px-3 rounded-md transition-all text-center ${
              mode === 'login'
                ? 'bg-white text-gray-900 shadow-sm font-semibold'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Masuk ke Akun
          </button>
          <button
            type="button"
            onClick={() => setMode('setup')}
            className={`flex-1 py-1.5 px-3 rounded-md transition-all text-center ${
              mode === 'setup'
                ? 'bg-white text-gray-900 shadow-sm font-semibold'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {initialized ? 'Daftar Baru' : 'Setup Awal'}
          </button>
        </div>

        <div className="min-w-0">
          <h1 className="text-base font-semibold text-gray-900">
            {mode === 'login'
              ? 'Masuk ke Reneo CRM'
              : initialized
              ? 'Daftar Perusahaan Baru'
              : 'Setup Awal Akun Reneo CRM'}
          </h1>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            {mode === 'login'
              ? 'Masukkan email dan kata sandi akun admin atau staf CRM Anda untuk membuka ruang kerja.'
              : initialized
              ? 'Daftarkan nama usaha Anda untuk membuat ruang kerja Reneo CRM baru yang terpisah dan aman.'
              : 'Buat akun pemilik/admin pertama untuk workspace CRM ini (terpisah dari akun login panel server).'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'setup' && (
            <>
              {initialized && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Nama Perusahaan / Bisnis
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Mis. PT Maju Jaya"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Nama Lengkap Admin
                </label>
                <input
                  type="text"
                  required
                  placeholder="Mis. Budi Santoso"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] focus:outline-none focus:border-indigo-500"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Email Akun
            </label>
            <input
              type="email"
              required
              placeholder="admin@perusahaan.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Kata Sandi
            </label>
            <input
              type="password"
              required
              minLength={6}
              placeholder="Minimal 6 karakter"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] focus:outline-none focus:border-indigo-500"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            isLoading={submitting}
          >
            {mode === 'login'
              ? 'Masuk ke CRM'
              : initialized
              ? 'Daftar & Buat Workspace'
              : 'Simpan & Lanjutkan'}
          </Button>
        </form>

        <div className="pt-2 border-t border-gray-100 flex flex-col gap-2 text-center">
          {mode === 'login' ? (
            <button
              type="button"
              onClick={() => setMode('setup')}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
            >
              {initialized ? 'Belum punya akun? Daftar perusahaan baru' : 'Belum setup workspace? Setup di sini'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMode('login')}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
            >
              Sudah punya akun? Masuk di sini
            </button>
          )}

          {onBackToLanding && (
            <button
              type="button"
              onClick={onBackToLanding}
              className="text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors"
            >
              Kembali ke halaman utama
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
