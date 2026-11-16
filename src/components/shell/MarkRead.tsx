"use client";
import { useEffect } from "react";
import { markRead } from "@/app/actions/comm";

/** Marks an announcement as read once it has been shown. */
export function MarkRead({ id }: { id: string }) {
  useEffect(() => {
    void markRead(id);
  }, [id]);
  return null;
}
