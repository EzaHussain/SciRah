/** "3 hours ago", "yesterday"… */
export function timeAgo(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const t = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  if (Number.isNaN(t)) return "";
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [2592000, "month"],
    [31536000, "year"],
  ];
  let [div, unit] = units[0];
  for (const u of units) if (s >= u[0]) [div, unit] = u;
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-Math.floor(s / div), unit);
}
