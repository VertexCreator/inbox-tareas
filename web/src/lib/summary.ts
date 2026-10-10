export type Level = 'P1' | 'P2' | 'P3'

// Resúmenes viejos (solo texto): se separa la frase inicial y lo que dice de cada prioridad.
export function splitSummaryText(text: string | null | undefined) {
  const out: { headline: string; notes: Partial<Record<Level, string>> } = { headline: '', notes: {} }
  if (!text) return out
  const marks = [...text.matchAll(/\bP([123])\s*:/g)]
  if (marks.length === 0) {
    out.headline = text.trim()
    return out
  }
  out.headline = text.slice(0, marks[0].index).replace(/[\s.·]+$/, '').trim()
  marks.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length
    out.notes[`P${m[1]}` as Level] = text.slice(start, end).replace(/^\s+|[\s.]+$/g, '').trim()
  })
  return out
}

