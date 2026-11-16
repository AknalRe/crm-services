import React from 'react';
import { AiTestResult } from '../../types';
import { Button } from '../ui/Button';

interface AiTestSimulatorPanelProps {
  testMessage: string;
  onTestMessageChange: (val: string) => void;
  testing: boolean;
  testResult: AiTestResult | null;
  testError: string | null;
  onSubmitTest: (e: React.FormEvent) => void;
  providerLabelFallback: string;
}

const SAMPLE_PROMPTS = [
  'Halo, produk apa saja yang tersedia dan berapa harganya?',
  'Bagaimana syarat dan kebijakan garansi atau retur?',
  'Tolong hubungkan saya dengan admin / CS manusia.',
];

export const AiTestSimulatorPanel: React.FC<AiTestSimulatorPanelProps> = ({
  testMessage,
  onTestMessageChange,
  testing,
  testResult,
  testError,
  onSubmitTest,
}) => {
  return (
    <form
      onSubmit={onSubmitTest}
      className="bg-white rounded-lg border border-gray-200 p-5 space-y-3.5"
    >
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Uji Balasan, Prompt &amp; Tool MCP</h3>
        <p className="text-[11px] text-gray-500 mt-0.5">
          Menguji Personality, Positive/Negative Prompt, Knowledge Book aktif, Skill aktif, Tool MCP, serta rute Fallback yang dikonfigurasi.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SAMPLE_PROMPTS.map((sample) => (
          <button
            key={sample}
            type="button"
            onClick={() => onTestMessageChange(sample)}
            className="px-2 py-1 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100 text-[11px] text-gray-700 text-left transition-colors"
          >
            {sample}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Ketik contoh pertanyaan pelanggan..."
          value={testMessage}
          onChange={(e) => onTestMessageChange(e.target.value)}
          className="flex-1 h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
        />
        <Button type="submit" variant="primary" size="sm" isLoading={testing}>
          Uji Agent
        </Button>
      </div>

      {testError && (
        <div className="p-3 rounded border border-rose-200 bg-rose-50 text-xs text-rose-800 whitespace-pre-wrap">
          {testError}
        </div>
      )}

      {testResult && (
        <div className="space-y-2.5">
          {testResult.reply && (
            <div className="p-3.5 rounded bg-indigo-50/50 border border-indigo-100 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span
                  className={`px-1.5 py-0.5 rounded font-semibold ${
                    testResult.fallbackUsed
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {testResult.fallbackUsed ? 'Fallback digunakan' : 'Provider utama'}
                </span>
                <span className="font-medium text-gray-800">{testResult.providerLabel}</span>
                <span className="font-mono text-gray-600">{testResult.model}</span>
              </div>
              <div className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
                {testResult.reply}
              </div>
            </div>
          )}

          {testResult.toolCalls && testResult.toolCalls.length > 0 && (
            <div className="rounded border border-gray-200 bg-gray-50 p-2.5 space-y-1.5">
              <div className="text-[11px] font-semibold text-gray-700">
                Tool Dipanggil ({testResult.toolCalls.length})
              </div>
              {testResult.toolCalls.map((tc, idx) => (
                <div
                  key={`${tc.toolName}-${idx}`}
                  className="text-[11px] bg-white rounded border border-gray-200 px-2.5 py-1.5 space-y-0.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          tc.source === 'MCP'
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {tc.source}
                      </span>
                      <span className="font-mono font-medium text-gray-900">{tc.toolName}</span>
                      {tc.serverName && (
                        <span className="text-[10px] text-gray-500">({tc.serverName})</span>
                      )}
                    </div>
                    <span className="font-mono text-[10px] text-gray-500">{tc.durationMs}ms</span>
                  </div>
                  <p className="text-[11px] text-gray-600 truncate">{tc.summary}</p>
                </div>
              ))}
            </div>
          )}

          {testResult.attempts.length > 0 && (
            <div className="rounded border border-gray-200 bg-gray-50 p-2.5 space-y-1">
              <div className="text-[11px] font-semibold text-gray-700">Jejak Eksekusi Model</div>
              {testResult.attempts.map((att, idx) => (
                <div
                  key={`${att.slotId}-${idx}`}
                  className="text-[11px] flex flex-wrap items-baseline justify-between gap-2 text-gray-700"
                >
                  <div className="min-w-0">
                    <span
                      className={`font-semibold ${
                        att.ok ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {att.ok ? 'BERHASIL' : 'GAGAL'}
                    </span>{' '}
                    <span>{att.slotLabel}</span> •{' '}
                    <span className="font-medium">{att.providerLabel}</span> (
                    <span className="font-mono">{att.model}</span>)
                    {!att.ok && att.error ? (
                      <span className="text-rose-700"> — {att.error}</span>
                    ) : null}
                  </div>
                  <span className="font-mono text-[10px] text-gray-500 shrink-0">
                    {att.durationMs}ms
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </form>
  );
};
