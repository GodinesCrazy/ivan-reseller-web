import { Link } from 'react-router-dom';
import { Home, Search, DollarSign, Settings } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-bold text-gray-300 dark:text-gray-600">404</h1>
        <h2 className="mt-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Página no encontrada
        </h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          La página que buscas no existe o ha sido movida.
        </p>
        <Link
          to="/dashboard"
          className="mt-8 inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors"
        >
          <Home className="w-5 h-5" />
          Volver al panel
        </Link>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link
            to="/opportunities"
            className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
          >
            <Search className="w-4 h-4" />
            Oportunidades
          </Link>
          <Link
            to="/sales"
            className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
          >
            <DollarSign className="w-4 h-4" />
            Ventas
          </Link>
          <Link
            to="/api-settings"
            className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
          >
            <Settings className="w-4 h-4" />
            Configuración
          </Link>
        </div>
      </div>
    </div>
  );
}
