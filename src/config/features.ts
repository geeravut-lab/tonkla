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
  // phase 2: off by default, switched on per company by its rollout wave
  anonymous_channel: { defaultEnabled: false, label: "feat_anonymous" },
  emergency: { defaultEnabled: false, label: "feat_emergency" },
  qa: { defaultEnabled: false, label: "feat_qa" },
  events: { defaultEnabled: false, label: "feat_events" },
  polls: { defaultEnabled: false, label: "feat_polls" },
  challenges: { defaultEnabled: false, label: "feat_challenges" },
  idea_library: { defaultEnabled: false, label: "feat_library" },
  recognition: { defaultEnabled: false, label: "feat_recognition" },
  knowledge_base: { defaultEnabled: false, label: "feat_kb" },
  group_dashboard: { defaultEnabled: false, label: "feat_group_dash" },
} as const satisfies Record<string, { defaultEnabled: boolean; label: DictKey }>;

export type FeatureKey = keyof typeof FEATURES;
export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

export const PHASE2_FEATURES = ["anonymous_channel", "emergency", "qa", "events", "polls", "challenges", "idea_library", "recognition", "knowledge_base", "group_dashboard"] as const;
