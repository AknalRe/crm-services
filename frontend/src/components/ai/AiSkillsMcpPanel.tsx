import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import api from '../../services/api';
import {
  AiAgentConfig,
  AiMcpServer,
  AiSkill,
  AiSkillPreset,
  BuiltinCrmTool,
  McpToolDescriptor,
} from '../../types';
import { Button } from '../ui/Button';
import { ConfirmModal } from '../ui/ConfirmModal';
import { EmptyState } from '../ui/StateBlocks';
import { useToast } from '../ui/ToastProvider';

interface AiSkillsMcpPanelProps {
  config: AiAgentConfig;
  skills: AiSkill[];
  skillPresets: AiSkillPreset[];
  builtinTools: BuiltinCrmTool[];
  mcpServers: AiMcpServer[];
  onRefreshSkillsAndMcp: () => Promise<void>;
  onSaveBuiltinTools: (nextTools: string[]) => Promise<void>;
}

export const AiSkillsMcpPanel: React.FC<AiSkillsMcpPanelProps> = ({
  config,
  skills,
  skillPresets,
  builtinTools,
  mcpServers,
  onRefreshSkillsAndMcp,
  onSaveBuiltinTools,
}) => {
  const toast = useToast();
  const [skillMode, setSkillMode] = useState<'NONE' | 'CATALOG' | 'CUSTOM' | 'MARKDOWN'>('NONE');
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Skill Custom / Edit Form
  const [skillName, setSkillName] = useState('');
  const [skillCat, setSkillCat] = useState<AiSkill['category']>('CUSTOM');
  const [skillDesc, setSkillDesc] = useState('');
  const [skillTrigger, setSkillTrigger] = useState('');
  const [skillInstructions, setSkillInstructions] = useState('');
  const [skillTools, setSkillTools] = useState<string[]>([]);

  // Install SKILL.md / URL Form
  const [mdUrl, setMdUrl] = useState('');
  const [mdRaw, setMdRaw] = useState('');
  const [mdName, setMdName] = useState('');

  // MCP Add Server Form
  const [showMcpForm, setShowMcpForm] = useState(false);
  const [mcpName, setMcpName] = useState('');
  const [mcpUrl, setMcpUrl] = useState('');
  const [mcpAuthType, setMcpAuthType] = useState<'NONE' | 'BEARER' | 'HEADER'>('BEARER');
  const [mcpHeaderName, setMcpHeaderName] = useState('X-API-Key');
  const [mcpToken, setMcpToken] = useState('');
  const [mcpDesc, setMcpDesc] = useState('');
  const [mcpPreviewTools, setMcpPreviewTools] = useState<McpToolDescriptor[] | null>(null);

  const [deleteSkillTarget, setDeleteSkillTarget] = useState<AiSkill | null>(null);
  const [deleteMcpTarget, setDeleteMcpTarget] = useState<AiMcpServer | null>(null);

  const installedSlugs = new Set(skills.map((s) => s.slug));

  const resetSkillForm = () => {
    setEditingSkillId(null);
    setSkillName('');
    setSkillCat('CUSTOM');
    setSkillDesc('');
    setSkillTrigger('');
    setSkillInstructions('');
    setSkillTools([]);
    setSkillMode('NONE');
  };

  const startEditSkill = (skill: AiSkill) => {
    setEditingSkillId(skill.id);
    setSkillName(skill.name);
    setSkillCat(skill.category || 'CUSTOM');
    setSkillDesc(skill.description || '');
    setSkillTrigger(skill.triggerHint || '');
    setSkillInstructions(skill.instructions);
    setSkillTools(skill.linkedTools || []);
    setSkillMode('CUSTOM');
  };

  const toggleSkillTool = (toolName: string) => {
    setSkillTools((prev) =>
      prev.includes(toolName) ? prev.filter((x) => x !== toolName) : [...prev, toolName]
    );
  };

  const handleSaveSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillName.trim() || !skillInstructions.trim()) return;
    setBusyKey('save-skill');
    try {
      if (editingSkillId) {
        await api.updateAiSkill(editingSkillId, {
          name: skillName.trim(),
          category: skillCat,
          description: skillDesc.trim() || null,
          triggerHint: skillTrigger.trim() || null,
          instructions: skillInstructions.trim(),
          linkedTools: skillTools,
        });
        toast.success(`Skill "${skillName.trim()}" diperbarui`);
      } else {
        await api.createAiSkill({
          name: skillName.trim(),
          category: skillCat,
          description: skillDesc.trim() || null,
          triggerHint: skillTrigger.trim() || null,
          instructions: skillInstructions.trim(),
          linkedTools: skillTools,
        });
        toast.success(`Skill "${skillName.trim()}" ditambahkan`);
      }
      resetSkillForm();
      await onRefreshSkillsAndMcp();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan skill');
    } finally {
      setBusyKey(null);
    }
  };

  const handleInstallPresetSkill = async (slug: string) => {
    setBusyKey(`preset:${slug}`);
    try {
      const installed = await api.installAiSkillPreset(slug);
      await onRefreshSkillsAndMcp();
      toast.success(`Skill "${installed.name}" di-install dan diaktifkan`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal meng-install skill');
    } finally {
      setBusyKey(null);
    }
  };

  const handleInstallSkillMarkdown = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mdRaw.trim() && !mdUrl.trim()) return;
    setBusyKey('install-skill-md');
    try {
      const installed = await api.installAiSkillMarkdown({
        rawMarkdown: mdRaw.trim() || undefined,
        sourceUrl: mdUrl.trim() || undefined,
        name: mdName.trim() || undefined,
      });
      setMdUrl('');
      setMdRaw('');
      setMdName('');
      setSkillMode('NONE');
      await onRefreshSkillsAndMcp();
      toast.success(`Skill "${installed.name}" berhasil di-install`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal meng-install SKILL.md');
    } finally {
      setBusyKey(null);
    }
  };

  const handleToggleSkillActive = async (skill: AiSkill) => {
    setBusyKey(`toggle-skill:${skill.id}`);
    try {
      await api.updateAiSkill(skill.id, { isActive: !skill.isActive });
      await onRefreshSkillsAndMcp();
    } catch {
      toast.error('Gagal mengubah status skill');
    } finally {
      setBusyKey(null);
    }
  };

  const handleConfirmDeleteSkill = async () => {
    if (!deleteSkillTarget) return;
    setBusyKey(`delete-skill:${deleteSkillTarget.id}`);
    try {
      await api.deleteAiSkill(deleteSkillTarget.id);
      setDeleteSkillTarget(null);
      await onRefreshSkillsAndMcp();
      toast.success('Skill dihapus');
    } catch {
      toast.error('Gagal menghapus skill');
    } finally {
      setBusyKey(null);
    }
  };

  const handleToggleBuiltinTool = async (toolName: string) => {
    const current = new Set(config.enabledBuiltinTools || []);
    if (current.has(toolName)) current.delete(toolName);
    else current.add(toolName);
    await onSaveBuiltinTools(Array.from(current));
  };

  const applyReneoMcpTemplate = () => {
    setShowMcpForm(true);
    setMcpName('Reneo Panel MCP');
    setMcpUrl('http://host.docker.internal:8000/mcp');
    setMcpAuthType('BEARER');
    setMcpDesc('Akses operasional server Linux, Docker, file, dan project via MCP Reneo Panel.');
    setMcpPreviewTools(null);
  };

  const handleTestMcpDraft = async () => {
    if (!mcpUrl.trim()) {
      toast.error('URL endpoint MCP wajib diisi');
      return;
    }
    setBusyKey('test-mcp-draft');
    setMcpPreviewTools(null);
    try {
      const res = await api.testAiMcpConnection({
        name: mcpName.trim() || 'MCP Server',
        endpointUrl: mcpUrl.trim(),
        authType: mcpAuthType,
        authHeaderName: mcpHeaderName.trim(),
        authToken: mcpToken.trim(),
      });
      setMcpPreviewTools(res.tools || []);
      toast.success(`Terhubung! Ditemukan ${res.toolsCount} tool MCP`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Koneksi MCP gagal');
    } finally {
      setBusyKey(null);
    }
  };

  const handleSaveMcpServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mcpName.trim() || !mcpUrl.trim()) return;
    setBusyKey('create-mcp');
    try {
      const { warning } = await api.createAiMcpServer({
        name: mcpName.trim(),
        description: mcpDesc.trim() || null,
        endpointUrl: mcpUrl.trim(),
        authType: mcpAuthType,
        authHeaderName: mcpHeaderName.trim(),
        authToken: mcpToken.trim(),
      });
      setMcpName('');
      setMcpUrl('');
      setMcpToken('');
      setMcpDesc('');
      setMcpPreviewTools(null);
      setShowMcpForm(false);
      await onRefreshSkillsAndMcp();
      if (warning) {
        toast.info(`Server disimpan, namun sinkronisasi awal gagal: ${warning}`);
      } else {
        toast.success('Server MCP disimpan dan tool disinkronkan');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan server MCP');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDiscoverMcp = async (id: string) => {
    setBusyKey(`discover:${id}`);
    try {
      const updated = await api.discoverAiMcpServer(id);
      await onRefreshSkillsAndMcp();
      toast.success(`Disinkronkan: ${updated.cachedTools.length} tool dari ${updated.name}`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal memuat tool MCP');
      await onRefreshSkillsAndMcp();
    } finally {
      setBusyKey(null);
    }
  };

  const handleToggleMcpServer = async (srv: AiMcpServer) => {
    setBusyKey(`toggle-mcp:${srv.id}`);
    try {
      await api.updateAiMcpServer(srv.id, { isActive: !srv.isActive });
      await onRefreshSkillsAndMcp();
    } catch {
      toast.error('Gagal mengubah status server MCP');
    } finally {
      setBusyKey(null);
    }
  };

  const handleToggleMcpTool = async (srv: AiMcpServer, toolName: string) => {
    const disabled = new Set(srv.disabledTools || []);
    if (disabled.has(toolName)) disabled.delete(toolName);
    else disabled.add(toolName);
    setBusyKey(`tool:${srv.id}:${toolName}`);
    try {
      await api.updateAiMcpServer(srv.id, { disabledTools: Array.from(disabled) });
      await onRefreshSkillsAndMcp();
    } catch {
      toast.error('Gagal mengubah status tool MCP');
    } finally {
      setBusyKey(null);
    }
  };

  const handleConfirmDeleteMcp = async () => {
    if (!deleteMcpTarget) return;
    setBusyKey(`delete-mcp:${deleteMcpTarget.id}`);
    try {
      await api.deleteAiMcpServer(deleteMcpTarget.id);
      setDeleteMcpTarget(null);
      await onRefreshSkillsAndMcp();
      toast.success('Server MCP dihapus');
    } catch {
      toast.error('Gagal menghapus server MCP');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Skills Column */}
      <div className="lg:col-span-6 space-y-4">
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-gray-100">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Agent Skills ({skills.length})
              </h2>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Install paket skill siap pakai, impor file <code className="font-mono">SKILL.md</code>, atau buat SOP khusus untuk Agent AI.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                variant={skillMode === 'CATALOG' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => {
                  setEditingSkillId(null);
                  setSkillMode((m) => (m === 'CATALOG' ? 'NONE' : 'CATALOG'));
                }}
              >
                Install Skill ({skillPresets.length})
              </Button>
              <Button
                type="button"
                variant={skillMode === 'MARKDOWN' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => {
                  setEditingSkillId(null);
                  setSkillMode((m) => (m === 'MARKDOWN' ? 'NONE' : 'MARKDOWN'));
                }}
              >
                SKILL.md / URL
              </Button>
              <Button
                type="button"
                variant={skillMode === 'CUSTOM' && !editingSkillId ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => {
                  if (skillMode === 'CUSTOM') resetSkillForm();
                  else {
                    setEditingSkillId(null);
                    setSkillName('');
                    setSkillDesc('');
                    setSkillTrigger('');
                    setSkillInstructions('');
                    setSkillTools([]);
                    setSkillMode('CUSTOM');
                  }
                }}
              >
                Tambah Kustom
              </Button>
            </div>
          </div>

          {skillMode === 'CATALOG' && (
            <div className="rounded-md border border-gray-200 bg-gray-50/70 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-900">Katalog Skill Siap Install</span>
                <button
                  type="button"
                  onClick={() => setSkillMode('NONE')}
                  className="text-[11px] text-gray-500 hover:text-gray-800"
                >
                  Tutup
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {skillPresets.map((preset) => {
                  const isInstalled = installedSlugs.has(preset.slug);
                  return (
                    <div
                      key={preset.slug}
                      className="rounded border border-gray-200 bg-white p-3 flex flex-col sm:flex-row sm:items-start justify-between gap-2.5"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-semibold">
                            {preset.category}
                          </span>
                          <span className="text-xs font-semibold text-gray-900">{preset.name}</span>
                        </div>
                        <p className="text-[11px] text-gray-600">{preset.description}</p>
                        {preset.linkedTools.length > 0 && (
                          <div className="text-[10px] font-mono text-gray-500">
                            Tool terkait: {preset.linkedTools.join(', ')}
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant={isInstalled ? 'secondary' : 'primary'}
                        size="sm"
                        isLoading={busyKey === `preset:${preset.slug}`}
                        onClick={() => void handleInstallPresetSkill(preset.slug)}
                      >
                        {isInstalled ? 'Update' : 'Install'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {skillMode === 'MARKDOWN' && (
            <form
              onSubmit={handleInstallSkillMarkdown}
              className="rounded-md border border-gray-200 bg-gray-50/70 p-3.5 space-y-2.5"
            >
              <div className="text-xs font-semibold text-gray-900">
                Install Skill dari File SKILL.md atau URL Raw
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="url"
                  placeholder="URL SKILL.md (opsional jika tempel di bawah)"
                  value={mdUrl}
                  onChange={(e) => setMdUrl(e.target.value)}
                  className="h-9 px-3 bg-white border border-gray-200 rounded-md text-xs font-mono"
                />
                <input
                  type="text"
                  placeholder="Nama override (opsional)"
                  value={mdName}
                  onChange={(e) => setMdName(e.target.value)}
                  className="h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
                />
              </div>
              <textarea
                rows={4}
                placeholder="Atau tempel konten SKILL.md (mendukung YAML frontmatter name/description/trigger)..."
                value={mdRaw}
                onChange={(e) => setMdRaw(e.target.value)}
                className="w-full p-2.5 bg-white border border-gray-200 rounded-md text-xs font-mono"
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setSkillMode('NONE')}>
                  Batal
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={busyKey === 'install-skill-md'}
                >
                  Install Skill
                </Button>
              </div>
            </form>
          )}

          {skillMode === 'CUSTOM' && (
            <form
              onSubmit={handleSaveSkill}
              className="rounded-md border border-gray-200 bg-gray-50/70 p-3.5 space-y-2.5"
            >
              <div className="text-xs font-semibold text-gray-900">
                {editingSkillId ? 'Edit Skill' : 'Tambah Skill Kustom'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Nama skill (mis. Rekomendasi Paket Reseller)"
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  className="sm:col-span-8 h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
                />
                <select
                  value={skillCat}
                  onChange={(e) => setSkillCat(e.target.value as AiSkill['category'])}
                  className="sm:col-span-4 h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs"
                >
                  <option value="CUSTOM">Kustom</option>
                  <option value="CRM">CRM</option>
                  <option value="SALES">Sales</option>
                  <option value="SUPPORT">Support</option>
                  <option value="OPERATIONS">Operasional</option>
                </select>
              </div>
              <input
                type="text"
                placeholder="Deskripsi singkat (opsional)"
                value={skillDesc}
                onChange={(e) => setSkillDesc(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
              />
              <input
                type="text"
                placeholder="Kondisi pemicu (mis. Saat pelanggan bertanya syarat reseller/agen)"
                value={skillTrigger}
                onChange={(e) => setSkillTrigger(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
              />
              <textarea
                rows={4}
                required
                placeholder="Instruksi langkah-langkah yang harus dijalankan AI saat skill ini terpicu..."
                value={skillInstructions}
                onChange={(e) => setSkillInstructions(e.target.value)}
                className="w-full p-2.5 bg-white border border-gray-200 rounded-md text-xs"
              />
              {builtinTools.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[11px] font-medium text-gray-700">
                    Kaitkan Tool CRM Otomatis saat Skill Aktif:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {builtinTools.map((tool) => (
                      <label key={tool.name} className="inline-flex items-center gap-1.5 text-[11px] text-gray-700">
                        <input
                          type="checkbox"
                          checked={skillTools.includes(tool.name)}
                          onChange={() => toggleSkillTool(tool.name)}
                        />
                        <span className="font-mono">{tool.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={resetSkillForm}>
                  Batal
                </Button>
                <Button type="submit" variant="primary" size="sm" isLoading={busyKey === 'save-skill'}>
                  {editingSkillId ? 'Simpan Perubahan' : 'Simpan Skill'}
                </Button>
              </div>
            </form>
          )}

          {skills.length === 0 ? (
            <EmptyState
              title="Belum ada Skill terpasang"
              description='Klik "Install Skill" untuk memasang skill siap pakai atau "Tambah Kustom" untuk membuat SOP baru.'
            />
          ) : (
            <div className="divide-y divide-gray-200">
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  className={`py-3 space-y-1.5 ${skill.isActive ? '' : 'opacity-60'}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-semibold">
                          {skill.category}
                        </span>
                        <span className="text-xs font-semibold text-gray-900">{skill.name}</span>
                        <span className="text-[10px] font-mono text-gray-400">{skill.slug}</span>
                      </div>
                      {skill.description && (
                        <p className="text-[11px] text-gray-600">{skill.description}</p>
                      )}
                      {skill.triggerHint && (
                        <p className="text-[11px] text-gray-500">
                          <strong>Pemicu:</strong> {skill.triggerHint}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={busyKey === `toggle-skill:${skill.id}`}
                        onClick={() => void handleToggleSkillActive(skill)}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                          skill.isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-gray-100 text-gray-600 border-gray-200'
                        }`}
                      >
                        {skill.isActive ? 'Aktif' : 'Nonaktif'}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditSkill(skill)}
                        className="px-2 py-0.5 rounded text-[10px] font-medium border border-gray-200 text-gray-700 hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteSkillTarget(skill)}
                        className="p-1 text-gray-400 hover:text-rose-600 rounded"
                        title="Hapus Skill"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-700 bg-gray-50 rounded border border-gray-100 px-2.5 py-1.5 whitespace-pre-wrap">
                    {skill.instructions}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MCP Servers & Built-in CRM Tools Column */}
      <div className="lg:col-span-6 space-y-4">
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
          <div className="pb-2 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Tool Internal CRM (Function Calling)</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Izinkan model AI memanggil tool internal CRM secara langsung untuk data real-time produk, Knowledge Book, pelanggan, atau eskalasi.
            </p>
          </div>
          <div className="space-y-2">
            {builtinTools.map((tool) => {
              const checked = (config.enabledBuiltinTools || []).includes(tool.name);
              return (
                <label
                  key={tool.name}
                  className="flex items-start gap-2.5 p-2.5 rounded-md border border-gray-200 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => void handleToggleBuiltinTool(tool.name)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-gray-900">{tool.label}</span>
                      <code className="text-[10px] font-mono text-gray-500">{tool.name}</code>
                    </div>
                    <p className="text-[11px] text-gray-600 mt-0.5">{tool.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-gray-100">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Tool MCP Eksternal ({mcpServers.length})
              </h2>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Hubungkan server Model Context Protocol (Streamable HTTP / JSON-RPC) seperti MCP Reneo Panel atau server MCP bisnis Anda.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={applyReneoMcpTemplate}
              >
                Template MCP Reneo
              </Button>
              <Button
                type="button"
                variant={showMcpForm ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setShowMcpForm((v) => !v)}
              >
                Tambah Server MCP
              </Button>
            </div>
          </div>

          {showMcpForm && (
            <form
              onSubmit={handleSaveMcpServer}
              className="rounded-md border border-gray-200 bg-gray-50/70 p-3.5 space-y-2.5"
            >
              <div className="text-xs font-semibold text-gray-900">
                Tambah Koneksi Server MCP (HTTP Streamable)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Nama Server MCP (mis. Reneo Server MCP)"
                  value={mcpName}
                  onChange={(e) => setMcpName(e.target.value)}
                  className="h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
                />
                <input
                  type="url"
                  required
                  placeholder="http://host.docker.internal:8000/mcp"
                  value={mcpUrl}
                  onChange={(e) => setMcpUrl(e.target.value)}
                  className="h-9 px-3 bg-white border border-gray-200 rounded-md text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <select
                  value={mcpAuthType}
                  onChange={(e) => setMcpAuthType(e.target.value as any)}
                  className="sm:col-span-4 h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs"
                >
                  <option value="BEARER">Bearer Token</option>
                  <option value="HEADER">Header Kustom</option>
                  <option value="NONE">Tanpa Auth</option>
                </select>
                {mcpAuthType === 'HEADER' && (
                  <input
                    type="text"
                    placeholder="Nama Header (X-API-Key)"
                    value={mcpHeaderName}
                    onChange={(e) => setMcpHeaderName(e.target.value)}
                    className="sm:col-span-3 h-9 px-2.5 bg-white border border-gray-200 rounded-md text-xs font-mono"
                  />
                )}
                {mcpAuthType !== 'NONE' && (
                  <input
                    type="password"
                    autoComplete="off"
                    placeholder="Token / API Key MCP..."
                    value={mcpToken}
                    onChange={(e) => setMcpToken(e.target.value)}
                    className={`${
                      mcpAuthType === 'HEADER' ? 'sm:col-span-5' : 'sm:col-span-8'
                    } h-9 px-3 bg-white border border-gray-200 rounded-md text-xs font-mono`}
                  />
                )}
              </div>

              <input
                type="text"
                placeholder="Catatan kegunaan MCP ini untuk Agent (opsional)"
                value={mcpDesc}
                onChange={(e) => setMcpDesc(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-gray-200 rounded-md text-xs"
              />

              {mcpPreviewTools && (
                <div className="rounded border border-emerald-200 bg-emerald-50 p-2.5 text-[11px] text-emerald-900">
                  Ditemukan <strong>{mcpPreviewTools.length}</strong> tool MCP:{' '}
                  <span className="font-mono">
                    {mcpPreviewTools.slice(0, 8).map((t) => t.name).join(', ')}
                    {mcpPreviewTools.length > 8 ? ` (+${mcpPreviewTools.length - 8} lainnya)` : ''}
                  </span>
                </div>
              )}

              <div className="flex flex-wrap justify-between gap-2 pt-0.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  isLoading={busyKey === 'test-mcp-draft'}
                  onClick={() => void handleTestMcpDraft()}
                >
                  Tes &amp; Preview Tool
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowMcpForm(false)}
                  >
                    Batal
                  </Button>
                  <Button type="submit" variant="primary" size="sm" isLoading={busyKey === 'create-mcp'}>
                    Simpan Server MCP
                  </Button>
                </div>
              </div>
            </form>
          )}

          {mcpServers.length === 0 ? (
            <EmptyState
              title="Belum ada Server MCP terhubung"
              description='Tambahkan URL endpoint MCP (HTTP/JSON-RPC) untuk memberi AI Agent akses tool eksternal secara aman.'
            />
          ) : (
            <div className="space-y-3">
              {mcpServers.map((srv) => {
                const disabledSet = new Set(srv.disabledTools || []);
                const enabledCount = srv.cachedTools.filter((t) => !disabledSet.has(t.name)).length;
                return (
                  <div
                    key={srv.id}
                    className={`rounded-md border p-3.5 space-y-2.5 ${
                      srv.isActive ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-70'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-gray-900">{srv.name}</span>
                          <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-mono font-semibold">
                            {enabledCount}/{srv.cachedTools.length} tool aktif
                          </span>
                          {srv.hasAuthToken && (
                            <span className="text-[10px] font-mono text-gray-500">
                              Auth: {srv.authType} ({srv.authTokenPreview})
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-gray-600 break-all">
                          {srv.endpointUrl}
                        </div>
                        {srv.description && (
                          <p className="text-[11px] text-gray-500">{srv.description}</p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0 self-end sm:self-auto">
                        <button
                          type="button"
                          disabled={busyKey === `toggle-mcp:${srv.id}`}
                          onClick={() => void handleToggleMcpServer(srv)}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                            srv.isActive
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-gray-100 text-gray-600 border-gray-200'
                          }`}
                        >
                          {srv.isActive ? 'Aktif' : 'Nonaktif'}
                        </button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          isLoading={busyKey === `discover:${srv.id}`}
                          onClick={() => void handleDiscoverMcp(srv.id)}
                        >
                          Sinkron Tool
                        </Button>
                        <button
                          type="button"
                          onClick={() => setDeleteMcpTarget(srv)}
                          title="Hapus Server MCP"
                          className="p-1 text-gray-400 hover:text-rose-600 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {srv.lastError && (
                      <div className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-800">
                        Error sinkronisasi terakhir: {srv.lastError}
                      </div>
                    )}

                    {srv.cachedTools.length > 0 && (
                      <div className="rounded border border-gray-200 bg-gray-50 p-2.5 max-h-48 overflow-y-auto space-y-1.5">
                        {srv.cachedTools.map((tool) => {
                          const isEnabled = !disabledSet.has(tool.name);
                          return (
                            <label
                              key={tool.name}
                              className="flex items-start gap-2 text-[11px] cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={isEnabled}
                                onChange={() => void handleToggleMcpTool(srv, tool.name)}
                                className="mt-0.5"
                              />
                              <div className="min-w-0">
                                <span className="font-mono font-semibold text-gray-900">
                                  {tool.name}
                                </span>
                                {tool.description && (
                                  <span className="text-gray-600"> — {tool.description}</span>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={Boolean(deleteSkillTarget)}
        onClose={() => setDeleteSkillTarget(null)}
        onConfirm={() => void handleConfirmDeleteSkill()}
        isLoading={Boolean(deleteSkillTarget && busyKey === `delete-skill:${deleteSkillTarget.id}`)}
        title="Hapus Skill Agent AI?"
        description={
          deleteSkillTarget
            ? `Skill "${deleteSkillTarget.name}" akan dihapus dari konfigurasi Agent AI.`
            : ''
        }
        confirmLabel="Hapus Skill"
        variant="danger"
      />

      <ConfirmModal
        isOpen={Boolean(deleteMcpTarget)}
        onClose={() => setDeleteMcpTarget(null)}
        onConfirm={() => void handleConfirmDeleteMcp()}
        isLoading={Boolean(deleteMcpTarget && busyKey === `delete-mcp:${deleteMcpTarget.id}`)}
        title="Hapus Server MCP?"
        description={
          deleteMcpTarget
            ? `Koneksi server MCP "${deleteMcpTarget.name}" akan dihapus beserta daftar tool-nya.`
            : ''
        }
        confirmLabel="Hapus Server"
        variant="danger"
      />
    </div>
  );
};
