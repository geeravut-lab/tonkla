"use client";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { liveStore } from "@/components/ui/live-store";

// Pages with long forms are never refreshed under the user's hands
const NO_REFRESH = /\/(new|compose)$/;

function userIsTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value.length > 0 && !["button", "submit", "checkbox", "radio"].includes((el as HTMLInputElement).type);
  return false;
}

/**
 * Live sync (docs/LIVE-SYNC-KNOWLEDGE.md): the database sends a content-free "ping" on a private channel when something
 * the user may care about changes; the page then re-reads through the server with the user's own rights.
 * Fallback: if the socket is not up, a cheap fingerprint endpoint is polled (slower and slower when quiet).
 * The socket client never touches the login cookies: it only uses the token the server hands it.
 */
export function LiveSync({ topics, fallbackKeys }: { topics: string[]; fallbackKeys: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const extra = useSyncExternalStore(liveStore.subscribe, liveStore.snapshot, liveStore.serverSnapshot);
  const refreshRef = useRef<() => void>(() => {});
  const pathRef = useRef(pathname);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pendingWhileHidden = false;
    function refreshSoon() {
      if (NO_REFRESH.test(pathRef.current)) return;
      clearTimeout(timer);
      timer = setTimeout(function run() {
        if (document.hidden) {
          pendingWhileHidden = true;
          return;
        }
        if (userIsTyping()) {
          timer = setTimeout(run, 3000); // never refresh under the user's fingers
          return;
        }
        router.refresh();
      }, 300);
    }
    refreshRef.current = refreshSoon;
    const onVisible = () => {
      if (!document.hidden && pendingWhileHidden) {
        pendingWhileHidden = false;
        refreshSoon();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  const all = [...new Set([...topics, ...(extra ? extra.split("|") : [])])].sort().join("|");

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    let cancelled = false;
    let client: SupabaseClient | null = null;
    const channels: RealtimeChannel[] = [];
    let connected = false;
    let poll: ReturnType<typeof setTimeout> | undefined;
    let tokenTimer: ReturnType<typeof setInterval> | undefined;
    let last: string | null = null;
    let quiet = 0;

    async function fingerprint(): Promise<void> {
      try {
        const res = await fetch(`/api/live?w=${encodeURIComponent(fallbackKeys)}`, { cache: "no-store" });
        if (res.status === 401) return; // signed out: stop asking
        const { t } = (await res.json()) as { t: string };
        if (last !== null && t !== last) {
          quiet = 0;
          refreshRef.current();
        } else quiet += 1;
        last = t; // the first answer is only a baseline
      } catch {
        /* offline: try again later */
      }
    }
    function schedulePoll() {
      clearTimeout(poll);
      if (cancelled || connected) return;
      const base = 12_000;
      const delay = Math.min(60_000, base * (quiet > 18 ? 4 : quiet > 6 ? 2 : 1));
      poll = setTimeout(async () => {
        if (!document.hidden) await fingerprint();
        schedulePoll();
      }, delay);
    }
    function setConnected(v: boolean) {
      if (connected === v) return;
      connected = v;
      if (v) {
        clearTimeout(poll);
        void fingerprint(); // catch up on whatever happened while we were not listening
      } else schedulePoll();
    }

    async function start() {
      if (!url || !anon || !all) return;
      try {
        const res = await fetch("/api/live/token", { cache: "no-store" });
        if (!res.ok) throw new Error("no token");
        const { token } = (await res.json()) as { token: string };
        if (cancelled) return;
        client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
        client.realtime.setAuth(token);
        const state = new Map<string, boolean>();
        for (const topic of all.split("|")) {
          const ch = client
            .channel(topic, { config: { private: true } })
            .on("broadcast", { event: "ping" }, () => {
              quiet = 0;
              refreshRef.current();
            })
            .subscribe((status) => {
              state.set(topic, status === "SUBSCRIBED");
              setConnected([...state.values()].every(Boolean) && state.size > 0);
            });
          channels.push(ch);
        }
        tokenTimer = setInterval(async () => {
          try {
            const r = await fetch("/api/live/token", { cache: "no-store" });
            if (r.ok) client?.realtime.setAuth(((await r.json()) as { token: string }).token);
          } catch {
            /* keep the old token until it works */
          }
        }, 45 * 60 * 1000);
      } catch {
        /* socket unavailable: fallback below */
      }
      schedulePoll();
    }
    void start();
    return () => {
      cancelled = true;
      clearTimeout(poll);
      clearInterval(tokenTimer);
      for (const ch of channels) void client?.removeChannel(ch);
    };
  }, [all, fallbackKeys]);

  return null;
}
