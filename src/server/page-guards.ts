import "server-only";
import { notFound } from "next/navigation";
import type { FeatureKey } from "@/config/features";
import { featureEnabled } from "@/server/features";

/** Pages of a switched-off feature answer 404 (never a half-working page). Server Actions use assertFeature() instead. */
export async function assertFeatureForPage(key: FeatureKey, companyId?: string | null): Promise<void> {
  if (!(await featureEnabled(key, companyId))) notFound();
}
