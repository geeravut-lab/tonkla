"use client";
import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "sun";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type" | "children"> & {
  /** Text shown while working ("กำลังส่ง…"). Required so the screen reader and the user hear the state. */
  pendingLabel: string;
  variant?: Variant;
  /** Inside an <ActionForm> leave undefined (form status is used). Otherwise pass an async handler. */
  onClick?: () => Promise<unknown> | unknown;
  children: ReactNode;
  pending?: boolean;
};

/**
 * The only button that performs work. While pending it shows a spinner, is locked against double
 * presses, and returns to normal when the work finishes or fails.
 */
export function PendingButton({ pendingLabel, variant = "primary", onClick, children, className = "", pending: external, disabled, ...rest }: Props) {
  const { pending: formPending } = useFormStatus();
  const [own, setOwn] = useState(false);
  const pending = !!external || formPending || own;

  async function handle() {
    if (pending || !onClick) return;
    setOwn(true);
    try {
      await onClick();
    } finally {
      setOwn(false);
    }
  }

  return (
    <button
      {...rest}
      type={onClick ? "button" : "submit"}
      onClick={onClick ? handle : undefined}
      disabled={disabled || pending}
      aria-busy={pending}
      className={`tk-btn tk-btn-${variant} ${className}`}
    >
      {pending ? (
        <>
          <Spinner />
          <span>{pendingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
