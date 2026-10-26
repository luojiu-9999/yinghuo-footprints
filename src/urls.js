// Persist canonical /assets/... references in records/backups. Only resolve their
// deployment prefix at the network/render boundary, so old backups stay portable.
export function publicURL(source) {
  if (typeof source !== 'string') return source;
  if (!source.startsWith('/assets/') && !source.startsWith('/maps/')) return source;
  return (import.meta.env?.BASE_URL || '/') + source.slice(1);
}
