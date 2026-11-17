"use client";
import { useSyncExternalStore } from "react";
import { installMode, type InstallMode } from "@/lib/pwa";

/** The event Chrome / Edge fire when the site can be installed. Not in the TypeScript DOM types. */
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

type Snapshot = { ready: boolean; mode: InstallMode };

const SERVER: Snapshot = { ready: false, mode: "manual" };
let deferred: InstallPromptEvent | null = null;
let installed = false;
let started = false;
let snap: Snapshot = SERVER;
const listeners = new Set<() => void>();

function standalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return installed || window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: window-controls-overlay)").matches || nav.standalone === true;
}

function recompute() {
  const next: Snapshot = { ready: true, mode: installMode({ ua: navigator.userAgent, touchPoints: navigator.maxTouchPoints ?? 0, standalone: standalone(), hasPrompt: !!deferred }) };
  if (snap.ready && snap.mode === next.mode) return;
  snap = next;
  listeners.forEach((l) => l());
}

/**
 * Starts listening once for the whole page. The browser fires `beforeinstallprompt` early, often before the menu
 * that holds the button is on screen, so the event is kept here until someone presses the button.
 */
export function startInstallListener() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own button instead of the browser's mini-bar
    deferred = e as InstallPromptEvent;
    recompute();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    recompute();
  });
  window.matchMedia("(display-mode: standalone)").addEventListener("change", recompute);
  recompute();
}

function subscribe(cb: () => void) {
  startInstallListener();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useInstall(): Snapshot {
  return useSyncExternalStore(subscribe, () => snap, () => SERVER);
}

/** Shows the browser's own install dialog. The event can be used once, so it is dropped afterwards. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const ev = deferred;
  if (!ev) return "unavailable";
  deferred = null;
  try {
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    if (outcome === "accepted") installed = true;
    return outcome;
  } finally {
    recompute();
  }
}
