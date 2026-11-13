import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, or, ilike, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { contacts } from '../db/schema';
import { normalizePhoneNumber } from '../services/phone.utils';
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
    tags: c.tags,
    notes: c.notes,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export default async function contactsRouter(fastify: FastifyInstance) {
  // GET all contacts with search and filter
  fastify.get('/', async (req: FastifyRequest<{
    Querystring: { search?: string; tag?: string; page?: string; limit?: string };
  }>, reply: FastifyReply) => {
    try {
      const { search, tag, page = '1', limit = '100' } = req.query;
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 100;
      const offset = (pageNum - 1) * limitNum;

      let query = db.select().from(contacts);

      const conditions: any[] = [];
      if (search && search.trim()) {
        const s = `%${search.trim()}%`;
        conditions.push(
          or(
            ilike(contacts.namaLengkap, s),
            ilike(contacts.namaPanggilan, s),
            ilike(contacts.nomorWhatsapp, s),
            ilike(contacts.alamat, s)
          )
        );
      }

      if (tag && tag !== 'ALL') {
        conditions.push(ilike(contacts.tags, `%${tag}%`));
      }

      const allContacts = await db
        .select()
        .from(contacts)
        .where(conditions.length > 0 ? or(...conditions) : undefined)
        .orderBy(desc(contacts.createdAt))
        .limit(limitNum)
        .offset(offset);

      const totalResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(contacts)
        .where(conditions.length > 0 ? or(...conditions) : undefined);

      const total = Number(totalResult[0]?.count || 0);

      return reply.send({
        success: true,
        data: allContacts.map(formatContact),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET single contact
  fastify.get('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const list = await db.select().from(contacts).where(eq(contacts.id, req.params.id));
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
      nomor_whatsapp: string;
      alamat?: string;
      tags?: string | string[];
      notes?: string;
    };
  }>, reply: FastifyReply) => {
    try {
      const {
        nama_lengkap,
        nama_panggilan,
        tanggal_lahir,
        nomor_whatsapp,
        alamat,
        tags,
        notes,
      } = req.body;

      if (!nama_lengkap || !nomor_whatsapp) {
        return reply.status(400).send({
          success: false,
          error: 'Nama lengkap dan nomor WhatsApp wajib diisi',
        });
      }

      const normalizedPhone = normalizePhoneNumber(nomor_whatsapp);

      // Check if phone already exists
      const existing = await db
        .select()
        .from(contacts)
        .where(eq(contacts.nomorWhatsapp, normalizedPhone));

      if (existing.length > 0) {
        return reply.status(400).send({
          success: false,
          error: 'Nomor WhatsApp sudah terdaftar untuk kontak lain',
        });
      }

      const now = new Date();
      const newContact = await db
        .insert(contacts)
        .values({
          id: crypto.randomUUID(),
          namaLengkap: nama_lengkap,
          namaPanggilan: nama_panggilan || null,
          tanggalLahir: tanggal_lahir ? new Date(tanggal_lahir) : null,
          nomorWhatsapp: normalizedPhone,
          alamat: alamat || null,
          tags: Array.isArray(tags) ? tags.join(',') : tags || null,
          notes: notes || null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return reply.status(201).send({ success: true, data: formatContact(newContact[0]) });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
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
      tags?: string | string[];
      notes?: string;
    };
  }>, reply: FastifyReply) => {
    try {
      const {
        nama_lengkap,
        nama_panggilan,
        tanggal_lahir,
        nomor_whatsapp,
        alamat,
        tags,
        notes,
      } = req.body;

      const updateData: any = { updatedAt: new Date() };
      if (nama_lengkap) updateData.namaLengkap = nama_lengkap;
      if (nama_panggilan !== undefined) updateData.namaPanggilan = nama_panggilan;
      if (tanggal_lahir !== undefined) updateData.tanggalLahir = tanggal_lahir ? new Date(tanggal_lahir) : null;
      if (nomor_whatsapp) updateData.nomorWhatsapp = normalizePhoneNumber(nomor_whatsapp);
      if (alamat !== undefined) updateData.alamat = alamat;
      if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags.join(',') : tags;
      if (notes !== undefined) updateData.notes = notes;

      const updated = await db
        .update(contacts)
        .set(updateData)
        .where(eq(contacts.id, req.params.id))
        .returning();

      if (updated.length === 0) {
        return reply.status(404).send({ success: false, error: 'Kontak tidak ditemukan' });
      }

      return reply.send({ success: true, data: formatContact(updated[0]) });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // DELETE contact
  fastify.delete('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      await db.delete(contacts).where(eq(contacts.id, req.params.id));
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
      const items = req.body?.contacts;
      if (!Array.isArray(items) || items.length === 0) {
        return reply.status(400).send({ success: false, error: 'Data kontak kosong atau tidak valid' });
      }

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
            .where(eq(contacts.nomorWhatsapp, phone));

          if (existing.length > 0) {
            await db
              .update(contacts)
              .set({
                namaLengkap: item.nama_lengkap,
                namaPanggilan: item.nama_panggilan || undefined,
                tanggalLahir: item.tanggal_lahir ? new Date(item.tanggal_lahir) : undefined,
                alamat: item.alamat || undefined,
                tags: Array.isArray(item.tags) ? item.tags.join(',') : item.tags || undefined,
                updatedAt: now,
              })
              .where(eq(contacts.id, existing[0].id));
          } else {
            await db.insert(contacts).values({
              id: crypto.randomUUID(),
              namaLengkap: item.nama_lengkap,
              namaPanggilan: item.nama_panggilan || null,
              tanggalLahir: item.tanggal_lahir ? new Date(item.tanggal_lahir) : null,
              nomorWhatsapp: phone,
              alamat: item.alamat || null,
              tags: Array.isArray(item.tags) ? item.tags.join(',') : item.tags || null,
              createdAt: now,
              updatedAt: now,
            });
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
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET unique tags
  fastify.get('/meta/tags', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const allContacts = await db.select({ tags: contacts.tags }).from(contacts);
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
}
