export function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

export function fmtCost(cost: number | null): string {
  if (cost === null) return '—'
  if (cost === 0) return '$0.00'
  if (cost < 0.01) return '<$0.01'
  return '$' + cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtDate(iso: string): string {
  if (!iso || iso.length < 10) return '—'
  return iso.slice(0, 10)
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

export function shortSession(id: string): string {
  return id.length > 12 ? id.slice(0, 8) + '…' : id
}

export function projectName(cwd?: string): string {
  if (!cwd) return '—'
  const parts = cwd.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? cwd
}
