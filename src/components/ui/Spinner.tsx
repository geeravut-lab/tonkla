export function Spinner({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`tk-spinner ${className}`} data-testid="spinner" />;
}
