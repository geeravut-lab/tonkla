import "server-only";
// Narrow public face of the settings store (service-role access stays inside src/server/privileged).
export { getSetting, setSetting, clearSettingsCache } from "@/server/privileged/settings";
