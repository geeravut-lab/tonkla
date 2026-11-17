import type { DictKey } from "@/i18n";

/**
 * The list of switches lives in code. Only values that DIFFER from the default are stored.
 * Released features default to on (a missing key never turns a live feature off);
 * features of later phases default to off and are enabled per company in rollout waves.
 */
export const FEATURES = {
  announcements: { defaultEnabled: true, label: "feat_announcements" },
  reports: { defaultEnabled: true, label: "feat_reports" },
  ideas: { defaultEnabled: true, label: "feat_ideas" },
  directory: { defaultEnabled: true, label: "feat_directory" },
  line_notifications: { defaultEnabled: true, label: "feat_line" },
  company_webhooks: { defaultEnabled: true, label: "feat_webhooks" },
  ai_assistant: { defaultEnabled: false, label: "feat_ai" },
} as const satisfies Record<string, { defaultEnabled: boolean; label: DictKey }>;

export type FeatureKey = keyof typeof FEATURES;
export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];
