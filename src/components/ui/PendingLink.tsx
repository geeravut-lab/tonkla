"use client";
import Link, { useLinkStatus } from "next/link";
import { useEffect, type ComponentProps, type ReactNode } from "react";
import { Spinner } from "./Spinner";
import { navStore } from "./nav-store";

function Inner({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  const { pending } = useLinkStatus();
  useEffect(() => {
    if (!pending) return;
    navStore.begin();
    return () => navStore.end();
  }, [pending]);
  return (
    <>
      {icon !== undefined ? pending ? <Spinner /> : icon : null}
      {children}
      {icon === undefined && pending ? <Spinner /> : null}
      {pending ? <span className="sr-only" role="status" /> : null}
    </>
  );
}

type Props = Omit<ComponentProps<typeof Link>, "children"> & {
  /** Shown while idle; replaced by a spinner while the navigation is pending. */
  icon?: ReactNode;
  children: ReactNode;
};

/** The only way to render an in-app link: shows a spinner where the user pressed until the next page is ready. */
export function PendingLink({ icon, children, ...rest }: Props) {
  return (
    <Link {...rest} data-pending-link="">
      <Inner icon={icon}>{children}</Inner>
    </Link>
  );
}
