import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import {
  birthdaySettings,
  companies,
  companySettings,
  crmLabels,
  systemSettings,
} from '../db/schema';

export const DEFAULT_COMPANY_ID = 'company_default';

export interface TenantExecutionContext {
  companyId: string;
  userId?: string;
  isPlatformAdmin?: boolean;
}

const tenantStorage = new AsyncLocalStorage<TenantExecutionContext>();

export function runWithCompany<T>(
  companyId: string,
  fn: () => T,
  meta?: { userId?: string; isPlatformAdmin?: boolean }
): T {
  const normalized = (companyId || '').trim() || DEFAULT_COMPANY_ID;
  return tenantStorage.run(
    {
      companyId: normalized,
      userId: meta?.userId,
      isPlatformAdmin: meta?.isPlatformAdmin,
    },
    fn
  );
}

export function enterCompanyContext(
  companyId: string,
  meta?: { userId?: string; isPlatformAdmin?: boolean }
): void {
  const normalized = (companyId || '').trim() || DEFAULT_COMPANY_ID;
  tenantStorage.enterWith({
    companyId: normalized,
    userId: meta?.userId,
    isPlatformAdmin: meta?.isPlatformAdmin,
  });
}

export function getActiveCompanyId(explicitCompanyId?: string | null): string {
  const cleanExplicit = String(explicitCompanyId || '').trim();
  if (cleanExplicit) return cleanExplicit;
  return tenantStorage.getStore()?.companyId || DEFAULT_COMPANY_ID;
}

export function getTenantStore(): TenantExecutionContext | undefined {
  return tenantStorage.getStore();
}

export function slugifyCompanyName(raw: string): string {
  const base = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'perusahaan';
}

export async function generateUniqueCompanySlug(name: string): Promise<string> {
  const base = slugifyCompanyName(name);
  const existing = await db
    .select({ slug: companies.slug })
    .from(companies)
    .where(eq(companies.slug, base))
    .limit(1);
  if (!existing[0]) return base;
  return `${base}-${crypto.randomBytes(2).toString('hex')}`;
}

export async function getSystemSettingMap(): Promise<Record<string, string>> {
  const rows = await db.select().from(systemSettings);
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }
  return map;
}

export async function upsertSystemSetting(key: string, value: string): Promise<void> {
  const now = new Date();
  await db
    .insert(systemSettings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value, updatedAt: now },
    });
}

export async function getCompanySettingMap(companyId?: string | null): Promise<Record<string, string>> {
  const cid = getActiveCompanyId(companyId);
  try {
    const rows = await db
      .select()
      .from(companySettings)
      .where(eq(companySettings.companyId, cid));
    const map: Record<string, string> = {};
    for (const r of rows) {
      map[r.key] = r.value;
    }
    return map;
  } catch {
    return {};
  }
}

export async function getCompanySettingValue(
  key: string,
  companyId?: string | null
): Promise<string | null> {
  const cid = getActiveCompanyId(companyId);
  try {
    const rows = await db
      .select({ value: companySettings.value })
      .from(companySettings)
      .where(and(eq(companySettings.companyId, cid), eq(companySettings.key, key)))
      .limit(1);
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

export async function upsertCompanySetting(
  key: string,
  value: string,
  companyId?: string | null
): Promise<void> {
  const cid = getActiveCompanyId(companyId);
  const id = `${cid}::${key}`;
  const now = new Date();
  await db
    .insert(companySettings)
    .values({ id, companyId: cid, key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: companySettings.id,
      set: { value, updatedAt: now },
    });
}

export async function deleteCompanySetting(
  key: string,
  companyId?: string | null
): Promise<void> {
  const cid = getActiveCompanyId(companyId);
  await db
    .delete(companySettings)
    .where(and(eq(companySettings.companyId, cid), eq(companySettings.key, key)));
}

export async function seedCompanyDefaults(companyId: string): Promise<void> {
  const cid = getActiveCompanyId(companyId);
  const now = new Date();

  const existingBday = await db
    .select({ id: birthdaySettings.id })
    .from(birthdaySettings)
    .where(eq(birthdaySettings.companyId, cid))
    .limit(1);
  if (!existingBday[0]) {
    const bdayId = cid === DEFAULT_COMPANY_ID ? 'default' : `bday_${cid}`;
    await db
      .insert(birthdaySettings)
      .values({
        id: bdayId,
        companyId: cid,
        isEnabled: true,
        sendTime: '08:00',
        messageTemplate:
          'Halo {nama_panggilan}! Selamat ulang tahun 🎉🎂 Semoga panjang umur, sehat selalu, berkah, dan sukses selalu!',
        delaySeconds: 5,
        channel: 'WHATSAPP',
        updatedAt: now,
      })
      .onConflictDoNothing()
      .catch(() => {});
  }

  const existingLabels = await db
    .select({ id: crmLabels.id })
    .from(crmLabels)
    .where(eq(crmLabels.companyId, cid))
    .limit(1);
  if (!existingLabels[0]) {
    const defaultLabels = [
      { key: 'lbl-conv-vip', scope: 'CONVERSATION_LABEL', name: 'VIP', color: 'amber', sort: 1 },
      { key: 'lbl-conv-followup', scope: 'CONVERSATION_LABEL', name: 'Follow Up', color: 'indigo', sort: 2 },
      { key: 'lbl-conv-komplain', scope: 'CONVERSATION_LABEL', name: 'Komplain', color: 'rose', sort: 3 },
      { key: 'lbl-conv-lunas', scope: 'CONVERSATION_LABEL', name: 'Lunas', color: 'emerald', sort: 4 },
      { key: 'lbl-conv-prospek', scope: 'CONVERSATION_LABEL', name: 'Prospek', color: 'sky', sort: 5 },
      { key: 'cat-cnt-umum', scope: 'CONTACT_CATEGORY', name: 'Umum', color: 'slate', sort: 1 },
      { key: 'cat-cnt-vip', scope: 'CONTACT_CATEGORY', name: 'VIP', color: 'amber', sort: 2 },
      { key: 'cat-cnt-prospek', scope: 'CONTACT_CATEGORY', name: 'Prospek', color: 'sky', sort: 3 },
      { key: 'cat-cnt-tetap', scope: 'CONTACT_CATEGORY', name: 'Pelanggan Tetap', color: 'emerald', sort: 4 },
      { key: 'cat-cnt-korporat', scope: 'CONTACT_CATEGORY', name: 'Korporat', color: 'indigo', sort: 5 },
      { key: 'cat-cnt-partner', scope: 'CONTACT_CATEGORY', name: 'Partner', color: 'violet', sort: 6 },
    ];
    for (const item of defaultLabels) {
      const id = cid === DEFAULT_COMPANY_ID ? item.key : `${cid}_${item.key}`;
      await db
        .insert(crmLabels)
        .values({
          id,
          companyId: cid,
          scope: item.scope,
          name: item.name,
          color: item.color,
          sortOrder: item.sort,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .catch(() => {});
    }
  }
}

export async function listActiveCompanyIds(): Promise<string[]> {
  try {
    const rows = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.status, 'ACTIVE'));
    return rows.length > 0 ? rows.map((r) => r.id) : [DEFAULT_COMPANY_ID];
  } catch {
    return [DEFAULT_COMPANY_ID];
  }
}
