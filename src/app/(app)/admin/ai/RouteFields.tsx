"use client";
import { useState } from "react";

type Provider = { key: string; label: string };
type Props = {
  providers: Provider[];
  /** Models each provider really offers (fetched on the server). An empty list means "could not load": then the model is typed. */
  models: Record<string, string[]>;
  initial: { provider: string; model: string; fbProvider: string; fbModel: string };
  defaultModel: string;
  texts: { primary: string; fallback: string; provider: string; model: string; useDefault: string; none: string; noList: string; notListed: string; pickModel: string };
};

const field = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";

/** One provider + model pair: the model is a drop-down of the provider's own list, and follows the provider. */
function Pair({ legend, providerName, modelName, providers, models, provider, model, onProvider, onModel, emptyLabel, placeholder, texts }: {
  legend: string; providerName: string; modelName: string; providers: Provider[]; models: Record<string, string[]>;
  provider: string; model: string; onProvider: (p: string) => void; onModel: (m: string) => void; emptyLabel: string; placeholder: string; texts: Props["texts"];
}) {
  const list = provider ? (models[provider] ?? []) : [];
  const inList = list.includes(model);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="font-medium">{legend}</legend>
      <select name={providerName} value={provider} onChange={(e) => onProvider(e.target.value)} aria-label={`${legend} ${texts.provider}`} className={field}>
        <option value="">{emptyLabel}</option>
        {providers.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </select>
      {!provider ? (
        <p className="min-h-12 rounded-control bg-disabled-bg px-3 py-3 text-muted">{placeholder}</p>
      ) : list.length > 0 ? (
        <select name={modelName} value={model} onChange={(e) => onModel(e.target.value)} aria-label={`${legend} ${texts.model}`} required className={field}>
          <option value="">{texts.pickModel}</option>
          {!inList && model ? <option value={model}>{model} ({texts.notListed})</option> : null}
          {list.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      ) : (
        <>
          <input name={modelName} value={model} onChange={(e) => onModel(e.target.value)} maxLength={80} required aria-label={`${legend} ${texts.model}`} className={field} />
          <p className="text-sm text-muted">{texts.noList}</p>
        </>
      )}
    </fieldset>
  );
}

export function RouteFields({ providers, models, initial, defaultModel, texts }: Props) {
  const [provider, setProvider] = useState(initial.provider);
  const [model, setModel] = useState(initial.model);
  const [fbProvider, setFbProvider] = useState(initial.fbProvider);
  const [fbModel, setFbModel] = useState(initial.fbModel);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Pair legend={texts.primary} providerName="provider" modelName="model" providers={providers} models={models} provider={provider} model={model}
        onProvider={(p) => { setProvider(p); setModel(""); }} onModel={setModel} emptyLabel={texts.useDefault} placeholder={`${texts.useDefault}: ${defaultModel}`} texts={texts} />
      <Pair legend={texts.fallback} providerName="fb_provider" modelName="fb_model" providers={providers} models={models} provider={fbProvider} model={fbModel}
        onProvider={(p) => { setFbProvider(p); setFbModel(""); }} onModel={setFbModel} emptyLabel={texts.none} placeholder={texts.none} texts={texts} />
    </div>
  );
}
