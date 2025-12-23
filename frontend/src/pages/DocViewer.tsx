import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import MarkdownViewer from '@/components/help/MarkdownViewer';
import { loadDoc, getDocBySlug, DOCS_REGISTRY } from '@/components/help/DocsRegistry';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Página para visualizar un documento técnico específico
 * Ruta: /help/docs/:slug
 */
export default function DocViewer() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const doc = slug ? getDocBySlug(slug) : undefined;

  useEffect(() => {
    if (!slug) {
      setError('Slug de documento no proporcionado');
      setLoading(false);
      return;
    }

    loadDoc(slug)
      .then((mdContent) => {
        setContent(mdContent);
        setError(null);
      })
      .catch((err) => {
        console.error('Error loading doc:', err);
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

  if (error || !doc) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-red-600" />
              Documentación no encontrada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">
              {error || `No se encontró documentación para "${slug}"`}
            </p>
            <Link
              to="/help/docs"
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver a la lista de documentación
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
            to="/help/docs"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a la lista de documentación
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{doc.title}</h1>
          <p className="text-gray-600">{doc.description}</p>
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

