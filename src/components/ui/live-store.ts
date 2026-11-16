"use client";
// Extra live topics a page asks for (e.g. the thread it is showing). LiveSync merges them with its base topics.
const topics = new Map<string, number>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let snapshot = "";

export const liveStore = {
  add(topic: string) {
    topics.set(topic, (topics.get(topic) ?? 0) + 1);
    snapshot = [...topics.keys()].sort().join("|");
    emit();
    return () => {
      const n = (topics.get(topic) ?? 1) - 1;
      if (n <= 0) topics.delete(topic);
      else topics.set(topic, n);
      snapshot = [...topics.keys()].sort().join("|");
      emit();
    };
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  snapshot: () => snapshot,
  serverSnapshot: () => "",
};
