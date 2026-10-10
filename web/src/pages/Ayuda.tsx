import { useMemo } from 'react'
import { marked } from 'marked'
import manual from '../content/manual.md?raw'

// El manual vive en src/content/manual.md (es el mismo que se lee en el repositorio).
export function Ayuda() {
  const html = useMemo(() => marked.parse(manual, { async: false }) as string, [])
  const sections = useMemo(() => [...manual.matchAll(/^## (.+)$/gm)].map((m) => m[1]), [])

  return (
    <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav className="hidden lg:block">
        <div className="sticky top-20 space-y-1 text-sm">
          {sections.map((s, i) => (
            <a
              key={s}
              href={`#s${i}`}
              onClick={(e) => {
                e.preventDefault()
                document.querySelectorAll('.manual h2')[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className="block rounded-md px-2 py-1 text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-900"
            >
              {s}
            </a>
          ))}
        </div>
      </nav>
      <article className="manual max-w-3xl" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
