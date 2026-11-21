import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; compacto?: boolean },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; compacto?: boolean }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Error inesperado en la aplicación.',
    };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary capturó un error de renderizado:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      const errorDeCarga = /dynamically imported module|loading chunk|importing a module script failed/i.test(this.state.errorMessage);
      return (
        <div className={`${this.props.compacto ? 'py-16' : 'min-h-screen'} bg-paper text-ink flex items-center justify-center p-6`}>
          <div className="max-w-md w-full bg-surface border border-rule rounded-2xl p-6 shadow-sm space-y-4 text-center">
            <h1 className="text-xl font-extrabold text-ink">Ocurrió un problema inesperado</h1>
            <p className="text-sm text-ink-muted">
              {errorDeCarga ? 'No se pudo cargar esta pantalla (la aplicación pudo haberse actualizado o la conexión falló). Recargá la página para continuar.' : 'La vista encontró un error y se detuvo de forma segura. Podés reintentar o recargar la aplicación.'}
            </p>
            <div className="flex items-center justify-center gap-2.5 pt-1">
              {!errorDeCarga && (
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, errorMessage: '' })}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-rule text-sm font-bold text-ink-2 hover:bg-paper-2 cursor-pointer"
              >
                Reintentar
              </button>
              )}
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-brand text-brand-contrast text-sm font-bold hover:opacity-90 cursor-pointer"
              >
                Recargar página
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
