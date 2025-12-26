import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, HelpCircle, Loader2 } from 'lucide-react';
import MarkdownViewer from '@/components/help/MarkdownViewer';
import { loadAPIDoc, getAPIBySlug, API_DOCS_REGISTRY } from '@/components/help/APIDocsRegistry';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Página para visualizar la documentación de una API específica
 * Ruta: /help/apis/:slug
 */
export default function APIDocViewer() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiDoc = slug ? getAPIBySlug(slug) : undefined;

  useEffect(() => {
    if (!slug) {
      setError('Slug de API no proporcionado');
      setLoading(false);
      return;
    }

    loadAPIDoc(slug)
      .then((mdContent) => {
        setContent(mdContent);
        setError(null);
      })
      .catch((err) => {
        console.error('Error loading API doc:', err);
        setError('No se pudo cargar la documentación');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [slug]);

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

  if (error || !apiDoc) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="w-6 h-6 text-red-600" />
              Documentación no encontrada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">
              {error || `No se encontró documentación para "${slug}"`}
            </p>
            <Link
              to="/help/apis"
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver a la lista de APIs
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
            to="/help/apis"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a la lista de APIs
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{apiDoc.title}</h1>
          <p className="text-gray-600">{apiDoc.description}</p>
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

