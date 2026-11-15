import React, { useState } from 'react';
import { Lock, UserPlus, LogIn } from 'lucide-react';
import api from '../services/api';
import { Button } from './ui/Button';
import { useToast } from './ui/ToastProvider';

interface SetupLoginGateProps {
  initialized: boolean;
  onAuthenticated: (user: { name: string; email: string }) => void;
}

export const SetupLoginGate: React.FC<SetupLoginGateProps> = ({
  initialized,
  onAuthenticated,
}) => {
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = initialized
        ? await api.loginAuth({ email: email.trim(), password })
        : await api.setupAuth({ name: name.trim(), email: email.trim(), password });
      toast.success(initialized ? 'Berhasil masuk ke Reneo CRM.' : 'Akun admin CRM berhasil dibuat.');
      onAuthenticated(res.user);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal memproses autentikasi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg border border-gray-200 p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0">
            {initialized ? (
              <Lock className="w-5 h-5 text-indigo-600" />
            ) : (
              <UserPlus className="w-5 h-5 text-indigo-600" />
            )}
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900">
              {initialized ? 'Masuk ke Reneo CRM' : 'Setup Awal Akun Reneo CRM'}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              {initialized
                ? 'Masukkan email dan kata sandi akun admin CRM Anda untuk melanjutkan.'
                : 'Buat akun admin pertama untuk mengelola kontak, kampanye, dan Live Chat Omnichannel.'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {!initialized && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Nama Lengkap / Perusahaan
              </label>
              <input
                type="text"
                required
                placeholder="Mis. PT Maju Jaya"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-[13px] focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Email Admin
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
            leftIcon={initialized ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          >
            {initialized ? 'Masuk ke CRM' : 'Simpan & Lanjutkan'}
          </Button>
        </form>
      </div>
    </div>
  );
};

