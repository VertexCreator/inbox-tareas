import { useState, type KeyboardEvent } from 'react'

interface Props {
  id: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  tone?: 'neutral' | 'accent'
  validate?: (value: string) => string | null
  normalize?: (value: string) => string
}

// Escribes y pulsas Enter (o coma) para agregar; la × quita. Retroceso con el campo vacío borra la última.
export function TagInput({ id, values, onChange, placeholder = 'Agregar…', tone = 'neutral', validate, normalize }: Props) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const add = () => {
    const raw = draft.trim().replace(/,$/, '').trim()
    if (!raw) return
    const v = normalize ? normalize(raw) : raw
    const problem = validate?.(v)
    if (problem) return setError(problem)
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) return setError('Ya está en la lista.')
    onChange([...values, v])
    setDraft('')
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add()
    } else if (e.key === 'Backspace' && !draft && values.length) {
      onChange(values.slice(0, -1))
    }
  }

  const chip =
    tone === 'accent'
      ? 'bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-200'
      : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200'

  return (
    <div>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-2 py-1.5 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-stone-700 dark:bg-stone-900">
        {values.map((v) => (
          <span key={v} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${chip}`}>
            {v}
            <button
              type="button"
              className="leading-none opacity-60 hover:opacity-100"
              onClick={() => onChange(values.filter((x) => x !== v))}
              aria-label={`Quitar ${v}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          className="min-w-32 flex-1 bg-transparent text-sm outline-none"
          placeholder={values.length ? '' : placeholder}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setError(null)
          }}
          onKeyDown={onKey}
          onBlur={add}
        />
      </div>
      {error && <div className="mt-1 text-[13px] text-red-600 dark:text-red-400">{error}</div>}
    </div>
  )
}
