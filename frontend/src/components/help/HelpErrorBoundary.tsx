/**
 * Error Boundary for Help Center - prevents blank page, always shows fallback UI
 */
import { Component, type ReactNode } from 'react';
import { BookOpen, AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class HelpErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[HelpErrorBoundary] Captured error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-xl shadow-lg border p-8 text-center">
            <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Centro de Ayuda ? Ivan Reseller</h1>
            <p className="text-gray-600 mb-4">
              Ocurrió un error al cargar el centro de ayuda. Por favor, intenta recargar la página.
            </p>
            <p className="text-sm text-gray-500 mb-6 font-mono break-all">
              {this.state.error.message}
            </p>
            <a
              href="https://www.ivanreseller.com/help"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Recargar
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
