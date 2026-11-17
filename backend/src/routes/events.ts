import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { liveEvents, LiveEventPayload } from '../services/events.service';
import { getCurrentAuthUser, getRequestCompanyId } from './auth';

export default async function eventsRouter(fastify: FastifyInstance) {
  fastify.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const authUser = await getCurrentAuthUser(req);
    if (!authUser) {
      return reply.status(401).send({ success: false, error: 'Sesi login diperlukan' });
    }

    const activeCompanyId = getRequestCompanyId(req);
    reply.hijack();

    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (eventName: string, data: unknown) => {
      if (raw.writableEnded) return;
      raw.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    send('connected', {
      ok: true,
      companyId: activeCompanyId,
      timestamp: new Date().toISOString(),
    });

    const unsubscribe = liveEvents.subscribe((payload: LiveEventPayload) => {
      if (payload.type === 'tenants:update') {
        if (authUser.isPlatformAdmin) {
          send(payload.type, payload);
        }
        return;
      }
      if (payload.companyId !== activeCompanyId) return;
      send(payload.type, payload);
    });

    const heartbeat = setInterval(() => {
      if (!raw.writableEnded) {
        raw.write(': ping\n\n');
      }
    }, 25000);

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };

    req.raw.on('close', cleanup);
    req.raw.on('error', cleanup);
  });
}
