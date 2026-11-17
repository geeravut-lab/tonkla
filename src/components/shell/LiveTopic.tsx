"use client";
import { useEffect } from "react";
import { liveStore } from "@/components/ui/live-store";

/** Render on a page that wants live updates for one extra topic (e.g. "a:<announcement id>"). */
export function LiveTopic({ topic }: { topic: string }) {
  useEffect(() => liveStore.add(topic), [topic]);
  return null;
}
