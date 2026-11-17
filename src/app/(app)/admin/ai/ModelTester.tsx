"use client";
import { useState } from "react";
import { fetchModels, testAiModel } from "@/app/actions/ai";
import { fmt } from "@/i18n";
import { useT } from "@/i18n/client";
import { PendingButton } from "@/components/ui/PendingButton";

/** Test a provider+model directly (no user data), and look up the models the provider really offers. */
export function ModelTester({ provider, label }: { provider: string; label: string }) {
  const t = useT();
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[] | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function test() {
    setResult(null);
    const r = await testAiModel(provider, model.trim());
    setResult(r.ok ? { ok: true, text: fmt(t.ai_test_ok, { ms: r.ms }) } : { ok: false, text: fmt(t.ai_test_fail, { error: r.error ?? "?" }) });
  }
  async function load() {
    setModels(await fetchModels(provider));
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-medium">
          {label}
          <input value={model} onChange={(e) => setModel(e.target.value)} list={`models-${provider}`} maxLength={80} autoComplete="off" className="min-h-12 rounded-control border-2 border-field-border bg-surface px-3 text-base" />
        </label>
        <datalist id={`models-${provider}`}>{(models ?? []).map((m) => <option key={m} value={m} />)}</datalist>
        <PendingButton variant="secondary" pendingLabel={t.ai_testing} onClick={test} disabled={!model.trim()} className="!min-h-12">
          {t.ai_test}
        </PendingButton>
        <PendingButton variant="secondary" pendingLabel={t.loading} onClick={load} className="!min-h-12">
          {t.ai_models}
        </PendingButton>
      </div>
      {models !== null && models.length === 0 ? <p className="text-sm text-muted">{t.ai_models_empty}</p> : null}
      {models && models.length > 0 ? <p className="text-sm break-words text-muted">{models.join(" · ")}</p> : null}
      <div aria-live="polite" className="min-h-6 text-sm">
        {result ? <p role={result.ok ? "status" : "alert"} className={result.ok ? "font-medium text-success-fg" : "font-medium text-danger-fg"}>{result.ok ? "✓" : "⚠"} {result.text}</p> : null}
      </div>
    </div>
  );
}
