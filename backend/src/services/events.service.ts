import { EventEmitter } from 'events';

export type LiveEventType =
  | 'waha:status'
  | 'tracking:update'
  | 'conversations:update'
  | 'license:update'
  | 'sla:breach'
  | 'csat:low'
  | 'posts:update';

export interface LiveEventPayload {
  type: LiveEventType;
  data?: Record<string, unknown>;
  timestamp: string;
}

class LiveEventsService {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(200);
  }

  public emit(type: LiveEventType, data?: Record<string, unknown>) {
    const payload: LiveEventPayload = {
      type,
      data,
      timestamp: new Date().toISOString(),
    };
    this.emitter.emit('event', payload);
  }

  public subscribe(listener: (payload: LiveEventPayload) => void): () => void {
    this.emitter.on('event', listener);
    return () => {
      this.emitter.off('event', listener);
    };
  }
}

export const liveEvents = new LiveEventsService();
