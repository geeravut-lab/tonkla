"use client";
import { useState, type ReactNode } from "react";
import { Spinner } from "./Spinner";

/** Link that leaves the app (e.g. the Aivora hub): spinner from the moment it is pressed. */
export function ExternalLink({ href, children, pendingLabel, className = "", onNavigate }: { href: string; children: ReactNode; pendingLabel: string; className?: string; onNavigate?: () => void }) {
  const [pending, setPending] = useState(false);
  return (
    <a
      href={href}
      aria-busy={pending}
      onClick={(e) => {
        if (pending) return e.preventDefault();
        setPending(true);
        onNavigate?.();
      }}
      className={className}
    >
      {pending ? (
        <>
          <Spinner />
          <span>{pendingLabel}</span>
        </>
      ) : (
        children
      )}
    </a>
  );
}
