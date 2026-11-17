"use client";
import type { FormHTMLAttributes, ReactNode } from "react";

type Props = Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "children"> & {
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
};

/** The only <form>. Pair it with <PendingButton>, which reads the form's pending state. */
export function ActionForm({ action, children, ...rest }: Props) {
  return (
    <form {...rest} action={action}>
      {children}
    </form>
  );
}
