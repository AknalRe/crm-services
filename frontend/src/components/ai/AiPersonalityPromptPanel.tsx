import React, { useEffect, useState } from 'react';
import { AiAgentConfig, AiPersonalityProfile } from '../../types';
import { api } from '../../services/api';
import { Button } from '../ui/Button';

const DM_CHANNEL_OPTIONS = [
  { id: 'WHATSAPP', label: 'WhatsApp' },
  { id: 'INSTAGRAM', label: 'Instagram' },
  { id: 'FACEBOOK', label: 'Facebook' },
  { id: 'THREADS', label: 'Threads' },
  { id: 'TELEGRAM', label: 'Telegram' },
];

const COMMENT_CHANNEL_OPTIONS = DM_CHANNEL_OPTIONS.filter((o) => o.id !== 'WHATSAPP' && o.id !== 'TELEGRAM');

const SCOPE_OPTIONS: Array<{ id: 'PERSONAL' | 'GROUP' | 'BOTH'; label: string }> = [
  { id: 'PERSONAL', label: 'Chat personal saja' },
  { id: 'GROUP', label: 'Grup saja' },
  { id: 'BOTH', label: 'Personal & grup' },
];

function toggleItem(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

interface AiPersonalityPromptPanelProps {
  config: AiAgentConfig;
  savingConfig: boolean;
  onChangeConfig: (patch: Partial<AiAgentConfig>) => void;
  onSave: (e: React.FormEvent) => void;
}

export const AiPersonalityPromptPanel: React.FC<AiPersonalityPromptPanelProps> = ({
  config,
  savingConfig,
  onChangeConfig,
  onSave,
}) => {
  const personality = config.personality;
  const [sessionNames, setSessionNames] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .getWahaSessions()
      .then((res) => {
        if (!cancelled) setSessionNames((res.sessions || []).map((s) => s.name));
      })
      .catch(() => {
        if (!cancelled) setSessionNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updatePersonality = (patch: Partial<AiPersonalityProfile>) => {
    onChangeConfig({
      personality: {
        ...personality,
        ...patch,
      },
    });
  };

  return (
    <form onSubmit={onSave} className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <div className="pb-2.5 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Personality &amp; Identitas Agent</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Atur karakter, nada komunikasi, bahasa utama, panjang jawaban, sapaan awal, serta penutup pesan Agent AI.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nama Agent</label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => onChangeConfig({ name: e.target.value })}
              className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Peran / Jabatan</label>
            <input
              type="text"
              placeholder="Customer Service & Konsultan Produk"
              value={personality.roleTitle}
              onChange={(e) => updatePersonality({ roleTitle: e.target.value })}
              className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nada Komunikasi</label>
            <select
              value={personality.tone}
              onChange={(e) =>
                updatePersonality({ tone: e.target.value as AiPersonalityProfile['tone'] })
              }
              className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs"
            >
              <option value="PROFESSIONAL">Profesional &amp; Terpercaya</option>
              <option value="FRIENDLY">Ramah &amp; Hangat</option>
              <option value="FORMAL">Resmi &amp; Baku</option>
              <option value="CASUAL">Santai &amp; Ringan</option>
              <option value="EMPATHETIC">Empatik &amp; Menenangkan</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Bahasa Jawaban</label>
            <select
              value={personality.language}
              onChange={(e) =>
                updatePersonality({ language: e.target.value as AiPersonalityProfile['language'] })
              }
              className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs"
            >
              <option value="MATCH_USER">Ikuti Bahasa Pelanggan</option>
              <option value="INDONESIAN">Bahasa Indonesia</option>
              <option value="ENGLISH">English</option>
              <option value="BILINGUAL">Bilingual (ID / EN)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Panjang Jawaban</label>
            <select
              value={personality.responseLength}
              onChange={(e) =>
                updatePersonality({
                  responseLength: e.target.value as AiPersonalityProfile['responseLength'],
                })
              }
              className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs"
            >
              <option value="CONCISE">Ringkas (Padat &amp; Langsung)</option>
              <option value="BALANCED">Seimbang</option>
              <option value="DETAILED">Lengkap &amp; Detail</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Penggunaan Emoji</label>
            <select
              value={personality.emojiUsage}
              onChange={(e) =>
                updatePersonality({
                  emojiUsage: e.target.value as AiPersonalityProfile['emojiUsage'],
                })
              }
              className="w-full h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs"
            >
              <option value="NONE">Tanpa Emoji</option>
              <option value="MINIMAL">Minimal (seperlunya)</option>
              <option value="MODERATE">Moderat (lebih ekspresif)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Gaya Sapaan Awal (Opsional)
            </label>
            <input
              type="text"
              placeholder="Halo Kak {nama}, terima kasih sudah menghubungi kami."
              value={personality.greetingStyle}
              onChange={(e) => updatePersonality({ greetingStyle: e.target.value })}
              className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Gaya Penutup Pesan (Opsional)
            </label>
            <input
              type="text"
              placeholder="Ada lagi yang bisa saya bantu hari ini?"
              value={personality.closingStyle}
              onChange={(e) => updatePersonality({ closingStyle: e.target.value })}
              className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Deskripsi Persona &amp; Latar Belakang Bisnis
          </label>
          <textarea
            rows={2}
            placeholder="Jelaskan profil brand, konteks bisnis, dan karakter utama asisten..."
            value={config.persona}
            onChange={(e) => onChangeConfig({ persona: e.target.value })}
            className="w-full p-2.5 bg-white border border-gray-200 rounded-md text-xs"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <div className="pb-2.5 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Positive &amp; Negative Prompt</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Pisahkan arahan yang wajib diutamakan (Positive) dengan batasan atau larangan keras (Negative) agar balasan AI tetap terkontrol.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-emerald-800 mb-1">
            Positive Prompt (Hal yang Wajib Dilakukan &amp; Diutamakan)
          </label>
          <textarea
            rows={4}
            placeholder="Contoh:&#10;- Selalu jawab pertanyaan utama di kalimat pertama.&#10;- Jika pelanggan bertanya harga, cek tool katalog lalu beri estimasi jelas.&#10;- Akhiri dengan ajakan konsultasi atau konfirmasi order yang sopan."
            value={config.positivePrompt}
            onChange={(e) => onChangeConfig({ positivePrompt: e.target.value })}
            className="w-full p-2.5 bg-white border border-gray-200 rounded-md text-xs leading-relaxed"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-rose-800 mb-1">
            Negative Prompt (Larangan &amp; Batasan Keras)
          </label>
          <textarea
            rows={4}
            placeholder="Contoh:&#10;- Dilarang mengarang harga, diskon, stok, atau promo yang tidak ada di Knowledge Book.&#10;- Jangan pernah menjanjikan refund di luar SOP.&#10;- Jangan membahas kompetitor atau topik di luar layanan perusahaan."
            value={config.negativePrompt}
            onChange={(e) => onChangeConfig({ negativePrompt: e.target.value })}
            className="w-full p-2.5 bg-white border border-gray-200 rounded-md text-xs leading-relaxed"
          />
        </div>

        <div className="space-y-1.5 pt-2 border-t border-gray-100">
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={config.autoReplyDm}
              onChange={(e) => onChangeConfig({ autoReplyDm: e.target.checked })}
            />
            <span>Balas DM masuk secara otomatis (WhatsApp, IG, FB, Threads, Telegram)</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={config.autoReplyComment}
              onChange={(e) => onChangeConfig({ autoReplyComment: e.target.checked })}
            />
            <span>
              Balas komentar sosial media masuk secara otomatis (jika tidak cocok aturan kata kunci)
            </span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={config.humanTyping !== false}
              onChange={(e) => onChangeConfig({ humanTyping: e.target.checked })}
            />
            <span>
              Tandai dibaca dan tampilkan &quot;sedang mengetik...&quot; di WhatsApp sebelum AI mengirim balasan
            </span>
          </label>
        </div>

        <div className="space-y-3 pt-2 border-t border-gray-100">
          <div>
            <div className="text-xs font-semibold text-gray-900">Cakupan Balasan Otomatis AI</div>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Batasi kanal dan sesi tempat AI boleh membalas. Kanal yang tidak dicentang tetap
              ditangani tim manusia.
            </p>
          </div>

          <div>
            <div className="text-[11px] font-medium text-gray-700 mb-1.5">Jenis percakapan WhatsApp</div>
            <div className="flex flex-wrap gap-1.5">
              {SCOPE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeConfig({ dmScope: opt.id })}
                  className={`h-7 px-2.5 rounded-md border text-[11px] font-medium transition-colors ${
                    (config.dmScope || 'PERSONAL') === opt.id
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {(config.dmScope === 'GROUP' || config.dmScope === 'BOTH') && (
              <label className="flex items-center gap-2 text-[11px] text-gray-700 mt-2">
                <input
                  type="checkbox"
                  checked={config.groupMentionOnly !== false}
                  onChange={(e) => onChangeConfig({ groupMentionOnly: e.target.checked })}
                />
                <span>
                  Di grup, balas hanya jika pesan menyebut nama agent{' '}
                  <span className="font-mono">{config.name}</span>
                </span>
              </label>
            )}
            {!config.autoReplyDm && (
              <p className="text-[10px] text-amber-700 mt-1.5">
                Aktifkan &quot;Balas DM masuk secara otomatis&quot; agar pengaturan cakupan ini berlaku.
              </p>
            )}
          </div>

          <div>
            <div className="text-[11px] font-medium text-gray-700 mb-1.5">Live chat / DM</div>
            <div className="flex flex-wrap gap-1.5">
              {DM_CHANNEL_OPTIONS.map((opt) => {
                const active = (config.dmChannels || []).includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeConfig({ dmChannels: toggleItem(config.dmChannels || [], opt.id) })}
                    className={`h-7 px-2.5 rounded-md border text-[11px] font-medium transition-colors ${
                      active
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {(config.dmChannels || []).includes('WHATSAPP') && (
              <div className="mt-2.5">
                <div className="text-[11px] font-medium text-gray-700 mb-1.5">
                  Sesi WhatsApp{' '}
                  <span className="font-normal text-gray-500">
                    ({(config.dmWahaSessions || []).length === 0 ? 'semua sesi' : `${config.dmWahaSessions.length} sesi dipilih`})
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sessionNames.length === 0 && (
                    <span className="text-[11px] text-gray-500">
                      Belum ada sesi WhatsApp terdaftar. AI membalas di semua sesi.
                    </span>
                  )}
                  {sessionNames.map((name) => {
                    const active = (config.dmWahaSessions || []).includes(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() =>
                          onChangeConfig({ dmWahaSessions: toggleItem(config.dmWahaSessions || [], name) })
                        }
                        className={`h-7 px-2.5 rounded-md border text-[11px] font-mono transition-colors ${
                          active
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-500 mt-1">
                  Kosongkan pilihan untuk mengaktifkan AI di semua sesi WhatsApp.
                </p>
              </div>
            )}
          </div>

          <div>
            <div className="text-[11px] font-medium text-gray-700 mb-1.5">Komentar sosial media</div>
            <div className="flex flex-wrap gap-1.5">
              {COMMENT_CHANNEL_OPTIONS.map((opt) => {
                const active = (config.commentChannels || []).includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      onChangeConfig({ commentChannels: toggleItem(config.commentChannels || [], opt.id) })
                    }
                    className={`h-7 px-2.5 rounded-md border text-[11px] font-medium transition-colors ${
                      active
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="pt-1">
          <Button type="submit" variant="primary" size="sm" isLoading={savingConfig}>
            Simpan Personality &amp; Prompt
          </Button>
        </div>
      </div>
    </form>
  );
};
