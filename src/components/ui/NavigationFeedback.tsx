"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useSyncExternalStore } from "react";
import { navStore } from "./nav-store";
import { useT } from "@/i18n/client";

function Inner() {
  const pending = useSyncExternalStore(navStore.subscribe, navStore.snapshot, navStore.serverSnapshot) > 0;
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const t = useT();
  // a finished navigation changes the URL: clear anything still counted
  useEffect(() => {
    navStore.reset();
  }, [pathname, search]);
  if (!pending) return null;
  return (
    <div
      role="progressbar"
      aria-label={t.loading}
      data-testid="nav-progress"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-mint"
    >
      <div className="h-full w-2/5 bg-primary" style={{ animation: "tk-nav-bar 1s ease-in-out infinite" }} />
    </div>
  );
}

export function NavigationFeedback() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
