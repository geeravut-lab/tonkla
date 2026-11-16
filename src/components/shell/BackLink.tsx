"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { parentOf } from "@/config/parents";
import { fmt } from "@/i18n";
import { useT } from "@/i18n/client";
import { Icon } from "@/components/ui/Icon";
import { PendingLink } from "@/components/ui/PendingLink";

function Inner() {
  const pathname = usePathname();
  const from = useSearchParams().get("from");
  const t = useT();
  const parent = parentOf(pathname, from);
  if (!parent) return null;
  return (
    <PendingLink
      href={parent.href}
      icon={<Icon name="back" size={20} />}
      className="mb-3 inline-flex min-h-11 items-center gap-1 rounded-control pr-3 font-medium text-primary-hover"
    >
      {fmt(t.back_to, { name: t[parent.label] })}
    </PendingLink>
  );
}

export function BackLink() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
