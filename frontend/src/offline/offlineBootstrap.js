import { purgeApiCachesOnBoot } from "./responseCache";
import { replayOfflineMutationQueue } from "./installOfflineApi";

const SYNC_MS = 12_000;

export function initOfflineBootstrap() {
  if (typeof window === "undefined") return () => {};

  purgeApiCachesOnBoot();

  const tick = () => {
    if (navigator.onLine) {
      void replayOfflineMutationQueue();
    }
  };

  window.addEventListener("online", tick);
  const id = window.setInterval(tick, SYNC_MS);

  return () => {
    window.removeEventListener("online", tick);
    window.clearInterval(id);
  };
}
