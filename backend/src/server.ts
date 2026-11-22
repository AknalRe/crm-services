import Fastify from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import { config } from './config';
import { initDb } from './db';
import { DEFAULT_COMPANY_ID } from './db/schema';
import { licenseService } from './services/license.service';
import { runWithCompany } from './services/tenantContext';
import contactsRouter from './routes/contacts';
import broadcastsRouter from './routes/broadcasts';
import conversationsRouter from './routes/conversations';
import settingsRouter from './routes/settings';
import wahaRouter from './routes/waha';
import dashboardRouter from './routes/dashboard';
import licenseRouter from './routes/license';
import authRouter, { getCurrentAuthUser, getRequestCompanyId } from './routes/auth';
import tenantsRouter from './routes/tenants';
import eventsRouter from './routes/events';
import publicCsatRouter from './routes/publicCsat';
import publicSeoRouter from './routes/publicSeo';
import agentsRouter from './routes/agents';
import productsRouter from './routes/products';
import channelsRouter from './routes/channels';
import postsRouter from './routes/posts';
import mediaRouter from './routes/media';
import ideasRouter from './routes/ideas';
import commentsRouter from './routes/comments';
import feedRouter from './routes/feed';
import automationsRouter from './routes/automations';
import aiAgentRouter from './routes/aiAgent';
import masterDataRouter from './routes/masterData';
import { BirthdayService } from './services/birthday.service';
import { PostService } from './services/post.service';
import { startSlaMonitor, startInactivityAutoResolveMonitor } from './services/automation.service';
import { startWahaBackgroundSyncMonitor } from './services/chatSync.service';
import { startOmnichannelBackgroundSyncMonitor } from './services/omnichannelSync.service';
import {
  evaluateDomainGuardRequest,
  verifyReneoRuntimeEnvironment,
} from './services/domainGuard';
import './services/queue.service'; // Start BullMQ worker

const fastify = Fastify({
  bodyLimit: 16 * 1024 * 1024,
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

async function main() {
  // Register Plugins
  await fastify.register(cors, { origin: '*' });
  await fastify.register(formbody);

  // Strict Reneo-only installation + allowed hostname & domain guard
  fastify.addHook('onRequest', async (req, reply) => {
    const decision = await evaluateDomainGuardRequest({
      urlPath: req.url,
      hostHeader: req.headers.host,
      forwardedHostHeader: req.headers['x-forwarded-host'],
    });

    if (!decision.allowed) {
      return reply.status(decision.statusCode || 403).send({
        success: false,
        code: decision.code || 'DOMAIN_NOT_ALLOWED',
        host: decision.hostname || undefined,
        error:
          decision.error ||
          'Domain atau lingkungan tidak diizinkan. CRM ini hanya dapat diinstal dan diakses dari lingkungan Reneo.',
      });
    }
  });

  // Bind AsyncLocalStorage tenant workspace context for authenticated requests
  fastify.addHook('onRequest', (req, _reply, done) => {
    getCurrentAuthUser(req)
      .then((user) => {
        const cid = user?.companyId || getRequestCompanyId(req);
        runWithCompany(cid, () => done(), {
          userId: user?.id,
          isPlatformAdmin: Boolean(user?.isPlatformAdmin),
        });
      })
      .catch(() => {
        runWithCompany(DEFAULT_COMPANY_ID, () => done());
      });
  });

  // Health check
  fastify.get('/health', async () => {
    const status = config.reneo.requireReneoEnv
      ? await verifyReneoRuntimeEnvironment()
      : { verified: true };
    return {
      status: status.verified ? 'ok' : 'restricted',
      reneoVerified: status.verified,
      engine: 'Fastify + Drizzle ORM',
      timestamp: new Date().toISOString(),
      service: 'Reneo CRM Omnichannel API',
    };
  });

  // Mount Routes
  await fastify.register(authRouter, { prefix: '/api/auth' });
  await fastify.register(tenantsRouter, { prefix: '/api/tenants' });
  await fastify.register(dashboardRouter, { prefix: '/api/dashboard' });
  await fastify.register(contactsRouter, { prefix: '/api/contacts' });
  await fastify.register(broadcastsRouter, { prefix: '/api/broadcasts' });
  await fastify.register(conversationsRouter, { prefix: '/api/conversations' });
  await fastify.register(settingsRouter, { prefix: '/api/settings' });
  await fastify.register(wahaRouter, { prefix: '/api/waha' });
  await fastify.register(licenseRouter, { prefix: '/api/license' });
  await fastify.register(eventsRouter, { prefix: '/api/events' });
  await fastify.register(publicCsatRouter, { prefix: '/api/public/csat' });
  await fastify.register(publicSeoRouter, { prefix: '/api/public/seo' });
  await fastify.register(agentsRouter, { prefix: '/api/agents' });
  await fastify.register(productsRouter, { prefix: '/api/products' });
  await fastify.register(channelsRouter, { prefix: '/api/channels' });
  await fastify.register(postsRouter, { prefix: '/api/posts' });
  await fastify.register(mediaRouter, { prefix: '/api/media' });
  await fastify.register(ideasRouter, { prefix: '/api/ideas' });
  await fastify.register(commentsRouter, { prefix: '/api/comments' });
  await fastify.register(feedRouter, { prefix: '/api/feed' });
  await fastify.register(automationsRouter, { prefix: '/api/automations' });
  await fastify.register(aiAgentRouter, { prefix: '/api/ai-agent' });
  await fastify.register(masterDataRouter, { prefix: '/api/master' });

  // Initialize DB Schema (PostgreSQL)
  try {
    await initDb();
  } catch (err: any) {
    fastify.log.error(`[DB Init] Failed to init DB schema: ${err.message}`);
  }

  // Start background verification + cron jobs
  if (config.reneo.requireReneoEnv) {
    void verifyReneoRuntimeEnvironment({ force: true }).then((st) => {
      if (!st.verified) {
        fastify.log.warn(`[ReneoGuard] ${st.lastFailureReason}`);
      }
    });
  }
  try {
    await BirthdayService.initScheduler();
    await PostService.initPostScheduler();
    startSlaMonitor();
    startInactivityAutoResolveMonitor();
    startWahaBackgroundSyncMonitor();
    startOmnichannelBackgroundSyncMonitor();
  } catch (err) {
    fastify.log.error('[BirthdayService] Failed to initialize scheduler: ' + err);
  }

  // Start Fastify Server
  try {
    await fastify.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`=======================================================`);
    console.log(`🚀 Fastify + Drizzle CRM API running on port ${config.port}`);
    console.log(`🔗 Health Check: http://localhost:${config.port}/health`);
    console.log(`=======================================================`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Graceful Shutdown
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    console.log(`Received ${signal}, closing server...`);
    await fastify.close();
    process.exit(0);
  });
});

main();

export default fastify;
