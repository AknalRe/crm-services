import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, asc } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '../db';
import { crmAgents } from '../db/schema';
import { licenseService } from '../services/license.service';
import {
  ALL_PERMISSIONS,
  getCurrentAuthUser,
  hashPassword,
  parseAgentPermissions,
} from './auth';

export default async function agentsRouter(fastify: FastifyInstance) {
  // Require ADMIN role for managing agents
  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await getCurrentAuthUser(req);
    if (!user) {
      return reply.status(401).send({ success: false, error: 'Sesi login tidak valid' });
    }
    if (user.role !== 'ADMIN') {
      return reply.status(403).send({
        success: false,
        error: 'Hanya Admin yang dapat mengelola akun & hak akses agent.',
      });
    }
  });

  // GET all agents + license quota
  fastify.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const [rows, lic] = await Promise.all([
        db.select().from(crmAgents).orderBy(asc(crmAgents.createdAt)),
        licenseService.getLicense(),
      ]);

      const agents = rows.map((a) => {
        const role: 'ADMIN' | 'AGENT' = a.role === 'ADMIN' ? 'ADMIN' : 'AGENT';
        return {
          id: a.id,
          name: a.name,
          email: a.email,
          role,
          permissions: parseAgentPermissions(a.permissions, role),
          isActive: a.isActive,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        };
      });

      return reply.send({
        success: true,
        data: {
          agents,
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

  // POST create new agent (enforces multiAgent & maxAgents license quota)
  fastify.post('/', async (req: FastifyRequest<{
    Body: {
      name: string;
      email: string;
      password: string;
      role?: 'ADMIN' | 'AGENT';
      permissions?: string[];
    };
  }>, reply: FastifyReply) => {
    try {
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
      const role: 'ADMIN' | 'AGENT' = req.body?.role === 'ADMIN' ? 'ADMIN' : 'AGENT';

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
          : Array.isArray(req.body?.permissions)
          ? req.body.permissions.filter((p) => (ALL_PERMISSIONS as readonly string[]).includes(p))
          : ['dashboard', 'conversations', 'contacts'];

      const now = new Date();
      const inserted = await db
        .insert(crmAgents)
        .values({
          id: crypto.randomUUID(),
          name,
          email,
          passwordHash: hashPassword(password),
          role,
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
          permissions: cleanPerms,
          isActive: created.isActive,
          createdAt: created.createdAt,
        },
      });
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
    }
  });

  // PATCH update agent (role, permissions, isActive, name, password)
  fastify.patch('/:id', async (req: FastifyRequest<{
    Params: { id: string };
    Body: {
      name?: string;
      role?: 'ADMIN' | 'AGENT';
      permissions?: string[];
      isActive?: boolean;
      password?: string;
    };
  }>, reply: FastifyReply) => {
    try {
      const rows = await db.select().from(crmAgents).where(eq(crmAgents.id, req.params.id));
      const target = rows[0];
      if (!target) {
        return reply.status(404).send({ success: false, error: 'Agent tidak ditemukan' });
      }

      const currentUser = await getCurrentAuthUser(req);
      if (currentUser?.id === target.id && req.body?.isActive === false) {
        return reply.status(400).send({ success: false, error: 'Tidak dapat menonaktifkan akun sendiri.' });
      }

      const nextRole: 'ADMIN' | 'AGENT' =
        req.body?.role === 'ADMIN' ? 'ADMIN' : req.body?.role === 'AGENT' ? 'AGENT' : target.role === 'ADMIN' ? 'ADMIN' : 'AGENT';
      const updateData: any = {
        role: nextRole,
        updatedAt: new Date(),
      };
      if (req.body?.name && req.body.name.trim()) updateData.name = req.body.name.trim();
      if (req.body?.isActive !== undefined) updateData.isActive = Boolean(req.body.isActive);
      if (req.body?.password && req.body.password.length >= 6) {
        updateData.passwordHash = hashPassword(req.body.password);
      }
      if (nextRole === 'ADMIN') {
        updateData.permissions = JSON.stringify([...ALL_PERMISSIONS]);
      } else if (Array.isArray(req.body?.permissions)) {
        const cleanPerms = req.body.permissions.filter((p) =>
          (ALL_PERMISSIONS as readonly string[]).includes(p)
        );
        updateData.permissions = JSON.stringify(cleanPerms);
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
          permissions: parseAgentPermissions(u.permissions, nextRole),
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
