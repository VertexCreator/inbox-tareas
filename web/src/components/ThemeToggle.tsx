import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

function current(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

// Cambia entre modo claro y oscuro al instante y lo recuerda en este navegador.
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(current)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem('tema', theme)
    } catch {
      // sin almacenamiento (ventana privada): el tema vale solo para esta visita
    }
  }, [theme])

  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-300 text-stone-600 transition hover:bg-stone-100 active:scale-95 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800 ${className}`}
      aria-label={next === 'dark' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
      title={next === 'dark' ? 'Modo oscuro' : 'Modo claro'}
    >
      {theme === 'dark' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  )
}
