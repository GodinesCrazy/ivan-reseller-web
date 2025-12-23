import { Link } from 'react-router-dom';
import { Search, BookOpen, Rocket, Shield, Wrench, Code, FileText } from 'lucide-react';
import { DOCS_REGISTRY, getDocsByCategory } from '@/components/help/DocsRegistry';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useState, useMemo } from 'react';

const categoryIcons = {
  'getting-started': Rocket,
  deployment: Rocket,
  security: Shield,
  guides: BookOpen,
  troubleshooting: Wrench,
  architecture: Code,
};

const categoryLabels = {
  'getting-started': 'Getting Started',
  deployment: 'Deployment',
  security: 'Security',
  guides: 'Guides',
  troubleshooting: 'Troubleshooting',
  architecture: 'Architecture',
};

/**
 * Página que lista toda la documentación enterprise con búsqueda y categorías
 * Ruta: /help/docs
 */
export default function DocsList() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredDocs = useMemo(() => {
    let docs = DOCS_REGISTRY;

    // Filtrar por categoría
    if (selectedCategory) {
      docs = docs.filter((doc) => doc.category === selectedCategory);
    }

    // Filtrar por búsqueda
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      docs = docs.filter(
        (doc) =>
          doc.title.toLowerCase().includes(query) ||
          doc.description.toLowerCase().includes(query) ||
          doc.slug.toLowerCase().includes(query)
      );
    }

    return docs;
  }, [searchQuery, selectedCategory]);

  const categories = useMemo(() => {
    const cats = new Set(DOCS_REGISTRY.map((doc) => doc.category));
    return Array.from(cats);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Documentación Técnica</h1>
          <p className="text-gray-600 text-lg">
            Guías completas para desarrollo, despliegue y operación de Ivan Reseller
          </p>
        </div>

        {/* Search and Filters */}
        <div className="mb-6 space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar documentación..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Category Filters */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedCategory === null
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Todas
            </button>
            {categories.map((category) => {
              const Icon = categoryIcons[category] || FileText;
              const count = getDocsByCategory(category).length;
              return (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    selectedCategory === category
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {categoryLabels[category]} ({count})
                </button>
              );
            })}
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDocs.map((doc) => {
              const CategoryIcon = categoryIcons[doc.category] || FileText;
              return (
                <Link
                  key={doc.slug}
                  to={`/help/docs/${doc.slug}`}
                  className="block"
                >
                  <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                    <CardHeader>
                      <div className="flex items-start justify-between mb-2">
                        <CategoryIcon className="w-6 h-6 text-blue-600" />
                        <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                          {categoryLabels[doc.category]}
                        </span>
                      </div>
                      <CardTitle className="text-lg">{doc.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-600">{doc.description}</p>
                      <div className="mt-4 flex items-center text-blue-600 text-sm font-medium">
                        Leer documentación →
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

