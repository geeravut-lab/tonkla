import { defineConfig, globalIgnores } from "eslint/config";
import next from "eslint-config-next";
import nextTs from "eslint-config-next/typescript";

const UI = "src/components/ui/**";

export default defineConfig([
  ...next,
  ...nextTs,
  globalIgnores([".next/**", "node_modules/**", "out/**", "coverage/**", "next-env.d.ts", "docs/**", "playwright-report/**", "test-results/**"]),
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // No hard-coded UI text: everything goes through the dictionary.
      "react/jsx-no-literals": ["error", { noStrings: false, allowedStrings: ["·", "•", "/", "(", ")", "-", "—", "|", "…", ":", "⚠", "✓", "→", "👍", "📌", "🔒"], ignoreProps: true }],
      // Work-doing controls must use the shared components (spinner + double-press lock).
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='button']:not(:has(JSXAttribute[name.name='type'][value.value='button']))",
          message: "Use <PendingButton>. A bare <button> is only allowed as type=\"button\" for pure UI toggles.",
        },
        { selector: "JSXOpeningElement[name.name='form']", message: "Use <ActionForm> so the form shows pending state." },
        { selector: "JSXOpeningElement[name.name='a']", message: "Use <PendingLink> (internal) so navigation shows a spinner." },
      ],
      "no-restricted-imports": ["error", { paths: [{ name: "next/link", message: "Use <PendingLink> from components/ui." }] }],
    },
  },
  {
    // The shared components are where the raw elements live.
    files: [UI],
    rules: { "no-restricted-syntax": "off", "no-restricted-imports": "off" },
  },
  {
    // The service-role client may only be imported from privileged code and API route handlers.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/**", "src/app/api/**", "src/app/brand/**", UI],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "next/link", message: "Use <PendingLink> from components/ui." }],
          patterns: [{ group: ["@/server/privileged/*", "**/server/privileged/*"], message: "Service-role code is only importable from src/server and src/app/api." }],
        },
      ],
    },
  },
  {
    files: ["tests/**", "scripts/**", "*.config.*"],
    rules: { "react/jsx-no-literals": "off", "no-restricted-syntax": "off" },
  },
]);
