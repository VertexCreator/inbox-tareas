import { COLORS, COLOR_LABEL, dotClass } from './colors'

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Color">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={COLOR_LABEL[c]}
          onClick={() => onChange(c)}
          className={`h-6 w-6 rounded-full ${dotClass(c)} ${value === c ? 'ring-2 ring-stone-800 ring-offset-2 dark:ring-stone-200 dark:ring-offset-stone-950' : ''}`}
        />
      ))}
    </div>
  )
}
