export const isFuture = (iso: string) => new Date(iso).getTime() > Date.now();
