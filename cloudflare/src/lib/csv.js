function escapeCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(rows, columns) {
  const header = columns.map((c) => escapeCell(c.label || c.key)).join(',');
  const lines = rows.map((r) => columns.map((c) => escapeCell(r[c.key])).join(','));
  return [header, ...lines].join('\r\n');
}
export function csvResponse(c, filename, rows, columns) {
  return c.body(toCsv(rows, columns), 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
}
