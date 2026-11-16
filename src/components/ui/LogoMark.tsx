"use client";
import { useBrandLogo } from "./BrandContext";

/** The platform mark: the admin-uploaded logo when there is one, otherwise the built-in Tonkla mark. */
export function LogoMark({ size = 40, title }: { size?: number; title?: string }) {
  const custom = useBrandLogo();
  if (custom) {
    // eslint-disable-next-line @next/next/no-img-element -- served by our own versioned /brand/logo route; no image optimiser needed
    return <img src={custom} width={size} height={size} alt={title ?? ""} aria-hidden={title ? undefined : true} className="object-contain" style={{ width: size, height: size }} />;
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width={size} height={size} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <rect width="120" height="120" rx="28" fill="var(--tk-primary)" />
      <path d="M60 94 V58" stroke="var(--tk-surface)" strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M60 66 C34 68 22 52 24 34 C45 33 60 46 60 66 Z" fill="var(--tk-sprout)" />
      <path d="M60 58 C60 37 76 22 99 22 C100 46 84 60 60 58 Z" fill="var(--tk-surface)" />
      <circle cx="60" cy="26" r="6" fill="var(--tk-sun)" />
    </svg>
  );
}
