import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { and, eq, ne, or, ilike, desc, sql, isNull, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  contacts,
  contactIdentities,
  conversations,
  chatMessages,
  csatResponses,
  campaignRecipients,
} from '../db/schema';
import { normalizePhoneNumber } from '../services/phone.utils';
import { licenseService } from '../services/license.service';
import { liveEvents } from '../services/events.service';
import { wahaService } from '../services/waha.service';
import { getRequestCompanyId, requirePermission } from './auth';
import crypto from 'crypto';

export function formatContact(c: any) {
  if (!c) return null;
  return {
    id: c.id,
    nama_lengkap: c.namaLengkap,
    nama_panggilan: c.namaPanggilan,
    tanggal_lahir: c.tanggalLahir,
    nomor_whatsapp: c.nomorWhatsapp,
    alamat: c.alamat,
    kategori: c.kategori || null,
    tags: c.tags,
    notes: c.notes,
    exclude_from_metrics: Boolean(c.excludeFromMetrics),
    exclude_reason: c.excludeReason || null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export default async function contactsRouter(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (req, reply) => {
    const path = (req.routeOptions?.url || req.url || '').toLowerCase();
    if (req.method === 'GET') {
      return requirePermission('contacts', 'conversations', 'broadcasts')(req, reply);
    }
    if (req.method === 'DELETE') {
      return requirePermission('contacts.delete')(req, reply);
    }
    if (req.method === 'PUT' || path.includes('/merge')) {
      return requirePermission('contacts.edit')(req, reply);
    }
    return requirePermission('contacts.create')(req, reply);
  });

  // GET all contacts with search and filter
  fastify.get('/', async (req: FastifyRequest<{
    Querystring: {
      search?: string;
      tag?: string;
      kategori?: string;
      excludeFromMetrics?: string;
      idsOnly?: string;
      page?: string;
      limit?: string;
    };
  }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const {
        search,
        tag,
        kategori,
        excludeFromMetrics,
        idsOnly,
        page = '1',
        limit = '50',
      } = req.query;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, Math.min(10000, parseInt(limit, 10) || 50));
      const offset = (pageNum - 1) * limitNum;

      const conditions: any[] = [eq(contacts.companyId, companyId)];
      if (search && search.trim()) {
        const s = `%${search.trim()}%`;
        conditions.push(
          or(
            ilike(contacts.namaLengkap, s),
            ilike(contacts.namaPanggilan, s),
            ilike(contacts.nomorWhatsapp, s),
            ilike(contacts.alamat, s),
            ilike(contacts.kategori, s),
            ilike(contacts.tags, s)
          )
        );
      }

      if (tag && tag !== 'ALL') {
        conditions.push(ilike(contacts.tags, `%${tag}%`));
      }

      if (kategori && kategori !== 'ALL') {
        if (kategori === 'UNGROUPED') {
          conditions.push(or(isNull(contacts.kategori), eq(contacts.kategori, '')));
        } else {
          conditions.push(eq(contacts.kategori, kategori));
        }
      }

      const metricFilter = String(excludeFromMetrics || '').toUpperCase().trim();
      if (metricFilter === 'EXCLUDED') {
        conditions.push(eq(contacts.excludeFromMetrics, true));
      } else if (metricFilter === 'ASSESSED') {
        conditions.push(or(eq(contacts.excludeFromMetrics, false), isNull(contacts.excludeFromMetrics)));
      }

      const whereClause = and(...conditions);

      if (idsOnly === '1' || idsOnly === 'true') {
        const idRows = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(whereClause)
          .orderBy(desc(contacts.createdAt));
        return reply.send({
          success: true,
          data: idRows.map((r) => r.id),
        });
      }

      const [allContacts, totalResult, totalAllResult] = await Promise.all([
        db
          .select()
          .from(contacts)
          .where(whereClause)
          .orderBy(desc(contacts.createdAt))
          .limit(limitNum)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)` })
          .from(contacts)
          .where(whereClause),
        db
          .select({ count: sql<number>`count(*)` })
          .from(contacts)
          .where(eq(contacts.companyId, companyId)),
      ]);

      const total = Number(totalResult[0]?.count || 0);
      const totalAll = Number(totalAllResult[0]?.count || 0);

      const contactIds = allContacts.map((c) => c.id);
      const identitiesMap = new Map<string, any[]>();
      if (contactIds.length > 0) {
        const idRows = await db
          .select()
          .from(contactIdentities)
          .where(and(eq(contactIdentities.companyId, companyId), inArray(contactIdentities.contactId, contactIds)));
        for (const idRow of idRows) {
          const list = identitiesMap.get(idRow.contactId) || [];
          list.push({
            id: idRow.id,
            channel: idRow.channel,
            externalId: idRow.externalId,
            handle: idRow.handle,
          });
          identitiesMap.set(idRow.contactId, list);
        }
      }

      return reply.send({
        success: true,
        data: allContacts.map((c) => ({
          ...formatContact(c),
          identities: identitiesMap.get(c.id) || [],
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.max(1, Math.ceil(total / limitNum)),
          totalAll,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET single contact
  fastify.get('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const list = await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, req.params.id), eq(contacts.companyId, companyId)));
      if (list.length === 0) {
        return reply.status(404).send({ success: false, error: 'Kontak tidak ditemukan' });
      }
      return reply.send({ success: true, data: formatContact(list[0]) });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST create contact
  fastify.post('/', async (req: FastifyRequest<{
    Body: {
      nama_lengkap: string;
      nama_panggilan?: string;
      tanggal_lahir?: string;
      nomor_whatsapp?: string;
      alamat?: string;
      kategori?: string;
      tags?: string | string[];
      notes?: string;
      exclude_from_metrics?: boolean;
      exclude_reason?: string | null;
      identities?: Array<{ channel: string; externalId: string; handle?: string }>;
    };
  }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const {
        nama_lengkap,
        nama_panggilan,
        tanggal_lahir,
        nomor_whatsapp,
        alamat,
        kategori,
        tags,
        notes,
        exclude_from_metrics,
        exclude_reason,
        identities,
      } = req.body;

      const validIdentities = Array.isArray(identities)
        ? identities
            .map((idItem) => ({
              channel: String(idItem?.channel || '').trim().toUpperCase(),
              externalId: String(idItem?.externalId || '').trim(),
              handle: idItem?.handle ? String(idItem.handle).trim() : null,
            }))
            .filter((x) => x.channel && x.externalId)
        : [];

      const rawWa = String(nomor_whatsapp || '').trim();
      if (!nama_lengkap?.trim()) {
        return reply.status(400).send({
          success: false,
          error: 'Nama lengkap wajib diisi',
        });
      }
      if (!rawWa && validIdentities.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'Isi minimal Nomor WhatsApp atau satu Identitas Kanal (Telegram/IG/FB/Threads)',
        });
      }

      const normalizedPhone = rawWa ? normalizePhoneNumber(rawWa) : null;

      // Enforce contact quota from active license
      await licenseService.assertQuota('contacts', 1, companyId);

      // Check if phone already exists within this tenant
      if (normalizedPhone) {
        const existing = await db
          .select()
          .from(contacts)
          .where(and(eq(contacts.companyId, companyId), eq(contacts.nomorWhatsapp, normalizedPhone)));

        if (existing.length > 0) {
          return reply.status(400).send({
            success: false,
            error: 'Nomor WhatsApp sudah terdaftar untuk kontak lain',
          });
        }
      }

      const now = new Date();
      const contactId = crypto.randomUUID();
      const newContact = await db
        .insert(contacts)
        .values({
          id: contactId,
          companyId,
          namaLengkap: nama_lengkap.trim(),
          namaPanggilan: nama_panggilan || null,
          tanggalLahir: tanggal_lahir ? new Date(tanggal_lahir) : null,
          nomorWhatsapp: normalizedPhone,
          alamat: alamat || null,
          kategori: kategori?.trim() || null,
          tags: Array.isArray(tags) ? tags.join(',') : tags || null,
          notes: notes || null,
          excludeFromMetrics: Boolean(exclude_from_metrics),
          excludeReason: exclude_from_metrics
            ? (exclude_reason ? String(exclude_reason).trim() || 'Bukan Customer' : 'Bukan Customer')
            : null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      for (const idItem of validIdentities) {
        await db.insert(contactIdentities).values({
          id: crypto.randomUUID(),
          companyId,
          contactId,
          channel: idItem.channel,
          externalId: idItem.externalId,
          handle: idItem.handle,
          createdAt: now,
        });
      }

      return reply.status(201).send({ success: true, data: formatContact(newContact[0]) });
    } catch (error: any) {
      return reply.status(error?.statusCode || 500).send({
        success: false,
        code: error?.code,
        feature: error?.feature,
        error: error.message,
      });
    }
  });

  // PUT update contact
  fastify.put('/:id', async (req: FastifyRequest<{
    Params: { id: string };
    Body: {
      nama_lengkap?: string;
      nama_panggilan?: string;
      tanggal_lahir?: string;
      nomor_whatsapp?: string;
      alamat?: string;
      kategori?: string;
      tags?: string | string[];
      notes?: string;
      exclude_from_metrics?: boolean;
      exclude_reason?: string | null;
    };
  }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const {
        nama_lengkap,
        nama_panggilan,
        tanggal_lahir,
        nomor_whatsapp,
        alamat,
        kategori,
        tags,
        notes,
        exclude_from_metrics,
        exclude_reason,
      } = req.body;

      const updateData: any = { updatedAt: new Date() };
      if (nama_lengkap) updateData.namaLengkap = nama_lengkap;
      if (nama_panggilan !== undefined) updateData.namaPanggilan = nama_panggilan;
      if (tanggal_lahir !== undefined) updateData.tanggalLahir = tanggal_lahir ? new Date(tanggal_lahir) : null;
      if (nomor_whatsapp) {
        const normalizedPhone = normalizePhoneNumber(nomor_whatsapp);
        const dup = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(
            and(
              eq(contacts.companyId, companyId),
              eq(contacts.nomorWhatsapp, normalizedPhone),
              ne(contacts.id, req.params.id)
            )
          );
        if (dup.length > 0) {
          return reply.status(400).send({
            success: false,
            error: 'Nomor WhatsApp sudah terdaftar untuk kontak lain',
          });
        }
        updateData.nomorWhatsapp = normalizedPhone;
      }
      if (alamat !== undefined) updateData.alamat = alamat;
      if (kategori !== undefined) updateData.kategori = kategori ? kategori.trim() : null;
      if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags.join(',') : tags;
      if (notes !== undefined) updateData.notes = notes;
      if (typeof exclude_from_metrics === 'boolean') {
        updateData.excludeFromMetrics = exclude_from_metrics;
        if (exclude_from_metrics) {
          updateData.excludeReason = exclude_reason !== undefined
            ? (exclude_reason ? String(exclude_reason).trim() || 'Bukan Customer' : 'Bukan Customer')
            : 'Bukan Customer';
        } else if (exclude_reason === undefined) {
          updateData.excludeReason = null;
        }
      } else if (exclude_reason !== undefined) {
        updateData.excludeReason = exclude_reason ? String(exclude_reason).trim() || null : null;
      }

      const updated = await db
        .update(contacts)
        .set(updateData)
        .where(and(eq(contacts.id, req.params.id), eq(contacts.companyId, companyId)))
        .returning();

      if (updated.length === 0) {
        return reply.status(404).send({ success: false, error: 'Kontak tidak ditemukan' });
      }

      if (typeof exclude_from_metrics === 'boolean' || exclude_reason !== undefined) {
        const nextExcl = Boolean(updated[0].excludeFromMetrics);
        const nextReason = nextExcl ? (updated[0].excludeReason || 'Bukan Customer') : null;
        await db
          .update(conversations)
          .set({
            excludeFromMetrics: nextExcl,
            excludeReason: nextReason,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(conversations.companyId, companyId),
              eq(conversations.contactId, req.params.id),
              eq(conversations.isGroup, false)
            )
          );
        liveEvents.emit('conversations:update', { contactId: req.params.id }, companyId);
      }

      return reply.send({ success: true, data: formatContact(updated[0]) });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // DELETE contact
  fastify.delete('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const deleted = await db
        .delete(contacts)
        .where(and(eq(contacts.id, req.params.id), eq(contacts.companyId, companyId)))
        .returning({ id: contacts.id });
      if (!deleted[0]) {
        return reply.status(404).send({ success: false, error: 'Kontak tidak ditemukan' });
      }
      return reply.send({ success: true, message: 'Kontak berhasil dihapus' });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST bulk import
  fastify.post('/bulk', async (req: FastifyRequest<{
    Body: { contacts: any[] };
  }>, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const items = req.body?.contacts;
      if (!Array.isArray(items) || items.length === 0) {
        return reply.status(400).send({ success: false, error: 'Data kontak kosong atau tidak valid' });
      }

      const lic = await licenseService.assertLicenseActive(companyId);
      const countRes = await db
        .select({ count: sql<number>`count(*)` })
        .from(contacts)
        .where(eq(contacts.companyId, companyId));
      let currentTotal = Number(countRes[0]?.count || 0);

      let inserted = 0;
      let skipped = 0;

      for (const item of items) {
        if (!item.nama_lengkap || !item.nomor_whatsapp) {
          skipped++;
          continue;
        }

        const phone = normalizePhoneNumber(item.nomor_whatsapp);
        const now = new Date();

        try {
          const existing = await db
            .select()
            .from(contacts)
            .where(and(eq(contacts.companyId, companyId), eq(contacts.nomorWhatsapp, phone)));

          if (existing.length > 0) {
            await db
              .update(contacts)
              .set({
                namaLengkap: item.nama_lengkap,
                namaPanggilan: item.nama_panggilan || undefined,
                tanggalLahir: item.tanggal_lahir ? new Date(item.tanggal_lahir) : undefined,
                alamat: item.alamat || undefined,
                kategori: item.kategori ? String(item.kategori).trim() : undefined,
                tags: Array.isArray(item.tags) ? item.tags.join(',') : item.tags || undefined,
                updatedAt: now,
              })
              .where(eq(contacts.id, existing[0].id));
          } else {
            if (!lic.features.unlimitedContacts && (lic.features.maxContacts <= 0 || currentTotal >= lic.features.maxContacts)) {
              skipped++;
              continue;
            }
            await db.insert(contacts).values({
              id: crypto.randomUUID(),
              companyId,
              namaLengkap: item.nama_lengkap,
              namaPanggilan: item.nama_panggilan || null,
              tanggalLahir: item.tanggal_lahir ? new Date(item.tanggal_lahir) : null,
              nomorWhatsapp: phone,
              alamat: item.alamat || null,
              kategori: item.kategori ? String(item.kategori).trim() : null,
              tags: Array.isArray(item.tags) ? item.tags.join(',') : item.tags || null,
              createdAt: now,
              updatedAt: now,
            });
            currentTotal++;
          }
          inserted++;
        } catch {
          skipped++;
        }
      }

      return reply.send({
        success: true,
        message: `Import selesai. ${inserted} berhasil, ${skipped} dilewati.`,
        inserted,
        skipped,
      });
    } catch (error: any) {
      return reply.status(error?.statusCode || 500).send({
        success: false,
        code: error?.code,
        feature: error?.feature,
        error: error.message,
      });
    }
  });

  // GET unique tags
  fastify.get('/meta/tags', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const allContacts = await db
        .select({ tags: contacts.tags })
        .from(contacts)
        .where(eq(contacts.companyId, companyId));
      const tagSet = new Set<string>();

      allContacts.forEach((c) => {
        if (c.tags) {
          c.tags.split(',').forEach((t) => {
            const trimmed = t.trim();
            if (trimmed) tagSet.add(trimmed);
          });
        }
      });

      return reply.send({ success: true, data: Array.from(tagSet) });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST merge another contact into targetId (cross-channel contact merge within tenant)
  fastify.post<{
    Params: { targetId: string };
    Body: { sourceContactId?: string };
  }>('/:targetId/merge', async (req, reply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const { targetId } = req.params;
      const sourceContactId = String(req.body?.sourceContactId || '').trim();
      if (!sourceContactId) {
        return reply.status(400).send({ success: false, error: 'sourceContactId wajib diisi' });
      }
      if (targetId === sourceContactId) {
        return reply.status(400).send({ success: false, error: 'Tidak bisa menggabungkan kontak dengan dirinya sendiri' });
      }

      const [target] = await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, targetId), eq(contacts.companyId, companyId)));
      const [source] = await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, sourceContactId), eq(contacts.companyId, companyId)));
      if (!target || !source) {
        return reply.status(404).send({ success: false, error: 'Kontak target atau sumber tidak ditemukan' });
      }

      await db
        .update(contactIdentities)
        .set({ contactId: targetId })
        .where(and(eq(contactIdentities.contactId, sourceContactId), eq(contactIdentities.companyId, companyId)));
      await db
        .update(conversations)
        .set({ contactId: targetId, updatedAt: new Date() })
        .where(and(eq(conversations.contactId, sourceContactId), eq(conversations.companyId, companyId)));
      await db
        .update(chatMessages)
        .set({ contactId: targetId })
        .where(and(eq(chatMessages.contactId, sourceContactId), eq(chatMessages.companyId, companyId)));
      await db
        .update(csatResponses)
        .set({ contactId: targetId })
        .where(and(eq(csatResponses.contactId, sourceContactId), eq(csatResponses.companyId, companyId)));
      await db
        .update(campaignRecipients)
        .set({ contactId: targetId })
        .where(and(eq(campaignRecipients.contactId, sourceContactId), eq(campaignRecipients.companyId, companyId)));

      const mergedTags = Array.from(
        new Set(
          [target.tags, source.tags]
            .filter(Boolean)
            .flatMap((t) => String(t).split(',').map((s) => s.trim()))
            .filter(Boolean)
        )
      ).join(', ');

      const mergedNotes = [target.notes, source.notes].filter(Boolean).join('\n---\n') || null;
      const patch: Record<string, any> = {
        namaPanggilan: target.namaPanggilan || source.namaPanggilan || null,
        alamat: target.alamat || source.alamat || null,
        kategori: target.kategori || source.kategori || null,
        tags: mergedTags || null,
        notes: mergedNotes,
        updatedAt: new Date(),
      };
      if (!target.nomorWhatsapp && source.nomorWhatsapp) {
        patch.nomorWhatsapp = source.nomorWhatsapp;
      }

      if (!target.nomorWhatsapp && source.nomorWhatsapp) {
        await db
          .update(contacts)
          .set({ nomorWhatsapp: null })
          .where(and(eq(contacts.id, sourceContactId), eq(contacts.companyId, companyId)));
      }
      const [updatedTarget] = await db
        .update(contacts)
        .set(patch)
        .where(and(eq(contacts.id, targetId), eq(contacts.companyId, companyId)))
        .returning();

      await db
        .delete(contacts)
        .where(and(eq(contacts.id, sourceContactId), eq(contacts.companyId, companyId)));

      liveEvents.emit('conversations:update', {}, companyId);
      return reply.send({
        success: true,
        message: 'Kontak berhasil digabungkan',
        data: formatContact(updatedTarget),
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST add omnichannel identity to contact
  fastify.post<{
    Params: { id: string };
    Body: { channel?: string; externalId?: string; handle?: string };
  }>('/:id/identities', async (req, reply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const contactId = req.params.id;
      const [ownerContact] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.companyId, companyId)))
        .limit(1);
      if (!ownerContact) {
        return reply.status(404).send({ success: false, error: 'Kontak tidak ditemukan' });
      }

      const channel = String(req.body?.channel || '').trim().toUpperCase();
      const externalId = String(req.body?.externalId || '').trim();
      const handle = req.body?.handle ? String(req.body.handle).trim() : null;
      if (!channel || !externalId) {
        return reply.status(400).send({
          success: false,
          error: 'Channel dan External ID wajib diisi',
        });
      }
      const existing = await db
        .select()
        .from(contactIdentities)
        .where(
          and(
            eq(contactIdentities.companyId, companyId),
            eq(contactIdentities.contactId, contactId),
            eq(contactIdentities.channel, channel),
            eq(contactIdentities.externalId, externalId)
          )
        );
      if (existing.length > 0) {
        const [updated] = await db
          .update(contactIdentities)
          .set({ handle: handle ?? existing[0].handle })
          .where(eq(contactIdentities.id, existing[0].id))
          .returning();
        return reply.send({ success: true, data: updated });
      }
      const [inserted] = await db
        .insert(contactIdentities)
        .values({
          id: crypto.randomUUID(),
          companyId,
          contactId,
          channel,
          externalId,
          handle,
          createdAt: new Date(),
        })
        .returning();
      return reply.status(201).send({ success: true, data: inserted });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // DELETE omnichannel identity from contact
  fastify.delete<{ Params: { id: string; identityId: string } }>(
    '/:id/identities/:identityId',
    async (req, reply) => {
      try {
        const companyId = getRequestCompanyId(req);
        await db
          .delete(contactIdentities)
          .where(
            and(
              eq(contactIdentities.companyId, companyId),
              eq(contactIdentities.id, req.params.identityId),
              eq(contactIdentities.contactId, req.params.id)
            )
          );
        return reply.send({ success: true });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  // POST sync contacts from connected WhatsApp session via WAHA
  fastify.post<{
    Body: { session?: string; overwriteNames?: boolean };
  }>('/sync-whatsapp', async (req, reply) => {
    try {
      const companyId = getRequestCompanyId(req);
      const lic = await licenseService.assertFeature('wahaSync', undefined, companyId);
      const requestedSession = req.body?.session ? String(req.body.session).trim() : undefined;
      const overwriteNames = Boolean(req.body?.overwriteNames);

      const { contacts: waContacts, sessionUsed } = await wahaService.fetchAllContacts(requestedSession);
      const existingList = await db
        .select({
          id: contacts.id,
          namaLengkap: contacts.namaLengkap,
          namaPanggilan: contacts.namaPanggilan,
          nomorWhatsapp: contacts.nomorWhatsapp,
        })
        .from(contacts)
        .where(eq(contacts.companyId, companyId));

      const phoneMap = new Map<string, (typeof existingList)[number]>();
      for (const c of existingList) {
        if (c.nomorWhatsapp) {
          phoneMap.set(normalizePhoneNumber(c.nomorWhatsapp), c);
        }
      }

      const existingIds = await db
        .select({
          contactId: contactIdentities.contactId,
          externalId: contactIdentities.externalId,
        })
        .from(contactIdentities)
        .where(and(eq(contactIdentities.companyId, companyId), eq(contactIdentities.channel, 'WHATSAPP')));
      const lidSet = new Set<string>(existingIds.map((x) => x.externalId));

      let currentTotal = existingList.length;
      const maxContacts = lic.features.unlimitedContacts ? 0 : lic.features.maxContacts || 0;

      let created = 0;
      let updated = 0;
      let skipped = 0;
      let quotaStopped = false;
      const now = new Date();

      const newContactRows: Array<typeof contacts.$inferInsert> = [];
      const newIdentityRows: Array<typeof contactIdentities.$inferInsert> = [];
      const existingIdsValid = new Set(existingList.map((c) => c.id));

      for (const item of waContacts) {
        if (!item.phone) {
          skipped++;
          continue;
        }
        const preferredName = (item.name || item.pushName || '').trim();
        const existing = phoneMap.get(item.phone);

        if (existing) {
          const isPlaceholderName =
            !existing.namaLengkap ||
            /^Kontak \d+$/i.test(existing.namaLengkap) ||
            existing.namaLengkap.replace(/\D/g, '') === item.phone;
          const nextName =
            preferredName && (overwriteNames || isPlaceholderName) ? preferredName : null;
          const nextNick =
            !existing.namaPanggilan && item.pushName ? item.pushName.trim() : null;

          if (nextName || nextNick) {
            await db
              .update(contacts)
              .set({
                ...(nextName ? { namaLengkap: nextName } : {}),
                ...(nextNick ? { namaPanggilan: nextNick } : {}),
                updatedAt: now,
              })
              .where(eq(contacts.id, existing.id));
            if (nextName) existing.namaLengkap = nextName;
            if (nextNick) existing.namaPanggilan = nextNick;
            updated++;
          } else {
            skipped++;
          }

          if (item.lid && !lidSet.has(item.lid)) {
            newIdentityRows.push({
              id: crypto.randomUUID(),
              companyId,
              contactId: existing.id,
              channel: 'WHATSAPP',
              externalId: item.lid,
              handle: `+${item.phone}`,
              createdAt: now,
            });
            lidSet.add(item.lid);
          }
          continue;
        }

        if (!lic.features.unlimitedContacts && (maxContacts <= 0 || currentTotal >= maxContacts)) {
          quotaStopped = true;
          skipped++;
          continue;
        }

        const newId = crypto.randomUUID();
        const finalName = preferredName || `+${item.phone}`;
        const pendingEntry = {
          id: newId,
          namaLengkap: finalName,
          namaPanggilan: item.pushName?.trim() || null,
          nomorWhatsapp: item.phone,
        };
        phoneMap.set(item.phone, pendingEntry);
        currentTotal++;
        created++;

        newContactRows.push({
          id: newId,
          companyId,
          namaLengkap: finalName,
          namaPanggilan: pendingEntry.namaPanggilan,
          nomorWhatsapp: item.phone,
          tags: 'WhatsApp Sync',
          createdAt: now,
          updatedAt: now,
        });

        if (item.lid && !lidSet.has(item.lid)) {
          newIdentityRows.push({
            id: crypto.randomUUID(),
            companyId,
            contactId: newId,
            channel: 'WHATSAPP',
            externalId: item.lid,
            handle: `+${item.phone}`,
            createdAt: now,
          });
          lidSet.add(item.lid);
        }
      }

      const INSERT_CHUNK = 200;
      for (let i = 0; i < newContactRows.length; i += INSERT_CHUNK) {
        const chunk = newContactRows.slice(i, i + INSERT_CHUNK);
        const insertedChunk = await db
          .insert(contacts)
          .values(chunk)
          .onConflictDoNothing()
          .returning({ id: contacts.id });
        for (const r of insertedChunk) {
          existingIdsValid.add(r.id);
        }
      }

      const validIdentities = newIdentityRows.filter((idRow) =>
        existingIdsValid.has(idRow.contactId)
      );
      for (let i = 0; i < validIdentities.length; i += INSERT_CHUNK) {
        const chunk = validIdentities.slice(i, i + INSERT_CHUNK);
        await db
          .insert(contactIdentities)
          .values(chunk)
          .onConflictDoNothing()
          .catch(() => {});
      }

      if (created > 0 || updated > 0) {
        liveEvents.emit('contacts:update', { created, updated, source: 'whatsapp-sync' }, companyId);
      }

      return reply.send({
        success: true,
        data: {
          sessionUsed,
          totalFetched: waContacts.length,
          created,
          updated,
          skipped,
          quotaStopped,
          currentTotal,
          maxContacts,
        },
      });
    } catch (error: any) {
      return reply.status(error?.statusCode || 500).send({
        success: false,
        code: error?.code,
        feature: error?.feature,
        error: error.message || 'Gagal menyinkronkan kontak dari WhatsApp',
      });
    }
  });
}
