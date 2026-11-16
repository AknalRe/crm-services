import { getApiBaseUrl } from './paths';

type LiveEventType =
  | 'waha:status'
  | 'tracking:update'
  | 'conversations:update'
  | 'conversations:presence'
  | 'license:update'
  | 'sla:breach'
  | 'csat:low'
  | 'posts:update';

type LiveListener = (payload: any) => void;

const listeners = new Map<LiveEventType, Set<LiveListener>>();
let eventSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let activeSubscribers = 0;

function ensureConnected() {
  if (eventSource || typeof window === 'undefined' || activeSubscribers <= 0) return;

  const es = new EventSource(`${getApiBaseUrl(window.location.pathname)}/events`);
  eventSource = es;

  const eventTypes: LiveEventType[] = [
    'waha:status',
    'tracking:update',
    'conversations:update',
    'conversations:presence',
    'license:update',
    'sla:breach',
    'csat:low',
  ];

  eventTypes.forEach((eventType) => {
    es.addEventListener(eventType, (evt: MessageEvent) => {
      let parsed: any = {};
      try {
        parsed = JSON.parse(evt.data || '{}');
      } catch {
        parsed = {};
      }
      const set = listeners.get(eventType);
      if (set) {
        set.forEach((fn) => {
          try {
            fn(parsed);
          } catch {
            // Isolate listener errors
          }
        });
      }
    });
  });

  es.onerror = () => {
    es.close();
    if (eventSource === es) {
      eventSource = null;
    }
    if (activeSubscribers > 0 && !reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        ensureConnected();
      }, 3000);
    }
  };
}

function maybeDisconnect() {
  if (activeSubscribers > 0) return;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

export function subscribeLiveEvent(eventType: LiveEventType, listener: LiveListener): () => void {
  let set = listeners.get(eventType);
  if (!set) {
    set = new Set();
    listeners.set(eventType, set);
  }
  set.add(listener);
  activeSubscribers += 1;
  ensureConnected();

  return () => {
    set?.delete(listener);
    activeSubscribers = Math.max(0, activeSubscribers - 1);
    maybeDisconnect();
  };
}
