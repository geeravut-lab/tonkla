export function SkipLink({ label }: { label: string }) {
  return (
    <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[200] focus:rounded-control focus:bg-surface focus:px-4 focus:py-2">
      {label}
    </a>
  );
}
