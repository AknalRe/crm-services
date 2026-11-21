import { EventEmitter } from 'events';
import { getActiveCompanyId } from './tenantContext';

export type LiveEventType =
  | 'waha:status'
  | 'tracking:update'
  | 'conversations:update'
  | 'conversations:presence'
  | 'conversations:ai_typing'
  | 'license:update'
  | 'sla:breach'
  | 'csat:low'
  | 'posts:update'
  | 'contacts:update'
  | 'tenants:update';

export interface LiveEventPayload {
  type: LiveEventType;
  companyId: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

class LiveEventsService {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(400);
  }

  public emit(type: LiveEventType, data?: Record<string, unknown>, companyIdOverride?: string) {
    const rawCid =
      companyIdOverride ||
      (typeof data?.companyId === 'string' && data.companyId.trim() ? data.companyId.trim() : '');
    const companyId = getActiveCompanyId(rawCid || undefined);
    const payload: LiveEventPayload = {
      type,
      companyId,
      data,
      timestamp: new Date().toISOString(),
    };
    this.emitter.emit('event', payload);
  }

  public emitForCompany(companyId: string, type: LiveEventType, data?: Record<string, unknown>) {
    this.emit(type, data, companyId);
  }

  public subscribe(listener: (payload: LiveEventPayload) => void): () => void {
    this.emitter.on('event', listener);
    return () => {
      this.emitter.off('event', listener);
    };
  }
}

export const liveEvents = new LiveEventsService();
