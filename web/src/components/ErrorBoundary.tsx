import { Component, type ReactNode } from 'react'

// Si una parte del dashboard falla, muestra el error ahí mismo en vez de dejar toda la pantalla en blanco.
export class ErrorBoundary extends Component<{ children: ReactNode; label: string; onClose?: () => void }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.label}]`, error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
        <div className="font-medium">Algo falló en {this.props.label}.</div>
        <div className="mt-1 font-mono text-xs opacity-80">{this.state.error.message}</div>
        <div className="mt-3 flex gap-2">
          <button className="rounded-lg border border-red-300 px-3 py-1 text-xs dark:border-red-800" onClick={() => location.reload()}>
            Recargar
          </button>
          {this.props.onClose && (
            <button className="rounded-lg border border-red-300 px-3 py-1 text-xs dark:border-red-800" onClick={this.props.onClose}>
              Cerrar
            </button>
          )}
        </div>
      </div>
    )
  }
}
