"use client";
// Tiny external store counting navigations in flight. PendingLink (and the "More" sheet)
// raise it; NavigationFeedback shows a thin progress bar while it is above zero.
let count = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const navStore = {
  begin() {
    count += 1;
    emit();
  },
  end() {
    count = Math.max(0, count - 1);
    emit();
  },
  reset() {
    if (count !== 0) {
      count = 0;
      emit();
    }
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  snapshot: () => count,
  serverSnapshot: () => 0,
};
