const SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000;

type SessionActivityListener = () => void;

let lastActivityAt = Date.now();
let pendingRequestCount = 0;
const listeners = new Set<SessionActivityListener>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

export function markSessionActivity() {
  lastActivityAt = Date.now();
  notifyListeners();
}

export function beginTrackedSessionRequest() {
  pendingRequestCount += 1;
  markSessionActivity();
}

export function endTrackedSessionRequest() {
  pendingRequestCount = Math.max(0, pendingRequestCount - 1);
  markSessionActivity();
}

export function getSessionActivitySnapshot() {
  return {
    idleTimeoutMs: SESSION_IDLE_TIMEOUT_MS,
    lastActivityAt,
    pendingRequestCount,
  };
}

export function subscribeToSessionActivity(listener: SessionActivityListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
