export function withBase(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const base = import.meta.env.BASE_URL === "/" ? "" : import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}${normalizedPath}`;
}
