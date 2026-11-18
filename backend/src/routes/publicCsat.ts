import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { conversations, contacts, csatResponses } from '../db/schema';
import { liveEvents } from '../services/events.service';
import { notifyAlertWebhook } from '../services/automation.service';
import {
  buildCsatSnapshot,
  computeCsatSubmission,
  extractCsatCriteriaDetails,
  parseCsatSnapshot,
  parseCsatSurveyConfig,
  renderCsatTexts,
  resolveCsatProfileForConversation,
} from '../services/csat.service';
import { getSettingMap } from './auth';

function escapeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default async function publicCsatRouter(fastify: FastifyInstance) {
  // GET clean HTML link-preview metadata for WhatsApp and messaging crawlers
  fastify.get('/preview', async (req: FastifyRequest<{ Querystring: { token?: string } }>, reply: FastifyReply) => {
    const token = String(req.query?.token || '').trim();
    let title = 'Penilaian Layanan';
    let description = 'Mohon luangkan waktu sejenak untuk memberikan penilaian atas layanan kami.';

    if (token) {
      try {
        const settings = await getSettingMap();
        const surveyConfig = parseCsatSurveyConfig(settings.csat_survey_config);
        const csatRows = await db
          .select({ csat: csatResponses, contact: contacts })
          .from(csatResponses)
          .leftJoin(contacts, eq(csatResponses.contactId, contacts.id))
          .where(eq(csatResponses.token, token))
          .limit(1);

        if (csatRows[0]) {
          const item = csatRows[0];
          const contactName = item.contact?.namaPanggilan || item.contact?.namaLengkap || 'Pelanggan';
          const snapshot = parseCsatSnapshot(item.csat.snapshotJson, surveyConfig);
          const rendered = renderCsatTexts(snapshot.texts, contactName);
          title = rendered.title || title;
          description = rendered.greetingText || rendered.subtitle || description;
        } else {
          const convRows = await db
            .select({ conv: conversations, contact: contacts })
            .from(conversations)
            .leftJoin(contacts, eq(conversations.contactId, contacts.id))
            .where(eq(conversations.csatToken, token))
            .limit(1);
          if (convRows[0]) {
            const row = convRows[0];
            const contactName = row.contact?.namaPanggilan || row.contact?.namaLengkap || 'Pelanggan';
            const profile = resolveCsatProfileForConversation(surveyConfig, row.conv);
            const snapshot = buildCsatSnapshot(profile);
            const rendered = renderCsatTexts(snapshot.texts, contactName);
            title = rendered.title || title;
            description = rendered.greetingText || rendered.subtitle || description;
          }
        }
      } catch {
        // Fallback to default survey metadata cleanly
      }
    }

    const safeTitle = escapeHtml(title);
    const safeDesc = escapeHtml(description);
    const html = `<!doctype html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDesc}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
</head>
<body>
  <h1>${safeTitle}</h1>
  <p>${safeDesc}</p>
</body>
</html>`;
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return reply.send(html);
  });

  // GET CSAT details by public token (no panel auth required)
  fastify.get('/:token', async (req: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
    try {
      const token = (req.params.token || '').trim();
      if (!token) {
        return reply.status(400).send({ success: false, error: 'Token CSAT tidak valid' });
      }

      const csatRows = await db
        .select({
          csat: csatResponses,
          contact: contacts,
        })
        .from(csatResponses)
        .leftJoin(contacts, eq(csatResponses.contactId, contacts.id))
        .where(eq(csatResponses.token, token));

      const settings = await getSettingMap();
      const surveyConfig = parseCsatSurveyConfig(settings.csat_survey_config);

      if (csatRows[0]) {
        const item = csatRows[0];
        const contactName = item.contact?.namaPanggilan || item.contact?.namaLengkap || 'Pelanggan';
        const snapshot = parseCsatSnapshot(item.csat.snapshotJson, surveyConfig);
        const texts = renderCsatTexts(snapshot.texts, contactName);
        const criteriaDetails = extractCsatCriteriaDetails(item.csat);
        const criteriaScores: Record<string, number> = {};
        for (const d of criteriaDetails) criteriaScores[d.key] = d.score;

        return reply.send({
          success: true,
          data: {
            contactName,
            agentName: item.csat.assignedAgentName || null,
            wahaSession: item.csat.wahaSession || null,
            profileName: item.csat.profileName || snapshot.profileName,
            texts,
            criteria: snapshot.criteria.filter((c) => c.isActive !== false),
            alreadyRated: Boolean(item.csat.rating),
            rating: item.csat.rating,
            overallScore: item.csat.overallScore ?? item.csat.rating ?? null,
            criteriaScores,
            criteriaDetails,
            feedback: item.csat.feedback,
            submittedAt: item.csat.submittedAt,
          },
        });
      }

      const rows = await db
        .select({
          conv: conversations,
          contact: contacts,
        })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(eq(conversations.csatToken, token));

      const row = rows[0];
      if (!row) {
        return reply.status(404).send({ success: false, error: 'Tautan penilaian tidak ditemukan atau sudah kedaluwarsa' });
      }

      const contactName = row.contact?.namaPanggilan || row.contact?.namaLengkap || 'Pelanggan';
      const profile = resolveCsatProfileForConversation(surveyConfig, row.conv);
      const snapshot = buildCsatSnapshot(profile);
      const texts = renderCsatTexts(snapshot.texts, contactName);

      return reply.send({
        success: true,
        data: {
          contactName,
          agentName: row.conv.assignedAgentName || null,
          wahaSession: row.conv.wahaSession || null,
          profileName: profile.name,
          texts,
          criteria: snapshot.criteria,
          alreadyRated: Boolean(row.conv.csatRating),
          rating: row.conv.csatRating,
          overallScore: row.conv.csatOverallScore ?? row.conv.csatRating ?? null,
          criteriaScores: {},
          criteriaDetails: [],
          feedback: row.conv.csatFeedback,
          submittedAt: row.conv.csatSubmittedAt,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST submit CSAT rating & feedback
  fastify.post('/:token', async (req: FastifyRequest<{
    Params: { token: string };
    Body: { rating?: number; criteriaScores?: Record<string, number>; feedback?: string };
  }>, reply: FastifyReply) => {
    try {
      const token = (req.params.token || '').trim();
      const feedback = req.body?.feedback ? String(req.body.feedback).trim() : null;

      if (!token) {
        return reply.status(400).send({ success: false, error: 'Token CSAT tidak valid' });
      }

      const settings = await getSettingMap();
      const surveyConfig = parseCsatSurveyConfig(settings.csat_survey_config);
      const now = new Date();

      const csatRows = await db
        .select()
        .from(csatResponses)
        .where(eq(csatResponses.token, token));

      let convId: string | null = null;
      let computed: ReturnType<typeof computeCsatSubmission>;

      if (csatRows[0]) {
        if (csatRows[0].rating !== null) {
          return reply.status(409).send({
            success: false,
            error: 'Penilaian untuk tautan ini sudah pernah dikirim',
          });
        }
        const snapshot = parseCsatSnapshot(csatRows[0].snapshotJson, surveyConfig);
        try {
          computed = computeCsatSubmission({
            snapshot,
            criteriaScores: req.body?.criteriaScores,
            fallbackRating: req.body?.rating,
            feedback,
          });
        } catch (valErr: any) {
          return reply.status(400).send({ success: false, error: valErr.message });
        }

        convId = csatRows[0].conversationId;
        const updatedCsat = await db
          .update(csatResponses)
          .set({
            rating: computed.rating,
            overallScore: computed.overallScore,
            criteriaScoresJson:
              Object.keys(computed.normalizedScores).length > 0
                ? JSON.stringify(computed.normalizedScores)
                : null,
            feedback,
            submittedAt: now,
          })
          .where(and(eq(csatResponses.id, csatRows[0].id), isNull(csatResponses.rating)))
          .returning();
        if (!updatedCsat[0]) {
          return reply.status(409).send({
            success: false,
            error: 'Penilaian untuk tautan ini sudah pernah dikirim',
          });
        }
      } else {
        const rows = await db
          .select()
          .from(conversations)
          .where(eq(conversations.csatToken, token));
        if (!rows[0]) {
          return reply.status(404).send({ success: false, error: 'Tautan penilaian tidak ditemukan' });
        }
        if (rows[0].csatRating !== null) {
          return reply.status(409).send({
            success: false,
            error: 'Penilaian untuk tautan ini sudah pernah dikirim',
          });
        }
        const snapshot = buildCsatSnapshot(resolveCsatProfileForConversation(surveyConfig, rows[0]));
        try {
          computed = computeCsatSubmission({
            snapshot,
            criteriaScores: req.body?.criteriaScores,
            fallbackRating: req.body?.rating,
            feedback,
          });
        } catch (valErr: any) {
          return reply.status(400).send({ success: false, error: valErr.message });
        }
        convId = rows[0].id;
      }

      await db
        .update(conversations)
        .set({
          csatRating: computed.rating,
          csatOverallScore: computed.overallScore,
          csatFeedback: feedback,
          csatSubmittedAt: now,
          updatedAt: now,
        })
        .where(eq(conversations.id, convId));

      liveEvents.emit('conversations:update', {
        conversationId: convId,
        csatRating: computed.rating,
        csatOverallScore: computed.overallScore,
      });
      liveEvents.emit('tracking:update', {
        conversationId: convId,
        csatRating: computed.rating,
        csatOverallScore: computed.overallScore,
      });
      if (computed.overallScore <= 2 || computed.rating <= 2) {
        liveEvents.emit('csat:low', {
          conversationId: convId,
          rating: computed.rating,
          overallScore: computed.overallScore,
          feedback,
        });
        void notifyAlertWebhook('low_csat', {
          conversationId: convId,
          rating: computed.rating,
          overallScore: computed.overallScore,
          criteriaDetails: computed.details,
          feedback,
        });
      }

      return reply.send({
        success: true,
        message: 'Terima kasih atas penilaian Anda!',
        data: {
          rating: computed.rating,
          overallScore: computed.overallScore,
          criteriaScores: computed.normalizedScores,
          criteriaDetails: computed.details,
          feedback,
          submittedAt: now,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
