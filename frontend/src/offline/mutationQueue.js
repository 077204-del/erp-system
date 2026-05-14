import { OFFLINE_QUEUE_KEY, OFFLINE_QUEUE_MAX } from "./offlineConstants";

function readRaw() {
  try {
    const s = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!s) return [];
    const j = JSON.parse(s);
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function writeRaw(items) {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items.slice(-OFFLINE_QUEUE_MAX)));
  } catch {
    /* quota */
  }
}

export function offlineQueueLength() {
  return readRaw().length;
}

export function enqueueOfflineMutation(entry) {
  const q = readRaw();
  q.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: Date.now(),
    ...entry,
  });
  writeRaw(q);
}

export function peekOfflineQueue() {
  return readRaw();
}

export function shiftOfflineQueue() {
  const q = readRaw();
  const [first, ...rest] = q;
  writeRaw(rest);
  return first || null;
}

export function clearOfflineQueue() {
  try {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch {
    /* ignore */
  }
}
