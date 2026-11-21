import crypto from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { asc, count, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import {
  campaigns,
  campaignRecipients,
  chatMessages,
  companies,
  contactIdentities,
  contacts,
  contentIdeas,
  conversations,
  crmAgents,
  csatResponses,
  DEFAULT_COMPANY_ID,
  scheduledPosts,
  socialComments,
  webhookDeliveries,
  whatsappStatusViews,
} from '../db/schema';
import {
  ALL_PERMISSIONS,
  ensureDefaultRolesSeeded,
  getAuthSigningSecret,
  getCompanyAdminRoleId,
  getCurrentAuthUser,
  getRequestCompanyId,
  hashPassword,
  resolveAgentRoleSession,
  SESSION_COOKIE,
  signSessionToken,
} from './auth';
import { licenseService } from '../services/license.service';
import { liveEvents } from '../services/events.service';
import {
  generateUniqueCompanySlug,
  getSystemSettingMap,
  seedCompanyDefaults,
  upsertSystemSetting,
} from '../services/tenantContext';

async function requireAuthenticated(req: FastifyRequest, reply: FastifyReply) {
  const user = await getCurrentAuthUser(req);
  if (!user) {
    return reply.status(401).send({ success: false, error: 'Sesi login diperlukan' });
  }
}

async function requireCompanyAdmin(req: FastifyRequest, reply: FastifyReply) {
  const user = await getCurrentAuthUser(req);
  if (!user) {
    return reply.status(401).send({ success: false, error: 'Sesi login diperlukan' });
  }
  if (user.role !== 'ADMIN') {
    return reply.status(403).send({
      success: false,
      error: 'Hanya administrator perusahaan yang dapat mengubah pengaturan ini',
    });
  }
}

async function requirePlatformAdmin(req: FastifyRequest, reply: FastifyReply) {
  const user = await getCurrentAuthUser(req);
  if (!user) {
    return reply.status(401).send({ success: false, error: 'Sesi login diperlukan' });
  }
  if (!user.isPlatformAdmin) {
    return reply.status(403).send({
      success: false,
      code: 'PLATFORM_ADMIN_REQUIRED',
      error: 'Menu ini khusus untuk Platform Superadmin pengelola multi-perusahaan (SaaS).',
    });
  }
}

export default async function tenantsRouter(fastify: FastifyInstance) {
  // GET current active company info + license + live quota usage
  fastify.get('/current', { preHandler: requireAuthenticated }, async (req, reply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
      if (!company) {
        return reply.status(404).send({ success: false, error: 'Perusahaan tidak ditemukan' });
      }
      const license = await licenseService.getLicense(companyId, true);
      return reply.send({
        success: true,
        data: {
          company,
          license,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // PATCH current company metadata
  fastify.patch<{
    Body: { name?: string; ownerName?: string; ownerEmail?: string; ownerPhone?: string };
  }>('/current', { preHandler: requireCompanyAdmin }, async (req, reply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const updates: Record<string, any> = { updatedAt: new Date() };
      if (typeof req.body?.name === 'string') {
        const cleanName = req.body.name.trim();
        if (!cleanName) {
          return reply.status(400).send({ success: false, error: 'Nama usaha tidak boleh kosong' });
        }
        updates.name = cleanName;
      }
      if (typeof req.body?.ownerName === 'string') {
        updates.ownerName = req.body.ownerName.trim() || null;
      }
      if (typeof req.body?.ownerEmail === 'string') {
        updates.ownerEmail = req.body.ownerEmail.trim().toLowerCase() || null;
      }
      if (typeof req.body?.ownerPhone === 'string') {
        updates.ownerPhone = req.body.ownerPhone.trim() || null;
      }
      const [updated] = await db
        .update(companies)
        .set(updates)
        .where(eq(companies.id, companyId))
        .returning();
      licenseService.invalidateCache(companyId);
      liveEvents.emitForCompany(companyId, 'license:update', { action: 'company_profile' });
      return reply.send({ success: true, data: updated });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET SaaS public registration setting
  fastify.get('/saas-config', { preHandler: requirePlatformAdmin }, async (_req, reply) => {
    try {
      const sysMap = await getSystemSettingMap();
      return reply.send({
        success: true,
        data: {
          saasRegistrationEnabled: sysMap['saas_registration_enabled'] !== 'false',
          defaultTrialPlanSlug: sysMap['saas_default_trial_plan'] || 'pro-monthly',
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // PATCH SaaS public registration setting
  fastify.patch<{
    Body: { saasRegistrationEnabled?: boolean; defaultTrialPlanSlug?: string };
  }>('/saas-config', { preHandler: requirePlatformAdmin }, async (req, reply) => {
    try {
      if (typeof req.body?.saasRegistrationEnabled === 'boolean') {
        await upsertSystemSetting(
          'saas_registration_enabled',
          req.body.saasRegistrationEnabled ? 'true' : 'false'
        );
      }
      if (typeof req.body?.defaultTrialPlanSlug === 'string' && req.body.defaultTrialPlanSlug.trim()) {
        await upsertSystemSetting('saas_default_trial_plan', req.body.defaultTrialPlanSlug.trim());
      }
      const sysMap = await getSystemSettingMap();
      return reply.send({
        success: true,
        data: {
          saasRegistrationEnabled: sysMap['saas_registration_enabled'] !== 'false',
          defaultTrialPlanSlug: sysMap['saas_default_trial_plan'] || 'pro-monthly',
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET workspaces owned/accessible by current logged-in user (Multi-Tenant per account, each with its own license)
  fastify.get('/my-workspaces', { preHandler: requireAuthenticated }, async (req, reply) => {
    try {
      const user = await getCurrentAuthUser(req);
      if (!user) {
        return reply.status(401).send({ success: false, error: 'Sesi tidak valid' });
      }
      const rows = await db
        .select()
        .from(companies)
        .orderBy(desc(companies.isDefault), asc(companies.createdAt));

      const accessible = rows.filter(
        (c) =>
          user.isPlatformAdmin ||
          c.id === user.homeCompanyId ||
          c.id === user.companyId ||
          (c.ownerEmail || '').toLowerCase() === user.email.toLowerCase()
      );

      const enriched = await Promise.all(
        accessible.map(async (c) => {
          const lic = await licenseService.getLicense(c.id, false);
          return {
            id: c.id,
            name: c.name,
            slug: c.slug,
            status: c.status,
            isDefault: c.isDefault,
            isCurrent: c.id === user.companyId,
            license: {
              status: lic.status,
              plan: lic.plan,
              daysLeft: lic.daysLeft,
              isExpired: lic.isExpired,
            },
          };
        })
      );

      return reply.send({
        success: true,
        data: {
          currentCompanyId: user.companyId,
          workspaces: enriched,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST create a new tenant workspace under the current Admin account (requires its own license subscription)
  fastify.post<{
    Body: { name?: string; ownerPhone?: string };
  }>('/my-workspaces', { preHandler: requireCompanyAdmin }, async (req, reply) => {
    try {
      const user = await getCurrentAuthUser(req);
      if (!user) {
        return reply.status(401).send({ success: false, error: 'Sesi tidak valid' });
      }
      const name = String(req.body?.name || '').trim();
      const ownerPhone = req.body?.ownerPhone ? String(req.body.ownerPhone).trim() : null;
      if (!name || name.length < 2) {
        return reply.status(400).send({
          success: false,
          error: 'Nama bisnis / perusahaan baru wajib diisi (minimal 2 karakter).',
        });
      }

      const [agentRow] = await db
        .select()
        .from(crmAgents)
        .where(eq(crmAgents.id, user.id))
        .limit(1);
      if (!agentRow) {
        return reply.status(404).send({ success: false, error: 'Akun admin tidak ditemukan.' });
      }

      const now = new Date();
      const companyId = `cmp_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const slug = await generateUniqueCompanySlug(name);

      await db.insert(companies).values({
        id: companyId,
        name,
        slug,
        ownerName: user.name,
        ownerEmail: user.email.toLowerCase(),
        ownerPhone,
        status: 'ACTIVE',
        isDefault: false,
        licenseStatus: 'UNLICENSED',
        licensePlan: 'Belum Diaktivasi',
        licensePeriod: 'monthly',
        licensePriceAmount: 0,
        trialUsed: false,
        createdAt: now,
        updatedAt: now,
      });

      await ensureDefaultRolesSeeded(companyId);
      await seedCompanyDefaults(companyId);

      const secret = await getAuthSigningSecret();
      const token = signSessionToken(agentRow.email, secret, companyId);
      reply.header(
        'Set-Cookie',
        `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
      );

      const [created] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
      const session = await resolveAgentRoleSession(agentRow, companyId);
      const license = await licenseService.getLicense(companyId, true);
      liveEvents.emit('tenants:update', { action: 'create', id: companyId });

      return reply.status(201).send({
        success: true,
        message:
          license.status === 'ACTIVE' && !license.isExpired
            ? `Workspace "${name}" berhasil dibuat dan langsung aktif (${license.plan}).`
            : `Workspace "${name}" berhasil dibuat. Silakan aktifkan paket lisensi untuk workspace ini.`,
        data: { user: session, company: created, license },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // DELETE a non-default business workspace owned by current Admin account
  fastify.delete<{
    Params: { companyId: string };
  }>('/my-workspaces/:companyId', { preHandler: requireCompanyAdmin }, async (req, reply) => {
    try {
      const user = await getCurrentAuthUser(req);
      if (!user) {
        return reply.status(401).send({ success: false, error: 'Sesi tidak valid' });
      }
      const targetId = String(req.params.companyId || '').trim();
      if (!targetId) {
        return reply.status(400).send({ success: false, error: 'ID bisnis tidak valid.' });
      }

      const [targetCompany] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, targetId))
        .limit(1);
      if (!targetCompany) {
        return reply.status(404).send({ success: false, error: 'Bisnis / workspace tidak ditemukan.' });
      }

      if (targetCompany.isDefault || targetCompany.id === DEFAULT_COMPANY_ID) {
        return reply.status(400).send({
          success: false,
          error: 'Workspace utama platform tidak dapat dihapus.',
        });
      }

      const isAllowed =
        user.isPlatformAdmin ||
        targetCompany.id === user.homeCompanyId ||
        (targetCompany.ownerEmail || '').toLowerCase() === user.email.toLowerCase();
      if (!isAllowed) {
        return reply.status(403).send({
          success: false,
          error: 'Anda tidak memiliki hak untuk menghapus bisnis tersebut.',
        });
      }

      const allCompanies = await db
        .select()
        .from(companies)
        .orderBy(desc(companies.isDefault), asc(companies.createdAt));

      const accessible = allCompanies.filter(
        (c) =>
          user.isPlatformAdmin ||
          c.id === user.homeCompanyId ||
          c.id === user.companyId ||
          (c.ownerEmail || '').toLowerCase() === user.email.toLowerCase()
      );
      const remaining = accessible.filter((c) => c.id !== targetCompany.id);

      if (remaining.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'Minimal harus tersisa 1 bisnis aktif pada akun Anda.',
        });
      }

      const fallbackCompany = remaining[0];

      // Preserve the current admin account if its home companyId points to the workspace being deleted
      let [agentRow] = await db
        .select()
        .from(crmAgents)
        .where(eq(crmAgents.id, user.id))
        .limit(1);

      if (agentRow && agentRow.companyId === targetCompany.id) {
        const [updatedAgent] = await db
          .update(crmAgents)
          .set({ companyId: fallbackCompany.id, updatedAt: new Date() })
          .where(eq(crmAgents.id, agentRow.id))
          .returning();
        if (updatedAgent) {
          agentRow = updatedAgent;
        }
      }

      const [deleted] = await db
        .delete(companies)
        .where(eq(companies.id, targetCompany.id))
        .returning();
      if (!deleted) {
        return reply.status(404).send({ success: false, error: 'Bisnis tidak ditemukan.' });
      }

      licenseService.invalidateCache(targetCompany.id);
      liveEvents.emit('tenants:update', { action: 'delete', id: targetCompany.id });

      if (user.companyId === targetCompany.id && agentRow) {
        const secret = await getAuthSigningSecret();
        const token = signSessionToken(agentRow.email, secret, fallbackCompany.id);
        reply.header(
          'Set-Cookie',
          `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
        );
        const session = await resolveAgentRoleSession(agentRow, fallbackCompany.id);
        const license = await licenseService.getLicense(fallbackCompany.id, true);
        return reply.send({
          success: true,
          message: `Bisnis "${deleted.name}" telah dihapus permanen. Beralih ke "${fallbackCompany.name}".`,
          data: {
            deletedId: deleted.id,
            switched: true,
            user: session,
            company: fallbackCompany,
            license,
          },
        });
      }

      return reply.send({
        success: true,
        message: `Bisnis "${deleted.name}" beserta seluruh datanya telah dihapus permanen.`,
        data: {
          deletedId: deleted.id,
          switched: false,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST clear operational data of the currently active company (preserves company, license, agents/roles, settings, channels)
  fastify.post('/current/clear-data', { preHandler: requireCompanyAdmin }, async (req, reply) => {
    try {
      const user = await getCurrentAuthUser(req);
      if (!user) {
        return reply.status(401).send({ success: false, error: 'Sesi tidak valid' });
      }
      const companyId = getRequestCompanyId(req);

      const deletedMessages = await db
        .delete(chatMessages)
        .where(eq(chatMessages.companyId, companyId))
        .returning({ id: chatMessages.id });
      await db.delete(csatResponses).where(eq(csatResponses.companyId, companyId));
      const deletedConversations = await db
        .delete(conversations)
        .where(eq(conversations.companyId, companyId))
        .returning({ id: conversations.id });
      await db.delete(campaignRecipients).where(eq(campaignRecipients.companyId, companyId));
      const deletedCampaigns = await db
        .delete(campaigns)
        .where(eq(campaigns.companyId, companyId))
        .returning({ id: campaigns.id });
      await db.delete(contactIdentities).where(eq(contactIdentities.companyId, companyId));
      const deletedContacts = await db
        .delete(contacts)
        .where(eq(contacts.companyId, companyId))
        .returning({ id: contacts.id });
      await db.delete(socialComments).where(eq(socialComments.companyId, companyId));
      await db.delete(whatsappStatusViews).where(eq(whatsappStatusViews.companyId, companyId));
      await db.delete(scheduledPosts).where(eq(scheduledPosts.companyId, companyId));
      await db.delete(contentIdeas).where(eq(contentIdeas.companyId, companyId));
      await db.delete(webhookDeliveries).where(eq(webhookDeliveries.companyId, companyId));

      licenseService.invalidateCache(companyId);
      const license = await licenseService.getLicense(companyId, true);
      liveEvents.emitForCompany(companyId, 'contacts:update', { action: 'clear_company_data' });
      liveEvents.emitForCompany(companyId, 'conversations:update', { action: 'clear_company_data' });
      liveEvents.emitForCompany(companyId, 'license:update', { action: 'clear_company_data' });

      return reply.send({
        success: true,
        message: `Data operasional bisnis berhasil dibersihkan (${deletedContacts.length} kontak, ${deletedConversations.length} percakapan, ${deletedCampaigns.length} kampanye).`,
        data: {
          cleared: {
            contacts: deletedContacts.length,
            conversations: deletedConversations.length,
            messages: deletedMessages.length,
            campaigns: deletedCampaigns.length,
            media: 0,
          },
          license,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST switch active workspace for Platform Superadmin or Multi-Tenant Account Owner
  fastify.post<{
    Body: { companyId?: string };
  }>('/switch', { preHandler: requireAuthenticated }, async (req, reply) => {
    try {
      const user = await getCurrentAuthUser(req);
      if (!user) {
        return reply.status(401).send({ success: false, error: 'Sesi tidak valid' });
      }
      const targetCompanyId =
        String(req.body?.companyId || '').trim() || user.homeCompanyId || DEFAULT_COMPANY_ID;
      const [targetCompany] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, targetCompanyId))
        .limit(1);
      if (!targetCompany) {
        return reply.status(404).send({ success: false, error: 'Perusahaan tujuan tidak ditemukan' });
      }

      const isAllowed =
        user.isPlatformAdmin ||
        targetCompany.id === user.homeCompanyId ||
        (targetCompany.ownerEmail || '').toLowerCase() === user.email.toLowerCase();
      if (!isAllowed) {
        return reply.status(403).send({
          success: false,
          error: 'Anda tidak memiliki akses untuk beralih ke workspace perusahaan tersebut.',
        });
      }

      const [agentRow] = await db
        .select()
        .from(crmAgents)
        .where(eq(crmAgents.id, user.id))
        .limit(1);
      if (!agentRow) {
        return reply.status(404).send({ success: false, error: 'Akun admin tidak ditemukan' });
      }

      const secret = await getAuthSigningSecret();
      const token = signSessionToken(agentRow.email, secret, targetCompany.id);
      reply.header(
        'Set-Cookie',
        `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
      );
      const session = await resolveAgentRoleSession(agentRow, targetCompany.id);
      const license = await licenseService.getLicense(targetCompany.id, true);
      return reply.send({
        success: true,
        message: `Berhasil beralih ke workspace "${targetCompany.name}"`,
        data: { user: session, company: targetCompany, license },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET all companies (Platform Superadmin)
  fastify.get<{
    Querystring: { search?: string };
  }>('/', { preHandler: requirePlatformAdmin }, async (req, reply) => {
    try {
      const search = String(req.query?.search || '').trim().toLowerCase();
      const rows = await db
        .select()
        .from(companies)
        .orderBy(desc(companies.isDefault), asc(companies.createdAt));

      const filtered = search
        ? rows.filter(
            (c) =>
              c.name.toLowerCase().includes(search) ||
              c.slug.toLowerCase().includes(search) ||
              (c.ownerEmail || '').toLowerCase().includes(search) ||
              (c.ownerName || '').toLowerCase().includes(search)
          )
        : rows;

      const [agentCounts, contactCounts, convCounts] = await Promise.all([
        db.select({ companyId: crmAgents.companyId, val: count() }).from(crmAgents).groupBy(crmAgents.companyId),
        db.select({ companyId: contacts.companyId, val: count() }).from(contacts).groupBy(contacts.companyId),
        db
          .select({ companyId: conversations.companyId, val: count() })
          .from(conversations)
          .groupBy(conversations.companyId),
      ]);

      const agentMap = new Map(agentCounts.map((r) => [r.companyId, Number(r.val)]));
      const contactMap = new Map(contactCounts.map((r) => [r.companyId, Number(r.val)]));
      const convMap = new Map(convCounts.map((r) => [r.companyId, Number(r.val)]));

      const enriched = await Promise.all(
        filtered.map(async (c) => {
          const license = await licenseService.getLicense(c.id, false);
          return {
            ...c,
            stats: {
              agents: agentMap.get(c.id) || 0,
              contacts: contactMap.get(c.id) || 0,
              conversations: convMap.get(c.id) || 0,
            },
            license,
          };
        })
      );

      return reply.send({ success: true, data: enriched });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET single company details (Platform Superadmin)
  fastify.get<{
    Params: { id: string };
  }>('/:id', { preHandler: requirePlatformAdmin }, async (req, reply) => {
    try {
      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, req.params.id))
        .limit(1);
      if (!company) {
        return reply.status(404).send({ success: false, error: 'Perusahaan tidak ditemukan' });
      }
      const [license, usage, agents] = await Promise.all([
        licenseService.getLicense(company.id, false),
        licenseService.getLicenseUsage(company.id),
        db
          .select({
            id: crmAgents.id,
            name: crmAgents.name,
            email: crmAgents.email,
            role: crmAgents.role,
            roleId: crmAgents.roleId,
            isActive: crmAgents.isActive,
            createdAt: crmAgents.createdAt,
          })
          .from(crmAgents)
          .where(eq(crmAgents.companyId, company.id))
          .orderBy(asc(crmAgents.createdAt)),
      ]);
      return reply.send({
        success: true,
        data: { company, license, usage, agents },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST create new company tenant + admin user + initial license (Platform Superadmin)
  fastify.post<{
    Body: {
      name: string;
      ownerName: string;
      ownerEmail: string;
      ownerPassword: string;
      ownerPhone?: string;
      planSlug?: string;
      months?: number;
      trialDays?: number;
    };
  }>('/', { preHandler: requirePlatformAdmin }, async (req, reply) => {
    try {
      const name = String(req.body?.name || '').trim();
      const ownerName = String(req.body?.ownerName || '').trim();
      const ownerEmail = String(req.body?.ownerEmail || '').trim().toLowerCase();
      const ownerPassword = String(req.body?.ownerPassword || '');
      const ownerPhone = req.body?.ownerPhone ? String(req.body.ownerPhone).trim() : null;

      if (!name || !ownerName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) || ownerPassword.length < 6) {
        return reply.status(400).send({
          success: false,
          error: 'Nama perusahaan, nama pemilik, email valid, dan password min. 6 karakter wajib diisi.',
        });
      }

      const [dup] = await db
        .select({ id: crmAgents.id })
        .from(crmAgents)
        .where(eq(crmAgents.email, ownerEmail))
        .limit(1);
      if (dup) {
        return reply.status(409).send({
          success: false,
          error: 'Email pemilik sudah terdaftar di sistem.',
        });
      }

      const now = new Date();
      const companyId = `cmp_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const slug = await generateUniqueCompanySlug(name);

      await db.insert(companies).values({
        id: companyId,
        name,
        slug,
        ownerName,
        ownerEmail,
        ownerPhone,
        status: 'ACTIVE',
        isDefault: false,
        licenseStatus: 'UNLICENSED',
        licensePlan: 'Belum Diaktivasi',
        licensePeriod: 'monthly',
        licensePriceAmount: 0,
        trialUsed: false,
        createdAt: now,
        updatedAt: now,
      });

      await ensureDefaultRolesSeeded(companyId);
      await seedCompanyDefaults(companyId);

      await db.insert(crmAgents).values({
        id: crypto.randomUUID(),
        companyId,
        name: ownerName,
        email: ownerEmail,
        passwordHash: hashPassword(ownerPassword),
        role: 'ADMIN',
        isPlatformAdmin: false,
        roleId: getCompanyAdminRoleId(companyId),
        permissions: JSON.stringify([...ALL_PERMISSIONS]),
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      const planSlug = String(req.body?.planSlug || '').trim();
      const months = Number(req.body?.months || 0);
      const trialDays = Number(req.body?.trialDays || 0);
      if (planSlug && months > 0) {
        await licenseService.assignCompanyPlan(companyId, {
          planSlug,
          months,
          status: 'ACTIVE',
        });
      } else if (trialDays > 0) {
        await licenseService.assignCompanyPlan(companyId, {
          planSlug: planSlug || 'pro-monthly',
          days: trialDays,
          status: 'TRIAL',
        });
      }

      const [created] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
      const license = await licenseService.getLicense(companyId, true);
      liveEvents.emit('tenants:update', { action: 'create', id: companyId });

      return reply.status(201).send({
        success: true,
        message: `Perusahaan "${name}" berhasil dibuat.`,
        data: { company: created, license },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // PATCH update tenant profile/status
  fastify.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      ownerName?: string;
      ownerEmail?: string;
      ownerPhone?: string;
      status?: 'ACTIVE' | 'SUSPENDED';
    };
  }>('/:id', { preHandler: requirePlatformAdmin }, async (req, reply) => {
    try {
      const { id } = req.params;
      const [existing] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Perusahaan tidak ditemukan' });
      }
      if (id === DEFAULT_COMPANY_ID && req.body?.status === 'SUSPENDED') {
        return reply.status(400).send({
          success: false,
          error: 'Workspace utama platform tidak dapat disuspend.',
        });
      }

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (typeof req.body?.name === 'string' && req.body.name.trim()) updates.name = req.body.name.trim();
      if (typeof req.body?.ownerName === 'string') updates.ownerName = req.body.ownerName.trim() || null;
      if (typeof req.body?.ownerEmail === 'string') updates.ownerEmail = req.body.ownerEmail.trim() || null;
      if (typeof req.body?.ownerPhone === 'string') updates.ownerPhone = req.body.ownerPhone.trim() || null;
      if (req.body?.status === 'ACTIVE' || req.body?.status === 'SUSPENDED') {
        updates.status = req.body.status;
      }

      const [updated] = await db
        .update(companies)
        .set(updates)
        .where(eq(companies.id, id))
        .returning();

      licenseService.invalidateCache(id);
      const license = await licenseService.getLicense(id, true);
      liveEvents.emitForCompany(id, 'license:update', { action: 'tenant_update' });
      liveEvents.emit('tenants:update', { action: 'update', id });

      return reply.send({ success: true, data: { company: updated, license } });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // PATCH company status shortcut
  fastify.patch<{
    Params: { id: string };
    Body: { status: 'ACTIVE' | 'SUSPENDED' };
  }>('/:id/status', { preHandler: requirePlatformAdmin }, async (req, reply) => {
    try {
      const { id } = req.params;
      const status = req.body?.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
      if (id === DEFAULT_COMPANY_ID && status === 'SUSPENDED') {
        return reply.status(400).send({
          success: false,
          error: 'Workspace utama platform tidak dapat disuspend.',
        });
      }
      const [updated] = await db
        .update(companies)
        .set({ status, updatedAt: new Date() })
        .where(eq(companies.id, id))
        .returning();
      if (!updated) {
        return reply.status(404).send({ success: false, error: 'Perusahaan tidak ditemukan' });
      }
      licenseService.invalidateCache(id);
      liveEvents.emitForCompany(id, 'license:update', { action: 'status', status });
      liveEvents.emit('tenants:update', { action: 'status', id, status });
      return reply.send({ success: true, data: updated });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // PATCH company license assignment/extension/override (Platform Superadmin)
  fastify.patch<{
    Params: { id: string };
    Body: {
      planSlug?: string;
      planName?: string;
      status?: 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'SUSPENDED' | 'UNLICENSED';
      months?: number;
      days?: number;
      expiresAt?: string;
      licenseKey?: string;
      priceAmount?: number;
      features?: Record<string, any>;
    };
  }>('/:id/license', { preHandler: requirePlatformAdmin }, async (req, reply) => {
    try {
      const { id } = req.params;
      const license = await licenseService.assignCompanyPlan(id, req.body || {});
      liveEvents.emitForCompany(id, 'license:update', { action: 'assign_plan' });
      liveEvents.emit('tenants:update', { action: 'license', id });
      return reply.send({
        success: true,
        message: `Lisensi perusahaan berhasil diperbarui (${license.plan}).`,
        data: license,
      });
    } catch (error: any) {
      return reply.status(error?.statusCode || 500).send({ success: false, error: error.message });
    }
  });

  // DELETE non-default company tenant (Platform Superadmin)
  fastify.delete<{
    Params: { id: string };
  }>('/:id', { preHandler: requirePlatformAdmin }, async (req, reply) => {
    try {
      const { id } = req.params;
      if (id === DEFAULT_COMPANY_ID) {
        return reply.status(400).send({
          success: false,
          error: 'Workspace utama platform tidak dapat dihapus.',
        });
      }
      const [deleted] = await db.delete(companies).where(eq(companies.id, id)).returning();
      if (!deleted) {
        return reply.status(404).send({ success: false, error: 'Perusahaan tidak ditemukan' });
      }
      licenseService.invalidateCache(id);
      liveEvents.emit('tenants:update', { action: 'delete', id });
      return reply.send({
        success: true,
        message: `Perusahaan "${deleted.name}" beserta seluruh datanya telah dihapus.`,
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
