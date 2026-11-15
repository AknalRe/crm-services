import Fastify from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import { config } from './config';
import { initDb } from './db';
import { licenseService } from './services/license.service';
import contactsRouter from './routes/contacts';
import broadcastsRouter from './routes/broadcasts';
import conversationsRouter from './routes/conversations';
import settingsRouter from './routes/settings';
import wahaRouter from './routes/waha';
import dashboardRouter from './routes/dashboard';
import licenseRouter from './routes/license';
import authRouter from './routes/auth';
import eventsRouter from './routes/events';
import publicCsatRouter from './routes/publicCsat';
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
import { BirthdayService } from './services/birthday.service';
import { PostService } from './services/post.service';
import { startSlaMonitor } from './services/automation.service';
import './services/queue.service'; // Start BullMQ worker

const fastify = Fastify({
  bodyLimit: 15 * 1024 * 1024,
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

async function main() {
  // Register Plugins
  await fastify.register(cors, { origin: '*' });
  await fastify.register(formbody);

  // Domain & Reneo-only installation guard
  let cachedPublicHosts: string[] = [];
  let cachedPublicHostsAt = 0;

  const matchesDomainRule = (host: string, rule: string): boolean => {
    if (rule.startsWith('*.')) {
      const suffix = rule.slice(1); // .domain.com
      return host === rule.slice(2) || host.endsWith(suffix);
    }
    return host === rule;
  };

  fastify.addHook('onRequest', async (req, reply) => {
    if (!config.reneo.enforceDomain && config.reneo.allowedDomains.length === 0) {
      return;
    }
    const urlPath = req.url.split('?')[0];
    if (urlPath === '/health' || urlPath.startsWith('/api/channels/webhook/')) {
      return;
    }

    const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
      .split(',')[0]
      .trim()
      .toLowerCase();
    const hostname = rawHost.replace(/:\d+$/, '');
    if (!hostname) return;

    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === 'host.docker.internal'
    ) {
      return;
    }

    if (config.reneo.allowedDomains.some((rule) => matchesDomainRule(hostname, rule))) {
      return;
    }

    if (Date.now() - cachedPublicHostsAt > 60_000) {
      try {
        const lic = await licenseService.getLicense();
        cachedPublicHosts = (lic.publicUrls || [])
          .map((u: string) => {
            try {
              return new URL(u).hostname.toLowerCase();
            } catch {
              return u.toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/:\d+$/, '');
            }
          })
          .filter(Boolean);
        cachedPublicHostsAt = Date.now();
      } catch {
        // ignore license lookup error
      }
    }

    if (cachedPublicHosts.some((rule) => matchesDomainRule(hostname, rule))) {
      return;
    }

    return reply.status(403).send({
      success: false,
      code: 'DOMAIN_NOT_ALLOWED',
      error:
        'Domain tidak diizinkan. CRM ini hanya dapat diinstal dan diakses dari lingkungan Reneo atau domain yang diizinkan.',
    });
  });

  // Health check
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      engine: 'Fastify + Drizzle ORM',
      timestamp: new Date().toISOString(),
      service: 'CRM WhatsApp Broadcast API',
    };
  });

  // Mount Routes
  await fastify.register(authRouter, { prefix: '/api/auth' });
  await fastify.register(dashboardRouter, { prefix: '/api/dashboard' });
  await fastify.register(contactsRouter, { prefix: '/api/contacts' });
  await fastify.register(broadcastsRouter, { prefix: '/api/broadcasts' });
  await fastify.register(conversationsRouter, { prefix: '/api/conversations' });
  await fastify.register(settingsRouter, { prefix: '/api/settings' });
  await fastify.register(wahaRouter, { prefix: '/api/waha' });
  await fastify.register(licenseRouter, { prefix: '/api/license' });
  await fastify.register(eventsRouter, { prefix: '/api/events' });
  await fastify.register(publicCsatRouter, { prefix: '/api/public/csat' });
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

  // Initialize DB Schema (PostgreSQL)
  try {
    await initDb();
  } catch (err: any) {
    fastify.log.error(`[DB Init] Failed to init DB schema: ${err.message}`);
  }

  // Start background cron jobs (Birthday automatic scheduler + SLA monitor)
  try {
    await BirthdayService.initScheduler();
    await PostService.initPostScheduler();
    startSlaMonitor();
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
