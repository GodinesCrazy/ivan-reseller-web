import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, FileText, Loader2, Lock, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@stores/authStore';
import { isInvestorDocsEnabled, getInvestorDocsList, type InvestorDocEntry } from '@/components/help/InvestorDocsRegistry';
import toast from 'react-hot-toast';

/**
 * Página que lista documentos de inversionistas (solo admin + feature flag)
 * Ruta: /help/investors (protegida)
 */
export default function InvestorDocsList() {
  const { token, user } = useAuthStore();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<InvestorDocEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const isAdmin = user?.role?.toUpperCase() === 'ADMIN';
  const isEnabled = isInvestorDocsEnabled();

  useEffect(() => {
    // Verificar acceso
    if (!isEnabled) {
      setError('Los documentos de inversionistas no están habilitados');
      setLoading(false);
      return;
    }

    if (!isAdmin) {
      setError('Solo los administradores pueden acceder a estos documentos');
      setLoading(false);
      return;
    }

    if (!token) {
      navigate('/login');
      return;
    }

    // Cargar lista de documentos
    getInvestorDocsList(token)
      .then((docsList) => {
        setDocs(docsList);
        setError(null);
      })
      .catch((err) => {
        console.error('Error loading investor docs:', err);
        setError(err.message || 'Error al cargar documentos');
        toast.error('No se pudieron cargar los documentos de inversionistas');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token, isAdmin, isEnabled, navigate]);

  const filteredDocs = docs.filter((doc) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      doc.title.toLowerCase().includes(query) ||
      doc.description.toLowerCase().includes(query) ||
      doc.slug.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Cargando documentos...</p>
        </div>
      </div>
    );
  }

  if (error || !isEnabled || !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-6 h-6 text-red-600" />
              Acceso Restringido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <p className="text-gray-700 font-medium mb-2">{error || 'No tienes acceso a estos documentos'}</p>
                {!isEnabled && (
                  <p className="text-sm text-gray-600">
                    Los documentos de inversionistas requieren que el feature flag{' '}
                    <code className="bg-gray-100 px-1 rounded">VITE_ENABLE_INVESTOR_DOCS</code> esté habilitado.
                  </p>
                )}
                {!isAdmin && (
                  <p className="text-sm text-gray-600">Solo los administradores pueden acceder a estos documentos.</p>
                )}
              </div>
            </div>
            <Link
              to="/help"
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800"
            >
              ← Volver al Help Center
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Documentos para Inversionistas</h1>
              <p className="text-gray-600 text-lg">
                Documentación confidencial - Solo administradores
              </p>
            </div>
            <Link
              to="/help"
              className="inline-flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              ← Volver al Help Center
            </Link>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800">
              <strong>⚠️ Confidencial:</strong> Estos documentos contienen información sensible sobre el modelo de negocio y proyecciones financieras. No compartir públicamente.
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar documentos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Results */}
        {filteredDocs.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                No se encontraron documentos que coincidan con tu búsqueda.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredDocs.map((doc) => (
              <Link
                key={doc.slug}
                to={`/help/investors/${doc.slug}`}
                className="block"
              >
                <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer border-amber-200">
                  <CardHeader>
                    <div className="flex items-start justify-between mb-2">
                      <Lock className="w-6 h-6 text-amber-600" />
                      <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full">
                        Confidencial
                      </span>
                    </div>
                    <CardTitle className="text-lg">{doc.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600">{doc.description}</p>
                    <div className="mt-4 flex items-center text-amber-600 text-sm font-medium">
                      Ver documento →
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

