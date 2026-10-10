// Paleta de marcas y stickers. Clases literales para que Tailwind las incluya.
export const COLORS = ['gray', 'red', 'orange', 'amber', 'green', 'aqua', 'blue', 'violet', 'magenta'] as const
export type ColorName = (typeof COLORS)[number]

export const COLOR_LABEL: Record<ColorName, string> = {
  gray: 'Gris',
  red: 'Rojo',
  orange: 'Naranja',
  amber: 'Ámbar',
  green: 'Verde',
  aqua: 'Turquesa',
  blue: 'Azul',
  violet: 'Violeta',
  magenta: 'Magenta',
}

const CHIP: Record<ColorName, string> = {
  gray: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200',
  red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  orange: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  aqua: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200',
  blue: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  violet: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
  magenta: 'bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200',
}

const DOT: Record<ColorName, string> = {
  gray: 'bg-stone-400',
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  green: 'bg-emerald-500',
  aqua: 'bg-teal-500',
  blue: 'bg-sky-500',
  violet: 'bg-violet-500',
  magenta: 'bg-pink-500',
}

const asColor = (c: string | null | undefined): ColorName => (COLORS.includes(c as ColorName) ? (c as ColorName) : 'gray')
export const chipClass = (c: string | null | undefined) => CHIP[asColor(c)]
export const dotClass = (c: string | null | undefined) => DOT[asColor(c)]
