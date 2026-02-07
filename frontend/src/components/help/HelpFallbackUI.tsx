/**
 * UI mínima garantizada - siempre visible, nunca pantalla blanca
 */
import { BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  message?: string;
}

export function HelpFallbackUI({ message = 'Centro de ayuda en preparación. Contenido cargando.' }: Props) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg border p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center">
            <BookOpen className="w-8 h-8 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Centro de Ayuda ? Ivan Reseller</h1>
            <p className="text-gray-600 text-sm">
              Todo lo que necesitas saber sobre Ivan Reseller
            </p>
          </div>
        </div>
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="space-y-3">
          <Link
            to="/login"
            className="block w-full text-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Iniciar sesión
          </Link>
          <a
            href="mailto:soporte@ivanreseller.com"
            className="block w-full text-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Contactar soporte
          </a>
        </div>
      </div>
    </div>
  );
}
