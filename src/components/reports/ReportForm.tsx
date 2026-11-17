"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { findSimilar, metoo, submitReport, type Similar } from "@/app/actions/reports";
import { aiAssistReport, type ReportHelp } from "@/app/actions/aif";
import { errorText, fmt } from "@/i18n";
import { useT } from "@/i18n/client";
import { ALLOWED_MIME, MAX_FILES, MAX_FILE_BYTES, SEVERITIES } from "@/lib/reports";
import { createClient } from "@/lib/supabase/browser";
import { Icon } from "@/components/ui/Icon";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatusChip } from "./StatusChip";

export type CompanyOption = { id: string; name: string; categories: { id: string; name: string; severity: string }[] };

/** Shrinks phone photos before upload (long side 1600 px, JPEG): saves the user's data and keeps storage small. */
async function shrink(file: File): Promise<{ blob: Blob; mime: string }> {
  if (!file.type.startsWith("image/") || file.type === "image/heic") return { blob: file, mime: file.type };
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.82));
    if (blob && blob.size < file.size) return { blob, mime: "image/jpeg" };
  } catch {
    /* some formats cannot be decoded here: upload the original */
  }
  return { blob: file, mime: file.type };
}

const input = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";

export function ReportForm({ companies, aiEnabled = false }: { companies: CompanyOption[]; aiEnabled?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const company = companies.find((c) => c.id === companyId) ?? companies[0]!;
  const [category, setCategory] = useState("");
  const [aiHelp, setAiHelp] = useState<ReportHelp | null>(null);
  const [severity, setSeverity] = useState("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [impact, setImpact] = useState("");
  const [fix, setFix] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [similar, setSimilar] = useState<Similar[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<"idle" | "uploading">("idle");
  const photo = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) break;
      if (!ALLOWED_MIME.includes(f.type as (typeof ALLOWED_MIME)[number]) || f.size > MAX_FILE_BYTES * 3) {
        setError("err_invalid_file");
        continue;
      }
      next.push(f);
    }
    setFiles(next);
  }

  async function submit() {
    setError(null);
    if (title.trim().length < 3) return setError("err_invalid_input");
    const id = crypto.randomUUID();
    try {
      const attachments: { path: string; mime: string; bytes: number }[] = [];
      if (files.length) {
        setStage("uploading");
        const sb = createClient();
        for (const f of files) {
          const { blob, mime } = await shrink(f);
          if (blob.size > MAX_FILE_BYTES) throw new Error("err_invalid_file");
          const ext = mime === "image/jpeg" ? "jpg" : mime === "application/pdf" ? "pdf" : (mime.split("/")[1] ?? "bin");
          const path = `${companyId}/${id}/${crypto.randomUUID()}.${ext}`;
          const up = await sb.storage.from("report-files").upload(path, blob, { contentType: mime, upsert: false });
          if (up.error) throw new Error("err_generic");
          attachments.push({ path, mime, bytes: blob.size });
        }
      }
      const res = await submitReport({ id, company: companyId, category: category || null, severity, title, description, impact, fix, attachments });
      if (!res.ok) throw new Error(res.error);
      router.push(`/reports/${res.id}?sent=1`);
      await new Promise(() => {}); // keep the spinner until the next page shows
    } catch (e) {
      setStage("idle");
      setError((e as Error).message.startsWith("err_") ? (e as Error).message : "err_network");
    }
  }

  async function aiAssist() {
    setAiHelp(await aiAssistReport({ company: companyId, title, description, similar: similar.map((x) => ({ id: x.id, title: x.title })) }));
  }

  async function lookup() {
    if (title.trim().length < 3) return setSimilar([]);
    setSimilar(await findSimilar(companyId, title));
  }

  async function joinExisting(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    const r = await metoo(null, fd);
    if (r?.ok) {
      router.push(`/reports/${id}`);
      await new Promise(() => {});
    } else setError(r?.error ?? "err_generic");
  }

  return (
    <div className="tk-card flex max-w-2xl flex-col gap-4 p-5">
      <p className="flex items-center gap-2 rounded-control bg-info-bg px-3 py-2 text-sm text-info-fg">
        <Icon name="lock" size={16} />
        {fmt(t.rep_visible_note, { company: company.name })}
      </p>
      {companies.length > 1 ? (
        <label className="flex flex-col gap-1 font-medium">
          {t.rep_field_company}
          <select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setCategory(""); }} className={input}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="flex flex-col gap-1 font-medium">
        {t.rep_field_title}
        <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={lookup} maxLength={200} placeholder={t.rep_field_title_ph} className={input} />
      </label>

      {similar.length > 0 ? (
        <div className="rounded-control border border-sun bg-warning-bg/40 p-3" role="region" aria-label={t.rep_similar}>
          <p className="font-semibold">{t.rep_similar}</p>
          <p className="mb-2 text-sm text-muted">{t.rep_similar_help}</p>
          <ul className="flex flex-col gap-2">
            {similar.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-col">
                  <span className="font-medium">
                    {s.title}
                    {aiHelp?.ok && aiHelp.duplicates.includes(s.id) ? <span className="ml-2 rounded-full bg-sun px-2.5 py-0.5 text-xs font-semibold text-ink">{t.aif_dup}</span> : null}
                  </span>
                  <span className="flex items-center gap-2 text-sm text-muted">
                    <StatusChip status={s.status} t={t} />
                    {fmt(t.rep_metoo_count, { n: s.metoo_count })}
                  </span>
                </span>
                <PendingButton variant="secondary" pendingLabel={t.rep_metoo_saving} onClick={() => joinExisting(s.id)} className="!min-h-11">
                  {t.rep_metoo}
                </PendingButton>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {aiEnabled ? (
        <div className="flex flex-col gap-2">
          <PendingButton variant="secondary" pendingLabel={t.aif_thinking} onClick={aiAssist} className="self-start !min-h-11">
            {t.aif_report}
          </PendingButton>
          {aiHelp && !aiHelp.ok ? (
            <p role="alert" className="text-sm font-medium text-danger-fg">⚠ {errorText(aiHelp.error, t)}</p>
          ) : null}
          {aiHelp?.ok ? (
            <div className="rounded-control bg-info-bg px-3 py-2 text-sm text-info-fg">
              {aiHelp.category_id ? (
                <>
                  <p>{fmt(t.aif_report_done, { category: company.categories.find((c) => c.id === aiHelp.category_id)?.name ?? "", severity: aiHelp.severity ? (t as Record<string, string>)[`sev_${aiHelp.severity}`] ?? aiHelp.severity : "" })}</p>
                  {aiHelp.reason ? <p>{aiHelp.reason}</p> : null}
                  <PendingButton variant="secondary" pendingLabel={t.aif_thinking} onClick={() => { setCategory(aiHelp.category_id ?? ""); if (aiHelp.severity) setSeverity(aiHelp.severity); }} className="mt-2 !min-h-11">
                    {t.aif_report_apply}
                  </PendingButton>
                </>
              ) : (
                <p>{t.aif_report_none}</p>
              )}
              <p className="mt-1 text-xs">{t.aif_suggest_only}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 font-medium">
          {t.rep_field_category}
          <select value={category} onChange={(e) => { setCategory(e.target.value); const c = company.categories.find((x) => x.id === e.target.value); if (c) setSeverity(c.severity); }} className={input}>
            <option value="">{t.rep_no_category}</option>
            {company.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.rep_field_severity}
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={input}>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {(t as Record<string, string>)[`sev_${s}`]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 font-medium">
        {t.rep_field_description}
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={5000} className="w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base" />
      </label>
      <label className="flex flex-col gap-1 font-medium">
        {t.rep_field_impact}
        <textarea value={impact} onChange={(e) => setImpact(e.target.value)} rows={2} maxLength={2000} className="w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base" />
      </label>

      <div className="flex flex-col gap-2">
        <span className="font-medium">{t.rep_attach}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => photo.current?.click()} className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-control border-2 border-dashed border-field-border bg-surface font-semibold text-primary-hover">
            <Icon name="camera" />
            {t.rep_attach_photo}
          </button>
          <button type="button" onClick={() => picker.current?.click()} className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-control border-2 border-dashed border-field-border bg-surface font-semibold text-primary-hover">
            <Icon name="clip" />
            {t.rep_attach_file}
          </button>
        </div>
        <input ref={photo} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <input ref={picker} type="file" accept={ALLOWED_MIME.join(",")} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <p className="text-sm text-muted">{t.rep_attach_limit}</p>
        {files.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-control bg-mint px-3 py-1 text-sm">
                <span className="truncate">{f.name}</span>
                <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="min-h-11 px-2 font-semibold text-primary-hover">
                  {t.rep_attach_remove}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <label className="flex flex-col gap-1 font-medium">
        {t.rep_field_fix}
        <textarea value={fix} onChange={(e) => setFix(e.target.value)} rows={2} maxLength={3000} className="w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base" />
      </label>

      <div aria-live="polite" className="min-h-6 text-sm">
        {error ? <p role="alert" className="font-medium text-danger-fg">⚠ {errorText(error, t)}</p> : null}
      </div>
      <PendingButton pendingLabel={stage === "uploading" ? t.rep_uploading : t.rep_submitting} onClick={submit} className="w-full">
        {t.rep_submit}
      </PendingButton>
    </div>
  );
}
