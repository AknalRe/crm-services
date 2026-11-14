import Fastify from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import { config } from './config';
import { initDb } from './db';
import contactsRouter from './routes/contacts';
import broadcastsRouter from './routes/broadcasts';
import conversationsRouter from './routes/conversations';
import settingsRouter from './routes/settings';
import wahaRouter from './routes/waha';
import dashboardRouter from './routes/dashboard';
import licenseRouter from './routes/license';
import authRouter from './routes/auth';
import eventsRouter from './routes/events';
import { BirthdayService } from './services/birthday.service';
import './services/queue.service'; // Start BullMQ worker

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

async function main() {
  // Register Plugins
  await fastify.register(cors, { origin: '*' });
  await fastify.register(formbody);

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

  // Initialize DB Schema (PostgreSQL)
  try {
    await initDb();
  } catch (err: any) {
    fastify.log.error(`[DB Init] Failed to init DB schema: ${err.message}`);
  }

  // Start background cron jobs (Birthday automatic scheduler)
  try {
    await BirthdayService.initScheduler();
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
