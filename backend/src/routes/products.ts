import crypto from 'crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db';
import { products } from '../db/schema';
import { requirePermission } from './auth';

export default async function productsRouter(fastify: FastifyInstance) {
  // List products (accessible by conversations & settings)
  fastify.get<{ Querystring: { activeOnly?: string } }>(
    '/',
    { preHandler: requirePermission('conversations', 'settings', 'broadcasts') },
    async (req, reply) => {
      try {
        const activeOnly = req.query?.activeOnly === 'true';
        const rows = activeOnly
          ? await db.select().from(products).where(eq(products.isActive, true)).orderBy(asc(products.name))
          : await db.select().from(products).orderBy(asc(products.name));
        return reply.send({ success: true, data: rows });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  // Create product
  fastify.post<{
    Body: {
      sku?: string;
      name?: string;
      category?: string;
      price?: number;
      unit?: string;
      description?: string;
    };
  }>('/', { preHandler: requirePermission('conversations', 'settings') }, async (req, reply) => {
    try {
      const name = (req.body?.name || '').trim();
      const rawSku = (req.body?.sku || '').trim();
      if (!name) {
        return reply.status(400).send({ success: false, error: 'Nama produk wajib diisi' });
      }
      const sku = rawSku || `PRD-${Date.now().toString().slice(-6)}`;
      const price = Math.max(0, Math.round(Number(req.body?.price) || 0));
      const unit = (req.body?.unit || 'pcs').trim() || 'pcs';
      const category = (req.body?.category || '').trim() || null;
      const description = (req.body?.description || '').trim() || null;
      const now = new Date();

      const [created] = await db
        .insert(products)
        .values({
          id: crypto.randomUUID(),
          sku,
          name,
          category,
          price,
          unit,
          description,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return reply.status(201).send({ success: true, data: created });
    } catch (error: any) {
      if (String(error.message || '').toLowerCase().includes('unique')) {
        return reply.status(400).send({ success: false, error: 'Kode SKU sudah terdaftar' });
      }
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // Update product
  fastify.patch<{
    Params: { id: string };
    Body: {
      sku?: string;
      name?: string;
      category?: string;
      price?: number;
      unit?: string;
      description?: string;
      isActive?: boolean;
    };
  }>('/:id', { preHandler: requirePermission('settings', 'conversations') }, async (req, reply) => {
    try {
      const { id } = req.params;
      const existing = await db.select().from(products).where(eq(products.id, id));
      if (!existing[0]) {
        return reply.status(404).send({ success: false, error: 'Produk tidak ditemukan' });
      }

      const patch: Record<string, any> = { updatedAt: new Date() };
      if (req.body?.name !== undefined) patch.name = String(req.body.name).trim();
      if (req.body?.sku !== undefined) patch.sku = String(req.body.sku).trim();
      if (req.body?.category !== undefined) patch.category = String(req.body.category).trim() || null;
      if (req.body?.price !== undefined) patch.price = Math.max(0, Math.round(Number(req.body.price) || 0));
      if (req.body?.unit !== undefined) patch.unit = String(req.body.unit).trim() || 'pcs';
      if (req.body?.description !== undefined) patch.description = String(req.body.description).trim() || null;
      if (req.body?.isActive !== undefined) patch.isActive = Boolean(req.body.isActive);

      const [updated] = await db
        .update(products)
        .set(patch)
        .where(eq(products.id, id))
        .returning();

      return reply.send({ success: true, data: updated });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // Delete product
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requirePermission('settings', 'conversations') },
    async (req, reply) => {
      try {
        await db.delete(products).where(eq(products.id, req.params.id));
        return reply.send({ success: true });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );
}
