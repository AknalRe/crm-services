import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, asc } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '../db';
import { crmAgents, crmRoles } from '../db/schema';
import { licenseService } from '../services/license.service';
import {
  ALL_PERMISSIONS,
  ensureDefaultRolesSeeded,
  getCurrentAuthUser,
  hashPassword,
  parseAgentPermissions,
  PERMISSION_CATALOG,
} from './auth';

function formatRoleRow(r: typeof crmRoles.$inferSelect, agentCount = 0) {
  return {
    id: r.id,
    name: r.name,
    description: r.description || '',
    permissions: parseAgentPermissions(r.permissions, r.id === 'role_admin' ? 'ADMIN' : 'AGENT', true),
    isSystem: Boolean(r.isSystem),
    agentCount,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export default async function agentsRouter(fastify: FastifyInstance) {
  // Require ADMIN role or explicit `settings.agents` capability
  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await getCurrentAuthUser(req);
    if (!user) {
      return reply.status(401).send({ success: false, error: 'Sesi login tidak valid' });
    }
    if (user.role !== 'ADMIN' && !user.permissions.includes('settings.agents')) {
      return reply.status(403).send({
        success: false,
        error: 'Hanya Admin atau role dengan izin Tim & Hak Akses yang dapat mengelola akun & role CS.',
      });
    }
  });

  // GET all agents + roles + permission catalog + license quota
  fastify.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      await ensureDefaultRolesSeeded();
      const [rows, roleRows, lic] = await Promise.all([
        db.select().from(crmAgents).orderBy(asc(crmAgents.createdAt)),
        db.select().from(crmRoles).orderBy(asc(crmRoles.createdAt)),
        licenseService.getLicense(),
      ]);

      const roleMap = new Map(roleRows.map((r) => [r.id, r]));
      const roleUsageCount = new Map<string, number>();

      const agents = rows.map((a) => {
        const effectiveRoleId = a.roleId || (a.role === 'ADMIN' ? 'role_admin' : null);
        if (effectiveRoleId) {
          roleUsageCount.set(effectiveRoleId, (roleUsageCount.get(effectiveRoleId) || 0) + 1);
        }
        const matchedRole = effectiveRoleId ? roleMap.get(effectiveRoleId) : undefined;
        const role: 'ADMIN' | 'AGENT' =
          a.role === 'ADMIN' || matchedRole?.id === 'role_admin' ? 'ADMIN' : 'AGENT';
        return {
          id: a.id,
          name: a.name,
          email: a.email,
          role,
          roleId: matchedRole?.id || effectiveRoleId,
          roleName: matchedRole?.name || (role === 'ADMIN' ? 'Administrator' : 'Kustom Per Akun'),
          permissions: parseAgentPermissions(
            matchedRole ? matchedRole.permissions : a.permissions,
            role,
            Boolean(matchedRole)
          ),
          isActive: a.isActive,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        };
      });

      const roles = roleRows.map((r) => formatRoleRow(r, roleUsageCount.get(r.id) || 0));

      return reply.send({
        success: true,
        data: {
          agents,
          roles,
          permissionCatalog: PERMISSION_CATALOG,
          quota: {
            multiAgent: Boolean(lic.features.multiAgent) && !lic.isExpired,
            maxAgents: lic.isExpired ? 0 : lic.features.maxAgents || 1,
            currentCount: agents.length,
            plan: lic.plan,
          },
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // Roles CRUD endpoints
  fastify.get('/roles', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      await ensureDefaultRolesSeeded();
      const [roleRows, agentRows] = await Promise.all([
        db.select().from(crmRoles).orderBy(asc(crmRoles.createdAt)),
        db.select({ roleId: crmAgents.roleId, role: crmAgents.role }).from(crmAgents),
      ]);
      const counts = new Map<string, number>();
      for (const a of agentRows) {
        const key = a.roleId || (a.role === 'ADMIN' ? 'role_admin' : '');
        if (key) counts.set(key, (counts.get(key) || 0) + 1);
      }
      return reply.send({
        success: true,
        data: {
          roles: roleRows.map((r) => formatRoleRow(r, counts.get(r.id) || 0)),
          permissionCatalog: PERMISSION_CATALOG,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post('/roles', async (req: FastifyRequest<{
    Body: { name?: string; description?: string; permissions?: string[] };
  }>, reply: FastifyReply) => {
    try {
      await ensureDefaultRolesSeeded();
      const currentUser = await getCurrentAuthUser(req);
      const name = String(req.body?.name || '').trim();
      const description = req.body?.description ? String(req.body.description).trim() : null;
      if (!name) {
        return reply.status(400).send({ success: false, error: 'Nama role wajib diisi.' });
      }
      const existing = await db.select().from(crmRoles);
      if (existing.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
        return reply.status(409).send({ success: false, error: 'Nama role sudah digunakan.' });
      }

      const rawPerms = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
      const cleanPerms = rawPerms.filter((p) => {
        if (!(ALL_PERMISSIONS as readonly string[]).includes(p)) return false;
        if (currentUser?.role !== 'ADMIN' && (p === 'settings.agents' || p === 'settings.edit')) {
          return currentUser?.permissions.includes(p as any) ?? false;
        }
        return true;
      });
      if (cleanPerms.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'Pilih minimal 1 hak akses/menu untuk role ini.',
        });
      }

      const now = new Date();
      const [inserted] = await db
        .insert(crmRoles)
        .values({
          id: `role_${crypto.randomUUID().slice(0, 8)}`,
          name,
          description,
          permissions: JSON.stringify(cleanPerms),
          isSystem: false,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return reply.status(201).send({ success: true, data: formatRoleRow(inserted, 0) });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.patch<{
    Params: { roleId: string };
    Body: { name?: string; description?: string | null; permissions?: string[] };
  }>('/roles/:roleId', async (req, reply) => {
    try {
      await ensureDefaultRolesSeeded();
      const currentUser = await getCurrentAuthUser(req);
      const [target] = await db
        .select()
        .from(crmRoles)
        .where(eq(crmRoles.id, req.params.roleId))
        .limit(1);
      if (!target) {
        return reply.status(404).send({ success: false, error: 'Role tidak ditemukan' });
      }
      if (target.id === 'role_admin') {
        return reply.status(400).send({
          success: false,
          error: 'Role bawaan Administrator selalu memiliki akses penuh dan tidak dapat dibatasi.',
        });
      }

      const updateData: any = { updatedAt: new Date() };
      if (req.body?.name !== undefined) {
        const cleanName = req.body.name.trim();
        if (!cleanName) {
          return reply.status(400).send({ success: false, error: 'Nama role tidak boleh kosong.' });
        }
        const allRoles = await db.select().from(crmRoles);
        if (allRoles.some((r) => r.id !== target.id && r.name.toLowerCase() === cleanName.toLowerCase())) {
          return reply.status(409).send({ success: false, error: 'Nama role sudah digunakan.' });
        }
        updateData.name = cleanName;
      }
      if (req.body?.description !== undefined) {
        updateData.description = req.body.description ? req.body.description.trim() : null;
      }
      if (Array.isArray(req.body?.permissions)) {
        const cleanPerms = req.body.permissions.filter((p) => {
          if (!(ALL_PERMISSIONS as readonly string[]).includes(p)) return false;
          if (currentUser?.role !== 'ADMIN' && (p === 'settings.agents' || p === 'settings.edit')) {
            return currentUser?.permissions.includes(p as any) ?? false;
          }
          return true;
        });
        if (cleanPerms.length === 0) {
          return reply.status(400).send({
            success: false,
            error: 'Minimal harus ada 1 izin aktif pada role.',
          });
        }
        updateData.permissions = JSON.stringify(cleanPerms);
      }

      const [updated] = await db
        .update(crmRoles)
        .set(updateData)
        .where(eq(crmRoles.id, target.id))
        .returning();

      if (updateData.permissions) {
        await db
          .update(crmAgents)
          .set({ permissions: updateData.permissions, updatedAt: new Date() })
          .where(eq(crmAgents.roleId, target.id));
      }

      const assigned = await db
        .select({ id: crmAgents.id })
        .from(crmAgents)
        .where(eq(crmAgents.roleId, target.id));
      return reply.send({ success: true, data: formatRoleRow(updated, assigned.length) });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.delete<{ Params: { roleId: string } }>('/roles/:roleId', async (req, reply) => {
    try {
      await ensureDefaultRolesSeeded();
      const [target] = await db
        .select()
        .from(crmRoles)
        .where(eq(crmRoles.id, req.params.roleId))
        .limit(1);
      if (!target) {
        return reply.status(404).send({ success: false, error: 'Role tidak ditemukan' });
      }
      if (target.isSystem) {
        return reply.status(400).send({
          success: false,
          error: 'Role standar sistem tidak dapat dihapus, namun izinnya (selain Administrator) dapat disesuaikan.',
        });
      }
      const inUse = await db
        .select({ id: crmAgents.id })
        .from(crmAgents)
        .where(eq(crmAgents.roleId, target.id));
      if (inUse.length > 0) {
        return reply.status(400).send({
          success: false,
          error: `Role "${target.name}" masih digunakan oleh ${inUse.length} akun CS. Pindahkan akun tersebut ke role lain terlebih dahulu.`,
        });
      }
      await db.delete(crmRoles).where(eq(crmRoles.id, target.id));
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST create new agent (enforces multiAgent & maxAgents license quota)
  fastify.post('/', async (req: FastifyRequest<{
    Body: {
      name: string;
      email: string;
      password: string;
      role?: 'ADMIN' | 'AGENT';
      roleId?: string | null;
      permissions?: string[];
    };
  }>, reply: FastifyReply) => {
    try {
      await ensureDefaultRolesSeeded();
      const currentUser = await getCurrentAuthUser(req);
      const lic = await licenseService.assertLicenseActive();
      const existing = await db.select().from(crmAgents);

      if (!lic.features.multiAgent) {
        return reply.status(403).send({
          success: false,
          code: 'FEATURE_LOCKED',
          feature: 'multiAgent',
          error: `Fitur Multi-Agent terkunci pada paket "${lic.plan}". Upgrade ke Pro Bulanan atau Enterprise untuk menambah akun agent.`,
        });
      }

      const maxAgents = lic.features.maxAgents || 1;
      if (existing.length >= maxAgents) {
        return reply.status(403).send({
          success: false,
          code: 'QUOTA_EXCEEDED',
          feature: 'multiAgent',
          error: `Batas maksimal ${maxAgents} akun agent untuk paket "${lic.plan}" telah tercapai.`,
        });
      }

      const name = String(req.body?.name || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');

      let resolvedRoleId: string | null = req.body?.roleId ? String(req.body.roleId).trim() || null : null;
      let matchedRole: typeof crmRoles.$inferSelect | undefined;
      if (resolvedRoleId) {
        const rRows = await db.select().from(crmRoles).where(eq(crmRoles.id, resolvedRoleId)).limit(1);
        matchedRole = rRows[0];
        if (!matchedRole) {
          return reply.status(400).send({ success: false, error: 'Role yang dipilih tidak ditemukan.' });
        }
      }

      const role: 'ADMIN' | 'AGENT' =
        req.body?.role === 'ADMIN' || matchedRole?.id === 'role_admin' ? 'ADMIN' : 'AGENT';

      if (role === 'ADMIN' && currentUser?.role !== 'ADMIN') {
        return reply.status(403).send({
          success: false,
          error: 'Hanya Administrator penuh yang dapat membuat akun Administrator baru.',
        });
      }
      if (role === 'ADMIN' && !resolvedRoleId) {
        resolvedRoleId = 'role_admin';
      }

      if (!name || !email || password.length < 6) {
        return reply.status(400).send({
          success: false,
          error: 'Nama, email, dan password (minimal 6 karakter) wajib diisi.',
        });
      }

      const dup = existing.find((a) => a.email.toLowerCase() === email);
      if (dup) {
        return reply.status(409).send({ success: false, error: 'Email sudah terdaftar.' });
      }

      const cleanPerms =
        role === 'ADMIN'
          ? [...ALL_PERMISSIONS]
          : matchedRole
          ? parseAgentPermissions(matchedRole.permissions, 'AGENT', true)
          : Array.isArray(req.body?.permissions)
          ? parseAgentPermissions(
              JSON.stringify(req.body.permissions),
              'AGENT',
              true
            )
          : ['dashboard', 'conversations', 'conversations.reply', 'conversations.manage', 'contacts'];

      const now = new Date();
      const inserted = await db
        .insert(crmAgents)
        .values({
          id: crypto.randomUUID(),
          name,
          email,
          passwordHash: hashPassword(password),
          role,
          roleId: resolvedRoleId,
          permissions: JSON.stringify(cleanPerms),
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const created = inserted[0];
      return reply.status(201).send({
        success: true,
        data: {
          id: created.id,
          name: created.name,
          email: created.email,
          role,
          roleId: created.roleId,
          roleName: matchedRole?.name || (role === 'ADMIN' ? 'Administrator' : 'Kustom Per Akun'),
          permissions: cleanPerms,
          isActive: created.isActive,
          createdAt: created.createdAt,
        },
      });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  });

  // PATCH update agent (role, roleId, permissions, isActive, name, email, password)
  fastify.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      email?: string;
      role?: 'ADMIN' | 'AGENT';
      roleId?: string | null;
      permissions?: string[];
      isActive?: boolean;
      password?: string;
    };
  }>('/:id', async (req, reply) => {
    try {
      await ensureDefaultRolesSeeded();
      const rows = await db.select().from(crmAgents).where(eq(crmAgents.id, req.params.id));
      const target = rows[0];
      if (!target) {
        return reply.status(404).send({ success: false, error: 'Agent tidak ditemukan' });
      }

      const currentUser = await getCurrentAuthUser(req);
      if (target.role === 'ADMIN' && currentUser?.role !== 'ADMIN') {
        return reply.status(403).send({
          success: false,
          error: 'Hanya Administrator penuh yang dapat mengubah akun Administrator.',
        });
      }
      if (currentUser?.id === target.id && req.body?.isActive === false) {
        return reply.status(400).send({ success: false, error: 'Tidak dapat menonaktifkan akun sendiri.' });
      }

      let resolvedRoleId: string | null | undefined =
        req.body?.roleId !== undefined
          ? (req.body.roleId ? String(req.body.roleId).trim() || null : null)
          : undefined;
      let matchedRole: typeof crmRoles.$inferSelect | undefined;
      if (resolvedRoleId) {
        const rRows = await db.select().from(crmRoles).where(eq(crmRoles.id, resolvedRoleId)).limit(1);
        matchedRole = rRows[0];
        if (!matchedRole) {
          return reply.status(400).send({ success: false, error: 'Role yang dipilih tidak ditemukan.' });
        }
      }

      const nextRole: 'ADMIN' | 'AGENT' =
        req.body?.role === 'ADMIN' || matchedRole?.id === 'role_admin'
          ? 'ADMIN'
          : req.body?.role === 'AGENT' || (resolvedRoleId !== undefined && resolvedRoleId !== 'role_admin')
          ? 'AGENT'
          : target.role === 'ADMIN'
          ? 'ADMIN'
          : 'AGENT';

      if (nextRole === 'ADMIN' && currentUser?.role !== 'ADMIN') {
        return reply.status(403).send({
          success: false,
          error: 'Hanya Administrator penuh yang dapat menetapkan peran Administrator.',
        });
      }

      if (currentUser?.id === target.id && target.role === 'ADMIN' && nextRole !== 'ADMIN') {
        return reply.status(400).send({
          success: false,
          error: 'Tidak dapat menurunkan peran akun Admin yang sedang digunakan.',
        });
      }

      const willRemainActiveAdmin =
        nextRole === 'ADMIN' && (req.body?.isActive !== undefined ? Boolean(req.body.isActive) : target.isActive);
      if (target.role === 'ADMIN' && !willRemainActiveAdmin) {
        const all = await db.select().from(crmAgents);
        const otherAdmins = all.filter((a) => a.id !== target.id && a.role === 'ADMIN' && a.isActive);
        if (otherAdmins.length === 0) {
          return reply.status(400).send({
            success: false,
            error: 'Minimal harus ada 1 akun Admin aktif.',
          });
        }
      }

      if (req.body?.password !== undefined && req.body.password !== '' && req.body.password.length < 6) {
        return reply.status(400).send({
          success: false,
          error: 'Password baru minimal harus 6 karakter.',
        });
      }

      const updateData: any = {
        role: nextRole,
        updatedAt: new Date(),
      };
      if (nextRole === 'ADMIN') {
        updateData.roleId = 'role_admin';
        updateData.permissions = JSON.stringify([...ALL_PERMISSIONS]);
      } else {
        if (resolvedRoleId !== undefined) {
          updateData.roleId = resolvedRoleId;
        }
        if (matchedRole) {
          updateData.permissions = matchedRole.permissions;
        } else if (Array.isArray(req.body?.permissions)) {
          const cleanPerms = parseAgentPermissions(
            JSON.stringify(req.body.permissions),
            'AGENT',
            true
          );
          updateData.permissions = JSON.stringify(cleanPerms);
          if (resolvedRoleId === undefined) {
            updateData.roleId = null;
          }
        }
      }

      if (req.body?.name !== undefined) {
        const cleanName = req.body.name.trim();
        if (!cleanName) {
          return reply.status(400).send({ success: false, error: 'Nama agent tidak boleh kosong.' });
        }
        updateData.name = cleanName;
      }
      if (req.body?.email !== undefined) {
        const cleanEmail = req.body.email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
          return reply.status(400).send({ success: false, error: 'Format email tidak valid.' });
        }
        if (cleanEmail !== target.email.toLowerCase()) {
          const dupRows = await db.select().from(crmAgents).where(eq(crmAgents.email, cleanEmail));
          if (dupRows.some((r) => r.id !== target.id)) {
            return reply.status(409).send({ success: false, error: 'Email sudah digunakan oleh agent lain.' });
          }
          updateData.email = cleanEmail;
        }
      }
      if (req.body?.isActive !== undefined) updateData.isActive = Boolean(req.body.isActive);
      if (req.body?.password && req.body.password.length >= 6) {
        updateData.passwordHash = hashPassword(req.body.password);
      }

      const updated = await db
        .update(crmAgents)
        .set(updateData)
        .where(eq(crmAgents.id, target.id))
        .returning();

      const u = updated[0];
      return reply.send({
        success: true,
        data: {
          id: u.id,
          name: u.name,
          email: u.email,
          role: nextRole,
          roleId: u.roleId,
          roleName: matchedRole?.name || (nextRole === 'ADMIN' ? 'Administrator' : 'Kustom Per Akun'),
          permissions: parseAgentPermissions(u.permissions, nextRole, true),
          isActive: u.isActive,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // DELETE agent
  fastify.delete('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const currentUser = await getCurrentAuthUser(req);
      if (currentUser?.id === req.params.id) {
        return reply.status(400).send({ success: false, error: 'Tidak dapat menghapus akun yang sedang login.' });
      }

      const rows = await db.select().from(crmAgents).where(eq(crmAgents.id, req.params.id));
      const target = rows[0];
      if (!target) {
        return reply.status(404).send({ success: false, error: 'Agent tidak ditemukan' });
      }

      if (target.role === 'ADMIN' && currentUser?.role !== 'ADMIN') {
        return reply.status(403).send({
          success: false,
          error: 'Hanya Administrator penuh yang dapat menghapus akun Administrator.',
        });
      }

      if (target.role === 'ADMIN') {
        const all = await db.select().from(crmAgents);
        const otherAdmins = all.filter((a) => a.id !== target.id && a.role === 'ADMIN' && a.isActive);
        if (otherAdmins.length === 0) {
          return reply.status(400).send({ success: false, error: 'Minimal harus ada 1 akun Admin aktif.' });
        }
      }

      await db.delete(crmAgents).where(eq(crmAgents.id, target.id));
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
