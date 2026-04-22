import { useSyncExternalStore } from "react";

let clientNowMs = Date.now();
const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof window.setInterval> | undefined;

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function alignClientClock() {
  clientNowMs = Date.now();
  emit();
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  if (intervalId === undefined) {
    const tick = () => {
      clientNowMs = Date.now();
      emit();
    };
    intervalId = window.setInterval(tick, 1000);
    queueMicrotask(tick);
  }
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0 && intervalId !== undefined) {
      window.clearInterval(intervalId);
      intervalId = undefined;
    }
  };
}

function getSnapshot() {
  return clientNowMs;
}

export function useClientNowMs(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
