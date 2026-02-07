/**
 * Root Error Boundary - captura cualquier error en la app y evita pantalla en blanco
 */
import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class RootErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[RootErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            backgroundColor: '#f9fafb',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div
            style={{
              maxWidth: 480,
              padding: 32,
              backgroundColor: 'white',
              borderRadius: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              textAlign: 'center',
            }}
          >
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#111827' }}>
              Centro de Ayuda ? Ivan Reseller
            </h1>
            <p style={{ color: '#6b7280', marginBottom: 16 }}>
              Ha ocurrido un error. Por favor, recarga la página o contacta soporte.
            </p>
            <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 24, wordBreak: 'break-all' }}>
              {this.state.error.message}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a
                href="/help"
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  borderRadius: 8,
                  textDecoration: 'none',
                  fontWeight: 500,
                }}
              >
                Ir al centro de ayuda
              </a>
              <a
                href="mailto:soporte@ivanreseller.com"
                style={{
                  padding: '10px 20px',
                  border: '1px solid #d1d5db',
                  color: '#374151',
                  borderRadius: 8,
                  textDecoration: 'none',
                  fontWeight: 500,
                }}
              >
                Contactar soporte
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
