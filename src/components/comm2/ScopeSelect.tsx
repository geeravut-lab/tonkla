import type { Dict } from "@/i18n";
import type { Session } from "@/lib/session";

/** The places this person may create things for: the whole group (central team) and the companies they coordinate or lead. */
export function manageScopes(s: Session): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const c of [...s.coordinatedCompanies, ...s.execCompanies]) seen.set(c.id, c.name);
  return [...(s.isCentral ? [{ id: "group", name: "" }] : []), ...[...seen].map(([id, name]) => ({ id, name }))];
}

export function ScopeSelect({ scopes, t }: { scopes: { id: string; name: string }[]; t: Dict }) {
  return (
    <label className="flex flex-col gap-1 font-medium">
      {t.scope_label}
      <select name="scope" className="min-h-12 rounded-control border-2 border-field-border bg-surface px-3 text-base">
        {scopes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.id === "group" ? t.scope_group : o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ScopeBadge({ company, companies, t }: { company: string | null; companies: Map<string, string>; t: Dict }) {
  return <span className="rounded-full bg-mint px-2.5 py-0.5 text-xs font-semibold">{company ? (companies.get(company) ?? "") : t.scope_badge_group}</span>;
}
