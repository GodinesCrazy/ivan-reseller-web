import { AlertTriangle, ExternalLink, CheckCircle } from 'lucide-react';

interface ErrorMessageWithSolutionProps {
  error: string;
  errorCode?: string;
  solution?: string;
  documentationUrl?: string;
  onDismiss?: () => void;
}

export default function ErrorMessageWithSolution({
  error,
  errorCode,
  solution,
  documentationUrl,
  onDismiss
}: ErrorMessageWithSolutionProps) {
  return (
    <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-r-lg mb-4">
      <div className="flex items-start">
        <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-red-800">Error de Configuración</h3>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-red-400 hover:text-red-600 text-sm"
              >
                ✕
              </button>
            )}
          </div>
          
          <p className="mt-1 text-sm text-red-700">{error}</p>
          
          {errorCode && (
            <p className="mt-1 text-xs text-red-600 font-mono">Código: {errorCode}</p>
          )}
          
          {solution && (
            <div className="mt-3 bg-white rounded p-3 border border-red-200">
              <div className="flex items-start">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">Solución:</p>
                  <p className="mt-1 text-sm text-gray-700 whitespace-pre-line">{solution}</p>
                </div>
              </div>
            </div>
          )}
          
          {documentationUrl && (
            <a
              href={documentationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center text-sm text-red-700 hover:text-red-900 underline"
            >
              Ver documentación
              <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

