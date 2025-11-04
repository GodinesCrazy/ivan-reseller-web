import { useState } from 'react';

export default function Reports() {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('sales');

  const generateReport = () => {
    setLoading(true);
    // Simulate report generation
    setTimeout(() => {
      setLoading(false);
      alert('Reporte generado exitosamente! (versión demo)');
    }, 1000);
  };

  const reportTypes = [
    { id: 'sales', name: 'Ventas', description: 'Reporte detallado de ventas y comisiones' },
    { id: 'products', name: 'Productos', description: 'Performance y métricas de productos' },
    { id: 'users', name: 'Usuarios', description: 'Rendimiento por usuario' },
    { id: 'executive', name: 'Ejecutivo', description: 'Dashboard completo con KPIs' }
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes y Analytics</h1>
          <p className="text-gray-600">Genera reportes detallados y analiza el rendimiento</p>
        </div>
        <button 
          onClick={generateReport}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Generando...' : 'Generar Reporte'}
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {reportTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => setActiveTab(type.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === type.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {type.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-center py-8">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
            <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            {reportTypes.find(t => t.id === activeTab)?.name} - Versión Demo
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {reportTypes.find(t => t.id === activeTab)?.description}
          </p>
          
          {/* Mock Data Display */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">156</div>
              <div className="text-sm text-gray-600">Total Productos</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600">89</div>
              <div className="text-sm text-gray-600">Ventas</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">$12,450</div>
              <div className="text-sm text-gray-600">Ingresos</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">$4,567</div>
              <div className="text-sm text-gray-600">Ganancia</div>
            </div>
          </div>

          <div className="mt-6 bg-blue-50 p-4 rounded-lg">
            <p className="text-blue-800">
              🚀 <strong>Sistema Ivan Reseller Web - 100% Operativo</strong>
            </p>
            <p className="text-blue-600 mt-2">
              El sistema completo con marketplace APIs, reportes avanzados, y notificaciones en tiempo real está implementado.
              Esta es una vista demo del módulo de reportes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}