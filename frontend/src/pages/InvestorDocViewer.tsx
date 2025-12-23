import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, Loader2, AlertCircle } from 'lucide-react';
import MarkdownViewer from '@/components/help/MarkdownViewer';
import { loadInvestorDoc, isInvestorDocsEnabled, INVESTOR_DOCS_REGISTRY } from '@/components/help/InvestorDocsRegistry';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@stores/authStore';
import toast from 'react-hot-toast';

/**
 * Página para visualizar un documento de inversionista específico (solo admin + feature flag)
 * Ruta: /help/investors/:slug
 */
export default function InvestorDocViewer() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { token, user } = useAuthStore();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.role?.toUpperCase() === 'ADMIN';
  const isEnabled = isInvestorDocsEnabled();
  const doc = slug ? INVESTOR_DOCS_REGISTRY.find((d) => d.slug === slug) : undefined;

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

    if (!slug) {
      setError('Slug de documento no proporcionado');
      setLoading(false);
      return;
    }

    // Cargar documento desde backend
    loadInvestorDoc(slug, token)
      .then((mdContent) => {
        setContent(mdContent);
        setError(null);
      })
      .catch((err) => {
        console.error('Error loading investor doc:', err);
        setError(err.message || 'No se pudo cargar la documentación');
        toast.error('Error al cargar el documento');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [slug, token, isAdmin, isEnabled, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Cargando documentación...</p>
        </div>
      </div>
    );
  }

  if (error || !doc || !isEnabled || !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-6 h-6 text-red-600" />
              Acceso Denegado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <p className="text-gray-700 font-medium mb-2">
                  {error || 'No tienes acceso a este documento'}
                </p>
                {!isEnabled && (
                  <p className="text-sm text-gray-600">
                    Requiere feature flag <code className="bg-gray-100 px-1 rounded">VITE_ENABLE_INVESTOR_DOCS=true</code>
                  </p>
                )}
                {!isAdmin && (
                  <p className="text-sm text-gray-600">Solo administradores pueden acceder.</p>
                )}
              </div>
            </div>
            <Link
              to="/help/investors"
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver a la lista
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            to="/help/investors"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a la lista
          </Link>
          <div className="flex items-start justify-between mb-2">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{doc.title}</h1>
              <p className="text-gray-600">{doc.description}</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm">
              <Lock className="w-4 h-4" />
              Confidencial
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-4">
            <p className="text-sm text-amber-800">
              <strong>⚠️ Confidencial:</strong> Este documento contiene información sensible. No compartir públicamente.
            </p>
          </div>
        </div>

        {/* Content */}
        <Card>
          <CardContent className="p-6">
            <MarkdownViewer content={content} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

