import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/services/api';
import { useAuthStore } from '@stores/authStore';

interface SetupStatus {
  setupRequired: boolean;
  configuredCount: number;
  totalCount: number;
  hasMarketplace: boolean;
  hasSearchAPI: boolean;
  missingRequirements: {
    marketplace: boolean;
    searchAPI: boolean;
  };
  message: string;
}

export default function SetupRequired() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    checkSetupStatus();
  }, []);

  const checkSetupStatus = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/setup-status');
      const data = response.data;
      
      if (!data.setupRequired) {
        // Setup completo, redirigir al dashboard
        navigate('/dashboard', { replace: true });
        return;
      }
      
      setSetupStatus(data);
    } catch (error: any) {
      console.error('Error checking setup status:', error);
      // Si falla, asumir que setup está completo (mejor mostrar dashboard)
      navigate('/dashboard', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const handleGoToSettings = () => {
    navigate('/api-settings');
  };

  const handleRefresh = async () => {
    setChecking(true);
    await checkSetupStatus();
    setChecking(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 mx-auto mb-4 rounded-full border-4 border-gray-300 border-t-blue-600 animate-spin" />
          <p className="text-gray-600">Verificando configuración...</p>
        </div>
      </div>
    );
  }

  if (!setupStatus) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 rounded-full mb-4">
            <svg
              className="w-10 h-10 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Configuración Requerida
          </h1>
          <p className="text-gray-600">
            Necesitas configurar tus APIs para comenzar a usar el sistema
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            ¿Qué necesitas configurar?
          </h2>
          <div className="space-y-4">
            {setupStatus.missingRequirements.marketplace && (
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg
                    className="w-6 h-6 text-red-500 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">
                    Marketplace (eBay, Amazon o MercadoLibre)
                  </p>
                  <p className="text-sm text-gray-600">
                    Necesario para publicar productos
                  </p>
                </div>
              </div>
            )}
            {setupStatus.missingRequirements.searchAPI && (
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg
                    className="w-6 h-6 text-red-500 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">
                    API de Búsqueda (AliExpress Affiliate, ScraperAPI o ZenRows)
                  </p>
                  <p className="text-sm text-gray-600">
                    Necesario para buscar productos y oportunidades
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {setupStatus.configuredCount > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-green-800">
              ✅ Ya tienes {setupStatus.configuredCount} de {setupStatus.totalCount} APIs configuradas
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={handleGoToSettings}
            className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-md"
          >
            Configurar APIs
          </button>
          <button
            onClick={handleRefresh}
            disabled={checking}
            className="flex-1 bg-gray-200 text-gray-800 px-6 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {checking ? 'Verificando...' : 'Verificar de nuevo'}
          </button>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            ¿Necesitas ayuda?{' '}
            <a
              href="/help"
              className="text-blue-600 hover:text-blue-700 underline"
            >
              Consulta la documentación
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

