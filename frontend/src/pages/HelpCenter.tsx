import { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  BookOpen, 
  HelpCircle, 
  Rocket, 
  Settings, 
  DollarSign, 
  Globe,
  Zap,
  Shield,
  Target,
  TrendingUp,
  Users,
  Package,
  ChevronRight,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Info,
  Video,
  FileText,
  MessageCircle
} from 'lucide-react';
import { useAuthStore } from '@stores/authStore';
import { isInvestorDocsEnabled } from '@/components/help/InvestorDocsRegistry';

export default function HelpCenter() {
  const [activeSection, setActiveSection] = useState('inicio');
  const user = useAuthStore((s) => s?.user ?? null) ?? null;
  const isAdmin = user?.role?.toUpperCase() === 'ADMIN';
  let investorDocsEnabled = false;
  try {
    investorDocsEnabled = isInvestorDocsEnabled();
  } catch {
    investorDocsEnabled = false;
  }

  const sections = [
    { id: 'inicio', label: 'Inicio Rápido', icon: Rocket },
    { id: 'configuracion', label: 'Configuración', icon: Settings },
    { id: 'apis', label: 'APIs y Credenciales', icon: Shield },
    { id: 'productos', label: 'Gestión de Productos', icon: Package },
    { id: 'autopilot', label: 'Sistema Autopilot', icon: Zap },
    { id: 'oportunidades', label: 'Oportunidades', icon: Target },
    { id: 'finanzas', label: 'Finanzas y Comisiones', icon: DollarSign },
    { id: 'regional', label: 'Configuración Regional', icon: Globe },
    { id: 'usuarios', label: 'Usuarios y Roles', icon: Users },
    { id: 'reportes', label: 'Reportes y Analytics', icon: TrendingUp },
    { id: 'faq', label: 'Preguntas Frecuentes', icon: HelpCircle }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl shadow-lg p-8 mb-8 text-white">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center">
              <BookOpen className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-4xl font-bold mb-2">Centro de Ayuda – Ivan Reseller</h1>
              <p className="text-blue-100 text-lg">
                Todo lo que necesitas saber sobre Ivan Reseller. Guías, configuración y soporte.
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-4 gap-4 mt-8">
            <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
              <div className="text-3xl font-bold">11</div>
              <div className="text-blue-100 text-sm">Secciones</div>
            </div>
            <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
              <div className="text-3xl font-bold">50+</div>
              <div className="text-blue-100 text-sm">Guías</div>
            </div>
            <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
              <div className="text-3xl font-bold">24/7</div>
              <div className="text-blue-100 text-sm">Soporte</div>
            </div>
            <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
              <div className="text-3xl font-bold">100%</div>
              <div className="text-blue-100 text-sm">Actualizado</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-8">
          {/* Sidebar */}
          <div className="col-span-3">
            <div className="bg-white rounded-xl shadow-sm border sticky top-8">
              <div className="p-4 border-b">
                <h3 className="font-semibold text-gray-900">Navegación</h3>
              </div>
              <nav className="p-2">
                {sections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <button
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors mb-1 ${
                        activeSection === section.id
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-sm">{section.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Content */}
          <div className="col-span-9">
            <div className="bg-white rounded-xl shadow-sm border p-8">
              {activeSection === 'inicio' && <InicioRapido />}
              {activeSection === 'configuracion' && <Configuracion />}
              {activeSection === 'apis' && <APIsCredenciales />}
              {activeSection === 'productos' && <GestionProductos />}
              {activeSection === 'autopilot' && <SistemaAutopilot />}
              {activeSection === 'oportunidades' && <Oportunidades />}
              {activeSection === 'finanzas' && <Finanzas />}
              {activeSection === 'regional' && <ConfiguracionRegional />}
              {activeSection === 'usuarios' && <UsuariosRoles />}
              {activeSection === 'reportes' && <ReportesAnalytics />}
              {activeSection === 'faq' && <FAQ />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// SECCIÓN: INICIO RÁPIDO
// =====================================================
function InicioRapido() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">🚀 Inicio Rápido</h2>
        <p className="text-gray-600 text-lg">
          Comienza a usar Ivan Reseller Web en 5 minutos
        </p>
      </div>

      {/* Paso 1 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold text-xl flex-shrink-0">
            1
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Acceder al Sistema</h3>
            <div className="space-y-3 text-gray-700">
              <p>
                <strong>URL:</strong>{' '}
                <code className="bg-blue-100 px-2 py-1 rounded">ivanreseller.com/login</code> o{' '}
                <code className="bg-blue-100 px-2 py-1 rounded">www.ivanreseller.com/login</code>
              </p>
              <p>
                Las credenciales son provistas por el administrador. El registro público está deshabilitado. Si no recuerdas tu contraseña, contacta al administrador del sistema.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Paso 2 */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-green-600 text-white rounded-xl flex items-center justify-center font-bold text-xl flex-shrink-0">
            2
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Explorar el Dashboard</h3>
            <p className="text-gray-700 mb-3">
              Una vez dentro, verás el dashboard principal con:
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-3 rounded-lg border border-green-200">
                <CheckCircle className="w-5 h-5 text-green-600 mb-1" />
                <div className="font-medium">KPIs en tiempo real</div>
                <div className="text-sm text-gray-600">Ventas, ganancias, productos</div>
              </div>
              <div className="bg-white p-3 rounded-lg border border-green-200">
                <CheckCircle className="w-5 h-5 text-green-600 mb-1" />
                <div className="font-medium">Gráficas interactivas</div>
                <div className="text-sm text-gray-600">Visualiza tu rendimiento</div>
              </div>
              <div className="bg-white p-3 rounded-lg border border-green-200">
                <CheckCircle className="w-5 h-5 text-green-600 mb-1" />
                <div className="font-medium">Alertas importantes</div>
                <div className="text-sm text-gray-600">Notificaciones en tiempo real</div>
              </div>
              <div className="bg-white p-3 rounded-lg border border-green-200">
                <CheckCircle className="w-5 h-5 text-green-600 mb-1" />
                <div className="font-medium">Accesos rápidos</div>
                <div className="text-sm text-gray-600">A todas las funciones</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Paso 3 */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-purple-600 text-white rounded-xl flex items-center justify-center font-bold text-xl flex-shrink-0">
            3
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Configurar APIs (Opcional)</h3>
            <p className="text-gray-700 mb-3">
              Para activar todas las funcionalidades:
            </p>
            <ol className="space-y-2 text-gray-700">
              <li className="flex items-start gap-2">
                <ChevronRight className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                <span>Ve a <strong>Settings → Configuración de APIs</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                <span>Configura las APIs que necesites (ver sección "APIs y Credenciales")</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                <span>Guarda las credenciales (se encriptan automáticamente)</span>
              </li>
            </ol>
          </div>
        </div>
      </div>

      {/* Menú Principal */}
      <div>
        <h3 className="text-2xl font-bold text-gray-900 mb-4">📍 Menú de Navegación</h3>
        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: TrendingUp, title: 'Opportunities', desc: 'Productos rentables con IA' },
            { icon: Zap, title: 'Autopilot', desc: 'Sistema autónomo 24/7' },
            { icon: DollarSign, title: 'Finance', desc: 'Dashboard financiero' },
            { icon: Package, title: 'Products', desc: 'Gestión de productos' },
            { icon: Users, title: 'Users', desc: 'Gestión de usuarios' },
            { icon: Settings, title: 'Settings', desc: 'Configuración general' }
          ].map((item, idx) => (
            <div key={idx} className="bg-gray-50 border rounded-lg p-4 hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-3">
                <item.icon className="w-6 h-6 text-blue-600" />
                <div>
                  <div className="font-semibold text-gray-900">{item.title}</div>
                  <div className="text-sm text-gray-600">{item.desc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Tips */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <Info className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">💡 Tips Rápidos</h4>
            <ul className="space-y-1 text-gray-700">
              <li>• El sistema funciona parcialmente sin APIs configuradas (funcionalidad básica)</li>
              <li>• Para usar IA: Solo necesitas GROQ API Key (gratis, sin tarjeta de crédito)</li>
              <li>• Para vender: Configura eBay, Amazon o MercadoLibre (OAuth 2.0)</li>
              <li>• Para buscar productos: Configura AliExpress (sesión manual) y ScraperAPI/ZenRows (opcional)</li>
              <li>• Para validar demanda real: Configura Google Trends API (SerpAPI) - opcional pero recomendado</li>
              <li>• Todas las credenciales se encriptan con AES-256-GCM antes de guardarse</li>
              <li>• El dashboard se actualiza en tiempo real con Socket.IO</li>
              <li>• Puedes tener credenciales en Sandbox y Production simultáneamente</li>
              <li>• El sistema de oportunidades valida automáticamente demanda real con Google Trends</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// SECCIÓN: CONFIGURACIÓN
// =====================================================
function Configuracion() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">⚙️ Configuración del Sistema</h2>
        <p className="text-gray-600 text-lg">
          Personaliza Ivan Reseller Web según tus necesidades
        </p>
      </div>

      {/* Settings Hub */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border rounded-xl p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">🎯 Hub de Configuración</h3>
        <p className="text-gray-700 mb-4">
          Accede a <strong>Settings</strong> desde el menú lateral para ver todas las opciones:
        </p>
        <div className="grid grid-cols-2 gap-4">
          {[
            { title: 'Configuración de APIs', desc: 'Credenciales de marketplaces' },
            { title: 'Seguridad', desc: 'Contraseñas y autenticación' },
            { title: 'Base de Datos', desc: 'Conexión y backups' },
            { title: 'Sistema Autopilot', desc: 'Operación autónoma 24/7' },
            { title: 'Configuración Regional', desc: 'Idioma, moneda, zona horaria' },
            { title: 'Notificaciones', desc: 'Alertas por email y push' },
            { title: 'Perfil de Usuario', desc: 'Información personal' },
            { title: 'Permisos y Roles', desc: 'Control de acceso' }
          ].map((item, idx) => (
            <div key={idx} className="bg-white border rounded-lg p-4">
              <div className="font-semibold text-gray-900 mb-1">{item.title}</div>
              <div className="text-sm text-gray-600">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Configuración Inicial */}
      <div>
        <h3 className="text-2xl font-bold text-gray-900 mb-4">🚀 Configuración Inicial Recomendada</h3>
        <div className="space-y-4">
          <div className="bg-white border border-green-200 rounded-lg p-5">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
              <div>
                <div className="font-semibold text-gray-900 mb-2">1. Cambiar contraseña por defecto</div>
                <p className="text-gray-600 text-sm">
                  Ve a Settings → Perfil de Usuario y cambia tu contraseña
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-blue-200 rounded-lg p-5">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-6 h-6 text-blue-600 flex-shrink-0" />
              <div>
                <div className="font-semibold text-gray-900 mb-2">2. Configurar región</div>
                <p className="text-gray-600 text-sm">
                  Settings → Regional Config: Selecciona tu país, moneda e idioma
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-purple-200 rounded-lg p-5">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-6 h-6 text-purple-600 flex-shrink-0" />
              <div>
                <div className="font-semibold text-gray-900 mb-2">3. Configurar APIs (si es necesario)</div>
                <p className="text-gray-600 text-sm">
                  Settings → Configuración de APIs: Agrega credenciales de marketplaces
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-yellow-200 rounded-lg p-5">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-6 h-6 text-yellow-600 flex-shrink-0" />
              <div>
                <div className="font-semibold text-gray-900 mb-2">4. Configurar notificaciones</div>
                <p className="text-gray-600 text-sm">
                  Settings → Notificaciones: Activa alertas importantes
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Variables de Entorno */}
      <div className="bg-gray-50 border rounded-xl p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">🔧 Variables de Entorno (Backend)</h3>
        <p className="text-gray-700 mb-4">
          Si eres administrador del sistema, estas son las variables importantes:
        </p>
        <div className="bg-white border rounded-lg p-4 space-y-2 text-sm font-mono">
          <div><span className="text-gray-600"># Base de datos</span></div>
          <div>DATABASE_URL=<span className="text-blue-600">tu_conexion_db</span></div>
          <div className="mt-3"><span className="text-gray-600"># Autenticación</span></div>
          <div>JWT_SECRET=<span className="text-blue-600">tu_secret_key</span></div>
          <div className="mt-3"><span className="text-gray-600"># APIs (ver sección APIs)</span></div>
          <div>GROQ_API_KEY=<span className="text-blue-600">tu_groq_key</span></div>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// SECCIÓN: APIs Y CREDENCIALES
// =====================================================
function APIsCredenciales() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">🔑 APIs y Credenciales</h2>
        <p className="text-gray-600 text-lg">
          Configura las APIs de marketplaces y servicios
        </p>
      </div>

      {/* Cómo acceder */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-3">📍 Cómo Acceder</h3>
        <ol className="space-y-2 text-gray-700">
          <li className="flex items-start gap-2">
            <span className="font-bold text-blue-600">1.</span>
            <span>Menu lateral → <strong>Settings</strong></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold text-blue-600">2.</span>
            <span>Click en <strong>"Configuración de APIs"</strong></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold text-blue-600">3.</span>
            <span>Verás tarjetas para cada API disponible</span>
          </li>
        </ol>
      </div>

      {/* Documentación Técnica */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-2xl font-bold text-gray-900">📚 Documentación Técnica</h3>
          <Link
            to="/help/docs"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <FileText className="w-4 h-4" />
            Ver toda la documentación
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link to="/help/docs/setup-local" className="block">
            <div className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow">
              <h4 className="font-semibold text-gray-900 mb-2">🚀 Setup Local</h4>
              <p className="text-sm text-gray-600">Configurar entorno de desarrollo</p>
            </div>
          </Link>
          <Link to="/help/docs/deployment-railway" className="block">
            <div className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow">
              <h4 className="font-semibold text-gray-900 mb-2">🚀 Deployment Railway</h4>
              <p className="text-sm text-gray-600">Desplegar en producción</p>
            </div>
          </Link>
          <Link to="/help/docs/security" className="block">
            <div className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow">
              <h4 className="font-semibold text-gray-900 mb-2">🔐 Security Guide</h4>
              <p className="text-sm text-gray-600">Seguridad y mejores prácticas</p>
            </div>
          </Link>
          <Link to="/help/docs/user-guide" className="block">
            <div className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow">
              <h4 className="font-semibold text-gray-900 mb-2">📘 User Guide</h4>
              <p className="text-sm text-gray-600">Guía para usuarios finales</p>
            </div>
          </Link>
          <Link to="/help/docs/admin-guide" className="block">
            <div className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow">
              <h4 className="font-semibold text-gray-900 mb-2">👨‍💼 Admin Guide</h4>
              <p className="text-sm text-gray-600">Guía para administradores</p>
            </div>
          </Link>
          <Link to="/help/docs/troubleshooting" className="block">
            <div className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow">
              <h4 className="font-semibold text-gray-900 mb-2">🔧 Troubleshooting</h4>
              <p className="text-sm text-gray-600">Solución de problemas</p>
            </div>
          </Link>
        </div>
      </div>

      {/* APIs Disponibles */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-2xl font-bold text-gray-900">🌐 APIs Disponibles</h3>
          <Link
            to="/help/apis"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <FileText className="w-4 h-4" />
            Ver todas las guías de APIs
          </Link>
        </div>
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm mb-4">
          <p className="font-semibold mb-1">Resumen rápido</p>
          <ul className="space-y-1">
            <li>
              <strong>Críticas:</strong> AliExpress (origen), eBay (comparador), ScraperAPI o ZenRows (anti-bloqueo) y Groq
              (IA). Si faltan, el sistema no podrá evaluar oportunidades con precisión.
            </li>
            <li>
              <strong>Recomendada para validación:</strong> Google Trends API (SerpAPI) - Opcional pero recomendada para validar demanda real de productos. 
              Si no se configura, el sistema usará análisis de datos internos como fallback.
            </li>
            <li>
              <strong>Recomendadas (APIs oficiales):</strong> AliExpress Affiliate API (para scraping rápido) y AliExpress Dropshipping API 
              (para compras automatizadas). Son gratuitas, más rápidas y confiables que el método manual. Ver secciones específicas abajo.
            </li>
            <li>
              <strong>Opcionales:</strong> Amazon y MercadoLibre. Son recomendadas para mejorar la cobertura, pero si no las
              configuras sólo verás avisos ámbar y seguiremos trabajando con las fuentes disponibles.
            </li>
          </ul>
        </div>
        <div className="space-y-4">
          {/* AliExpress */}
          <div className="border rounded-xl p-6 bg-gradient-to-r from-red-50 via-orange-50 to-amber-50">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-lg font-semibold text-gray-900">AliExpress Auto-Purchase</h4>
                <span className="text-sm text-red-500 font-medium">Fuente primaria (obligatoria)</span>
              </div>
            </div>
            <p className="text-gray-700 mb-3">
              Necesitamos email, password y cookies vigentes para automatizar la navegación. El formulario de “Other
              Credentials” y la tarjeta de AliExpress en `Settings → Configuración de APIs` trabajan juntos.
            </p>
            <div className="bg-white border rounded-lg p-4 space-y-3 text-sm text-gray-700">
              <div className="font-semibold text-gray-900">Campos obligatorios</div>
              <ul className="list-disc list-inside space-y-1">
                <li>Email / Username</li>
                <li>Password</li>
                <li>Cookies de sesión (se capturan con el snippet automático)</li>
              </ul>
              <div className="font-semibold text-gray-900 pt-2 border-t">Cómo guardar las cookies</div>
              <ol className="list-decimal list-inside space-y-1">
                <li>En la tarjeta AliExpress, pulsa <strong>Guardar cookies manualmente</strong>.</li>
                <li>Haz clic en <strong>Abrir login de AliExpress</strong> y asegúrate de que tu cuenta esté iniciada.</li>
                <li>
                  En la pestaña de AliExpress abre la consola (<code>F12 → Console</code>), escribe{' '}
                  <code>allow pasting</code> (o <code>void 0</code> en Edge) y presiona Enter.
                </li>
                <li>
                  Copia el <strong>Snippet automático</strong> del modal y pégalo en esa consola. Cuando veas{' '}
                  <code>✅ Cookies enviadas. Vuelve a la plataforma para confirmar.</code>, regresa al panel: la tarjeta se
                  actualizará a “Sesión activa”.
                </li>
              </ol>
              <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 text-xs">
                <strong>Tip:</strong> El snippet sólo funciona si lo ejecutas en la pestaña <em>de AliExpress</em>. Si ves
                "No se encontraron cookies en esta pestaña", significa que lo ejecutaste en la pestaña del panel.
              </div>
            </div>
          </div>

          {/* AliExpress Affiliate API */}
          <div className="border rounded-xl p-6 bg-gradient-to-r from-red-50 via-orange-50 to-yellow-50">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-lg font-semibold text-gray-900">AliExpress Affiliate API (Portals API)</h4>
                <span className="text-sm text-orange-600 font-medium">Recomendada para scraping y extracción de datos</span>
              </div>
              <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                Gratis
              </span>
            </div>
            <p className="text-gray-700 mb-3">
              API oficial de AliExpress para extraer datos de productos, precios, imágenes y costos de envío de forma oficial y gratuita. 
              El sistema usa esta API primero antes del scraping nativo para mayor velocidad y confiabilidad.
            </p>
            <div className="bg-white border rounded-lg p-4 space-y-3">
              <div className="text-sm">
                <strong>Campos requeridos:</strong>
              </div>
              <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
                <li><strong>App Key:</strong> Clave de aplicación obtenida de AliExpress Open Platform</li>
                <li><strong>App Secret:</strong> Secret para calcular la firma de las peticiones</li>
                <li><strong>Tracking ID:</strong> ID de afiliado (opcional, para generar enlaces de afiliado)</li>
                <li><strong>Sandbox:</strong> Marca si usas ambiente de pruebas (false para producción)</li>
              </ul>
              <div className="pt-2 border-t text-sm text-gray-700 space-y-2">
                <div className="font-semibold text-gray-900">Pasos para obtener las credenciales:</div>
                <ol className="list-decimal list-inside space-y-2">
                  <li><strong>Crear cuenta en AliExpress Portals:</strong>
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                      <li>Ve a <a href="https://portals.aliexpress.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">portals.aliexpress.com <ExternalLink className="w-3 h-3 inline" /></a></li>
                      <li>Crea una cuenta de afiliado (si aún no la tienes)</li>
                    </ul>
                  </li>
                  <li><strong>Registrarse como desarrollador:</strong>
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                      <li>Ve a <a href="https://console.aliexpress.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">console.aliexpress.com <ExternalLink className="w-3 h-3 inline" /></a></li>
                      <li>Regístrate como desarrollador (acepta el Open Platform Agreement)</li>
                      <li>Completa la información de empresa y objetivos de integración</li>
                    </ul>
                  </li>
                  <li><strong>Crear aplicación:</strong>
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                      <li>En la consola, ve a <strong>"App Management"</strong> → <strong>"Create App"</strong></li>
                      <li>Selecciona el tipo: <strong>"Affiliate API"</strong></li>
                      <li>Completa el formulario con información de tu aplicación</li>
                      <li>Describe tu caso de uso: "Comparador de precios y sistema de dropshipping automatizado"</li>
                    </ul>
                  </li>
                  <li><strong>Esperar aprobación:</strong>
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                      <li>AliExpress revisará tu solicitud (1-2 días hábiles típicamente)</li>
                      <li>Recibirás una notificación cuando sea aprobada o denegada</li>
                    </ul>
                  </li>
                  <li><strong>Obtener credenciales:</strong>
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                      <li>Una vez aprobada, ve a <strong>"App Management"</strong> → Tu aplicación</li>
                      <li>Copia el <strong>App Key</strong> y el <strong>App Secret</strong></li>
                      <li>También verás el límite de flujo aprobado (típicamente ~5000 llamadas)</li>
                    </ul>
                  </li>
                  <li><strong>Obtener Tracking ID (opcional):</strong>
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                      <li>Desde tu cuenta de AliExpress Portals</li>
                      <li>En la sección de configuración, encuentra tu <strong>Tracking ID</strong></li>
                      <li>Úsalo para generar enlaces de afiliado (si deseas monetizar)</li>
                    </ul>
                  </li>
                  <li><strong>Configurar en Ivan Reseller:</strong>
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                      <li>Ve a <strong>Settings → Configuración de APIs</strong></li>
                      <li>Busca la tarjeta <strong>"AliExpress Affiliate API"</strong></li>
                      <li>Ingresa:
                        <ul className="list-circle list-inside ml-4 mt-1">
                          <li><strong>App Key:</strong> Pega el App Key copiado</li>
                          <li><strong>App Secret:</strong> Pega el App Secret copiado</li>
                          <li><strong>Tracking ID:</strong> (Opcional) Tu Tracking ID de afiliado</li>
                          <li><strong>Sandbox:</strong> Marca solo si estás usando ambiente de pruebas</li>
                        </ul>
                      </li>
                      <li>Haz clic en <strong>"Guardar Configuración"</strong></li>
                      <li>El estado cambiará a <strong>"Configurada"</strong> ✅</li>
                    </ul>
                  </li>
                </ol>
              </div>
              <div className="bg-blue-50 border border-blue-200 text-blue-700 rounded p-3 text-xs">
                <strong>Ventajas de usar Affiliate API:</strong>
                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                  <li>✅ Más rápido que scraping (respuestas instantáneas)</li>
                  <li>✅ Datos oficiales y actualizados directamente de AliExpress</li>
                  <li>✅ No requiere navegador ni cookies (más confiable)</li>
                  <li>✅ No hay riesgo de bloqueos o CAPTCHAs</li>
                  <li>✅ Incluye información de comisiones de afiliado</li>
                  <li>✅ Gratis para desarrolladores aprobados</li>
                </ul>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 rounded p-3 text-xs">
                <strong>Límites y políticas:</strong>
                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                  <li>Límite típico: ~5000 llamadas por período (según aprobación)</li>
                  <li>Si excedes el límite, las peticiones se bloquean temporalmente (~1 segundo)</li>
                  <li>No se permite scraping masivo - solo usar APIs autorizadas</li>
                  <li>Cada usuario del SaaS debería tener su propio Tracking ID para comisiones</li>
                </ul>
              </div>
              <div className="text-sm text-gray-600">
                <strong>Documentación oficial:</strong> 
                <a href="https://developer.alibaba.com/help/en/portal" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                  developer.alibaba.com/help/en/portal <ExternalLink className="w-3 h-3 inline" />
                </a>
              </div>
            </div>
          </div>

          {/* AliExpress Dropshipping API */}
          <div className="border rounded-xl p-6 bg-gradient-to-r from-red-50 via-pink-50 to-purple-50">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-lg font-semibold text-gray-900">AliExpress Dropshipping API</h4>
                <span className="text-sm text-purple-600 font-medium">Recomendada para compras automatizadas</span>
              </div>
              <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                Gratis
              </span>
            </div>
            <p className="text-gray-700 mb-3">
              API oficial de AliExpress para crear órdenes automatizadas y gestionar pedidos. Permite automatizar completamente 
              el proceso de compra cuando un cliente adquiere un producto en tu marketplace. El sistema usa esta API primero 
              antes de Puppeteer para mayor confiabilidad.
            </p>
            <div className="bg-white border rounded-lg p-4 space-y-3">
              <div className="text-sm">
                <strong>Campos requeridos:</strong>
              </div>
              <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
                <li><strong>App Key:</strong> Clave de aplicación obtenida de AliExpress Open Platform</li>
                <li><strong>App Secret:</strong> Secret para calcular la firma de las peticiones</li>
                <li><strong>Access Token:</strong> Token OAuth obtenido después del flujo de autorización</li>
                <li><strong>Refresh Token:</strong> (Opcional) Token para renovar el access token cuando expire</li>
                <li><strong>Sandbox:</strong> Marca si usas ambiente de pruebas (false para producción)</li>
              </ul>
              <div className="pt-2 border-t text-sm text-gray-700 space-y-2">
                <div className="font-semibold text-gray-900">Pasos para obtener las credenciales:</div>
                <ol className="list-decimal list-inside space-y-2">
                  <li><strong>Requisitos previos:</strong>
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                      <li>Necesitas una cuenta de AliExpress (de comprador o vendedor)</li>
                      <li>La cuenta debe estar verificada y activa</li>
                    </ul>
                  </li>
                  <li><strong>Registrarse como desarrollador:</strong>
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                      <li>Ve a <a href="https://console.aliexpress.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">console.aliexpress.com <ExternalLink className="w-3 h-3 inline" /></a></li>
                      <li>Si aún no eres desarrollador, regístrate (acepta el Open Platform Agreement)</li>
                      <li>Completa la información de empresa y objetivos de integración</li>
                    </ul>
                  </li>
                  <li><strong>Crear aplicación:</strong>
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                      <li>En la consola, ve a <strong>"App Management"</strong> → <strong>"Create App"</strong></li>
                      <li>Selecciona el tipo: <strong>"Dropshipping"</strong></li>
                      <li>Completa el formulario con información de tu aplicación</li>
                      <li>Describe tu caso de uso: "Sistema de dropshipping automatizado para crear órdenes vía API"</li>
                    </ul>
                  </li>
                  <li><strong>Esperar aprobación:</strong>
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                      <li>AliExpress revisará tu solicitud (1-2 días hábiles típicamente)</li>
                      <li>Recibirás una notificación cuando sea aprobada o denegada</li>
                      <li>⚠️ <strong>Importante:</strong> Asegúrate de que tu caso de uso esté bien justificado</li>
                    </ul>
                  </li>
                  <li><strong>Obtener credenciales básicas:</strong>
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                      <li>Una vez aprobada, ve a <strong>"App Management"</strong> → Tu aplicación</li>
                      <li>Copia el <strong>App Key</strong> y el <strong>App Secret</strong></li>
                      <li>Guarda estas credenciales de forma segura</li>
                    </ul>
                  </li>
                  <li><strong>Obtener Access Token (OAuth):</strong>
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                      <li>La Dropshipping API requiere autenticación OAuth</li>
                      <li>Necesitas autorizar la aplicación con tu cuenta de AliExpress</li>
                      <li>El sistema proporcionará un flujo OAuth (similar a eBay/MercadoLibre)</li>
                      <li>Después de autorizar, recibirás el <strong>Access Token</strong> y <strong>Refresh Token</strong></li>
                      <li>⚠️ <strong>Nota:</strong> El Access Token expira periódicamente y debe renovarse usando el Refresh Token</li>
                    </ul>
                  </li>
                  <li><strong>Configurar en Ivan Reseller:</strong>
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                      <li>Ve a <strong>Settings → Configuración de APIs</strong></li>
                      <li>Busca la tarjeta <strong>"AliExpress Dropshipping API"</strong></li>
                      <li>Ingresa:
                        <ul className="list-circle list-inside ml-4 mt-1">
                          <li><strong>App Key:</strong> Pega el App Key copiado</li>
                          <li><strong>App Secret:</strong> Pega el App Secret copiado</li>
                          <li><strong>Access Token:</strong> Token OAuth obtenido después de autorizar</li>
                          <li><strong>Refresh Token:</strong> (Opcional) Para renovar automáticamente el Access Token</li>
                          <li><strong>Sandbox:</strong> Marca solo si estás usando ambiente de pruebas</li>
                        </ul>
                      </li>
                      <li>Haz clic en <strong>"Guardar Configuración"</strong></li>
                      <li>El estado cambiará a <strong>"Configurada"</strong> ✅</li>
                    </ul>
                  </li>
                </ol>
              </div>
              <div className="bg-blue-50 border border-blue-200 text-blue-700 rounded p-3 text-xs">
                <strong>Ventajas de usar Dropshipping API:</strong>
                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                  <li>✅ Creación automática de órdenes sin intervención manual</li>
                  <li>✅ Más rápido y confiable que automatización con navegador</li>
                  <li>✅ No requiere mantener sesión activa ni cookies</li>
                  <li>✅ Acceso a información de tracking y estado de pedidos</li>
                  <li>✅ Verificación de stock y precios antes de crear la orden</li>
                  <li>✅ Gratis para desarrolladores aprobados</li>
                </ul>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 rounded p-3 text-xs">
                <strong>Importante sobre el flujo de pago:</strong>
                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                  <li>La API permite crear órdenes, pero el pago se realiza en AliExpress</li>
                  <li>Las órdenes quedan en estado "WAIT_BUYER_PAY" (pendiente de pago)</li>
                  <li>Debes pagar manualmente en AliExpress o usar automatización adicional</li>
                  <li>El sistema te mostrará un panel de "Pedidos pendientes de pago"</li>
                  <li>Esto es el estándar - incluso herramientas como DSers funcionan así</li>
                </ul>
              </div>
              <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 text-xs">
                <strong>⚠️ Restricciones críticas:</strong>
                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                  <li>Cada cliente del SaaS debería tener su propia cuenta de AliExpress</li>
                  <li>No compartas un único Access Token entre múltiples sitios sin permiso</li>
                  <li>Los datos obtenidos vía API solo pueden usarse en el contexto del programa oficial</li>
                  <li>Respeta los términos de servicio y límites de uso</li>
                </ul>
              </div>
              <div className="text-sm text-gray-600">
                <strong>Documentación oficial:</strong> 
                <a href="https://developer.alibaba.com/help/en/portal" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                  developer.alibaba.com/help/en/portal <ExternalLink className="w-3 h-3 inline" />
                </a>
              </div>
            </div>
          </div>

          {/* GROQ */}
          <div className="border rounded-xl p-6 bg-gradient-to-r from-purple-50 to-pink-50">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-lg font-semibold text-gray-900">GROQ AI API</h4>
                <span className="text-sm text-purple-600 font-medium">Crítica para CEO Agent e IA</span>
              </div>
              <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                Gratis
              </span>
            </div>
            <p className="text-gray-700 mb-3">
              IA estratégica para análisis de negocio, generación de contenido, predicciones y toma de decisiones automáticas. Usada por el CEO Agent.
            </p>
            <div className="bg-white border rounded-lg p-4 space-y-3">
              <div className="text-sm">
                <strong>Campo requerido:</strong> API Key
              </div>
              <div className="pt-2 border-t text-sm text-gray-700 space-y-2">
                <div className="font-semibold text-gray-900">Pasos para obtener la API Key:</div>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Ve a <a href="https://console.groq.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">console.groq.com <ExternalLink className="w-3 h-3 inline" /></a></li>
                  <li>Crea una cuenta (gratis, sin tarjeta de crédito requerida)</li>
                  <li>Inicia sesión y ve a <strong>"API Keys"</strong> en el menú lateral o dashboard</li>
                  <li>Haz clic en <strong>"Create API Key"</strong> o <strong>"Crear API Key"</strong></li>
                  <li>Ingresa un nombre descriptivo (ej: "Ivan Reseller - Tu Nombre")</li>
                  <li>Haz clic en <strong>"Create"</strong> o <strong>"Crear"</strong></li>
                  <li><strong>IMPORTANTE:</strong> Copia tu <strong>API Key</strong> inmediatamente (formato: <code>gsk_...</code>) - solo se muestra una vez</li>
                  <li>Pégala en el sistema en <code>Settings → Configuración de APIs → GROQ AI API</code></li>
                  <li>Haz clic en <strong>"Guardar Configuración"</strong></li>
                  <li>El estado cambiará a <strong>"Configurada"</strong> ✅</li>
                </ol>
              </div>
              <div className="text-sm text-gray-600">
                <strong>Documentación:</strong> 
                <a href="https://console.groq.com/docs" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                  console.groq.com/docs <ExternalLink className="w-3 h-3 inline" />
                </a>
              </div>
              <div className="bg-green-50 border border-green-200 text-green-700 rounded p-3 text-xs">
                <strong>Ventaja:</strong> GROQ ofrece generosas cuotas gratuitas (hasta 30 requests/minuto) y es muy rápida. Perfecta para uso en producción.
              </div>
            </div>
          </div>

          {/* Google Trends / SerpAPI */}
          <div className="border rounded-xl p-6 bg-gradient-to-r from-indigo-50 to-blue-50">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-lg font-semibold text-gray-900">Google Trends API (SerpAPI)</h4>
                <span className="text-sm text-indigo-600 font-medium">Recomendada para validar demanda real</span>
              </div>
              <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
                Opcional
              </span>
            </div>
            <p className="text-gray-700 mb-3">
              Valida demanda real de productos usando datos de Google Trends. El sistema usa esta API para verificar que los productos 
              identificados como oportunidades tienen demanda real en el mercado antes de considerarlos válidos.
            </p>
            <div className="bg-white border rounded-lg p-4 space-y-3">
              <div className="text-sm">
                <strong>Campo requerido:</strong> API Key (SerpAPI Key)
              </div>
              <div className="pt-2 border-t text-sm text-gray-700 space-y-2">
                <div className="font-semibold text-gray-900">Pasos para obtener la API Key:</div>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Ve a <a href="https://serpapi.com/users/sign_up" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">serpapi.com/users/sign_up <ExternalLink className="w-3 h-3 inline" /></a></li>
                  <li>Crea una cuenta (hay plan gratuito con límites)</li>
                  <li>Inicia sesión y ve a <strong>"Dashboard"</strong> o <a href="https://serpapi.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">serpapi.com/dashboard <ExternalLink className="w-3 h-3 inline" /></a></li>
                  <li>En el dashboard, encuentra tu <strong>API Key</strong> (formato: <code>abc123def456...</code>)</li>
                  <li><strong>IMPORTANTE:</strong> Copia tu API Key inmediatamente</li>
                  <li>Ve a Ivan Reseller → <strong>Settings → Configuración de APIs → Google Trends API (SerpAPI)</strong></li>
                  <li>Pega la API Key en el campo <strong>"SerpAPI Key"</strong></li>
                  <li>Haz clic en <strong>"Guardar Configuración"</strong></li>
                  <li>El estado cambiará a <strong>"Configurada y funcionando"</strong> ✅</li>
                </ol>
              </div>
              <div className="bg-blue-50 border border-blue-200 text-blue-700 rounded p-3 text-xs">
                <strong>¿Cómo se usa en el sistema?</strong>
                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                  <li>Cuando buscas oportunidades, el sistema valida cada producto con Google Trends</li>
                  <li>Verifica volumen de búsqueda, tendencias (creciente/estable/declinante), y confianza</li>
                  <li>Solo productos con demanda real verificada aparecen como oportunidades válidas</li>
                  <li>Esto garantiza que solo veas productos que realmente tienen potencial de venta</li>
                </ul>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 rounded p-3 text-xs">
                <strong>Nota importante:</strong>
                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                  <li>Es <strong>opcional</strong>: Si no configuras SerpAPI, el sistema usará análisis de datos internos como fallback</li>
                  <li>Es <strong>recomendado</strong> para validaciones más precisas de demanda real</li>
                  <li>Plan gratuito tiene límites de requests - verifica tu uso en el dashboard de SerpAPI</li>
                  <li>El sistema prioriza las credenciales del usuario, luego variables de entorno, luego fallback interno</li>
                </ul>
              </div>
              <div className="text-sm text-gray-600">
                <strong>Documentación:</strong> 
                <a href="https://serpapi.com/google-trends-api" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                  serpapi.com/google-trends-api <ExternalLink className="w-3 h-3 inline" />
                </a>
              </div>
            </div>
          </div>

          {/* MercadoLibre */}
          <div className="border rounded-xl p-6 bg-gradient-to-r from-yellow-50 to-orange-50">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-lg font-semibold text-gray-900">MercadoLibre API</h4>
                <span className="text-sm text-yellow-600 font-medium">Opcional (mejora cobertura regional)</span>
              </div>
              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                Recomendada
              </span>
            </div>
            <p className="text-gray-700 mb-3">
              Publica y gestiona productos en MercadoLibre usando OAuth 2.0
            </p>
            <div className="bg-white border rounded-lg p-4 space-y-3">
              <div className="text-sm">
                <strong>Campos requeridos:</strong>
              </div>
              <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
                <li><strong>Client ID (App ID):</strong> ID de tu aplicación en MercadoLibre</li>
                <li><strong>Client Secret:</strong> Secret key de tu aplicación</li>
              </ul>
              <div className="text-sm">
                <strong>Campos opcionales (se obtienen automáticamente con OAuth):</strong>
              </div>
              <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
                <li><strong>Access Token:</strong> Token de acceso (se renueva automáticamente)</li>
                <li><strong>Refresh Token:</strong> Token para renovar el access token</li>
                <li><strong>User ID:</strong> ID del usuario vendedor</li>
              </ul>
              <div className="pt-2 border-t text-sm text-gray-700 space-y-2">
                <div className="font-semibold text-gray-900">Pasos para obtener las credenciales:</div>
                <ol className="list-decimal list-inside space-y-2">
                  <li><strong>Inicia sesión</strong> en <a href="https://developers.mercadolibre.cl/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">developers.mercadolibre.cl <ExternalLink className="w-3 h-3 inline" /></a> con tu cuenta de MercadoLibre</li>
                  <li><strong>Crear aplicación:</strong> Ve a <a href="https://developers.mercadolibre.cl/devcenter/create-app" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold">developers.mercadolibre.cl/devcenter/create-app <ExternalLink className="w-3 h-3 inline" /></a></li>
                  <li><strong>Paso 1 - Información básica:</strong> Completa el primer formulario:
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                      <li><strong>Nombre*:</strong> Ej: "Ivan Reseller - Mi Negocio"</li>
                      <li><strong>Nombre corto*:</strong> Ej: "ivan-reseller" (sin espacios, solo letras, números y guiones)</li>
                      <li><strong>Descripción*:</strong> Ej: "Aplicación para gestión de productos y ventas en MercadoLibre"</li>
                      <li><strong>Logo:</strong> Opcional - Sube un logo en formato PNG (máximo 1MB)</li>
                    </ul>
                    Haz clic en <strong>"Continuar"</strong>
                  </li>
                  <li><strong>Paso 2 - Configuración y scopes:</strong> En la siguiente pantalla, completa:
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                      <li><strong>Redirect URI*:</strong> Agrega exactamente: <code className="bg-gray-100 px-1 rounded">https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/mercadolibre</code>
                        <ul className="list-circle list-inside ml-4 mt-1">
                          <li>Haz clic en el campo "Redirect URI"</li>
                          <li>Pega la URL completa</li>
                          <li>Haz clic en "Agregar Redirect URI" si es necesario</li>
                          <li>⚠️ <strong>IMPORTANTE:</strong> Debe ser exactamente <code>www.ivanreseller.com</code> (NO uses vercel.app ni otros dominios)</li>
                        </ul>
                      </li>
                      <li><strong>Integración*:</strong> Marca al menos una opción:
                        <ul className="list-circle list-inside ml-4 mt-1">
                          <li>☑️ <strong>Mercado Libre</strong> (obligatorio para nuestro caso)</li>
                          <li>☐ Vtex (opcional, solo si lo necesitas)</li>
                        </ul>
                      </li>
                      <li><strong>Permisos*:</strong> Para cada categoría, selecciona el nivel de acceso:
                        <ul className="list-circle list-inside ml-4 mt-1 space-y-0.5">
                          <li><strong>Usuarios:</strong> "Lectura y escritura" (para gestionar perfil)</li>
                          <li><strong>Publicaciones y ofertas/ventas:</strong> "Lectura y escritura" (para publicar productos)</li>
                          <li><strong>Ventas y envíos:</strong> "Lectura y escritura" (para gestionar pedidos)</li>
                          <li><strong>Comunicaciones y preguntas:</strong> "De solo lectura" o "Lectura y escritura"</li>
                          <li><strong>Publicidad de un producto:</strong> "De solo lectura" (opcional)</li>
                          <li><strong>Facturación:</strong> "De solo lectura" (opcional)</li>
                          <li><strong>Métricas del negocio:</strong> "De solo lectura" (recomendado)</li>
                          <li><strong>Promociones, cupones y descuentos:</strong> "Lectura y escritura" (opcional)</li>
                        </ul>
                        <span className="text-red-600 text-xs block mt-1">⚠️ Debes seleccionar al menos una opción para cada permiso</span>
                      </li>
                      <li><strong>Topics (Notificaciones):</strong> Opcional - Puedes dejar los valores por defecto o configurar según necesites</li>
                      <li><strong>Notificaciones callback URL:</strong> Opcional - Puedes dejarlo vacío por ahora</li>
                    </ul>
                    Haz clic en <strong>"Continuar"</strong> o <strong>"Crear aplicación"</strong>
                  </li>
                  <li><strong>Paso 3 - Obtener credenciales:</strong> Después de crear la aplicación, verás:
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                      <li><strong>App ID (Client ID):</strong> Ejemplo: `1234567890123456` - <strong>Cópialo</strong></li>
                      <li><strong>Secret Key (Client Secret):</strong> Ejemplo: `abcdefghijklmnopqrstuvwxyz123456` - <strong>Cópialo</strong></li>
                    </ul>
                    ⚠️ <strong>IMPORTANTE:</strong> Guarda estas credenciales en un lugar seguro. El Secret Key solo se muestra una vez.
                  </li>
                  <li><strong>Paso 4 - Configurar en Ivan Reseller:</strong>
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                      <li>Ve a Ivan Reseller → <strong>Settings → Configuración de APIs</strong></li>
                      <li>Busca la tarjeta <strong>"MercadoLibre API"</strong></li>
                      <li>Ingresa:
                        <ul className="list-circle list-inside ml-4 mt-1">
                          <li><strong>Client ID (App ID):</strong> Pega el App ID copiado</li>
                          <li><strong>Client Secret:</strong> Pega el Secret Key copiado</li>
                        </ul>
                      </li>
                      <li>Haz clic en <strong>"Guardar Configuración"</strong></li>
                    </ul>
                  </li>
                  <li><strong>Paso 5 - Autorizar con OAuth:</strong>
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                      <li>Haz clic en el botón <strong>"Autorizar con MercadoLibre"</strong> o <strong>"OAuth"</strong></li>
                      <li>Se abrirá una ventana de MercadoLibre</li>
                      <li>Revisa los permisos solicitados y haz clic en <strong>"Autorizar"</strong> o <strong>"Aceptar"</strong></li>
                      <li>El sistema obtendrá automáticamente los Access Token y Refresh Token</li>
                      <li>El estado cambiará a <strong>"Sesión activa"</strong> ✅</li>
                    </ul>
                  </li>
                </ol>
                <div className="bg-blue-50 border border-blue-200 text-blue-700 rounded p-2 mt-2 text-xs">
                  <strong>💡 Enlaces rápidos:</strong> <a href="https://developers.mercadolibre.cl/devcenter/create-app" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold">Crear nueva aplicación</a> | <a href="https://developers.mercadolibre.cl/applications" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Ver mis aplicaciones</a>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 rounded p-2 mt-2 text-xs">
                  <strong>⚠️ Errores comunes:</strong>
                  <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                    <li>Si ves "Selecciona mínimo una unidad de negocio": Marca al menos "Mercado Libre" en Integración</li>
                    <li>Si ves "Selecciona al menos una opción para cada permiso": Asegúrate de seleccionar un nivel de acceso para cada categoría de permisos</li>
                    <li>Si el Redirect URI no funciona: Verifica que sea exactamente <code>https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/mercadolibre</code> (sin espacios, con https://)</li>
                  </ul>
                </div>
              </div>
              <div className="text-sm text-gray-600">
                <strong>Documentación:</strong> 
                <a href="https://developers.mercadolibre.com.ar/es_ar/autenticacion-y-autorizacion" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                  developers.mercadolibre.com <ExternalLink className="w-3 h-3 inline" />
                </a>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 rounded p-3 text-xs">
                <strong>Tip:</strong> Los tokens expiran periódicamente. El sistema los renueva automáticamente usando el Refresh Token.
              </div>
            </div>
          </div>

          {/* eBay */}
          <div className="border rounded-xl p-6 bg-gradient-to-r from-blue-50 to-cyan-50">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-lg font-semibold text-gray-900">eBay API</h4>
                <span className="text-sm text-blue-600 font-medium">Marketplace global</span>
              </div>
            </div>
            <p className="text-gray-700 mb-3">
              Publica en eBay a nivel mundial. Necesitarás credenciales <strong>Sandbox</strong> para pruebas y <strong>Production</strong> para publicar en vivo.
            </p>
            <div className="bg-white border rounded-lg p-4 space-y-3">
              <div className="text-sm">
                <strong>Campos requeridos (ambos entornos):</strong> App ID (Client ID), Dev ID, Cert ID (Client Secret), Redirect URI (RuName)
              </div>
              <div className="text-sm">
                <strong>Campos generados automáticamente tras OAuth:</strong> Auth Token (Access Token) y Refresh Token
              </div>
              <div className="pt-2 border-t text-sm text-gray-700 space-y-2">
                <div className="font-semibold text-gray-900">Pasos para obtener las claves:</div>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Ingresa a <a href="https://developer.ebay.com/my/keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">developer.ebay.com <ExternalLink className="w-3 h-3 inline" /></a> y selecciona el conjunto de claves (<em>Keyset</em>) <strong>Sandbox</strong>.</li>
                  <li>Copia los valores <strong>App ID</strong>, <strong>Dev ID</strong> y <strong>Cert ID</strong> y pégalos en <code>Settings → Configuración de APIs → eBay (Sandbox)</code>.</li>
                  <li>En la misma página de eBay haz clic en <em>User Tokens</em> y, dentro de <em>Your eBay Sign-in Settings</em>, registra un <strong>Redirect URL name (RuName)</strong> apuntando a:<br />
                    <code className="block bg-gray-100 rounded px-2 py-1 mt-1">https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/ebay</code>
                    <span className="text-xs text-gray-600 block mt-1">⚠️ <strong>Importante:</strong> Si tu sistema está en otro dominio, usa ese dominio en lugar de www.ivanreseller.com</span>
                  </li>
                  <li>Copia el nombre generado (ej. <code>Ivan_Marty-...</code>) y pégalo en el campo <strong>Redirect URI (RuName)</strong> del panel. Guarda.</li>
                  <li>Presiona el botón <strong>OAuth</strong>. Se abrirá la ventana oficial de eBay Sandbox. Inicia sesión con tu cuenta Sandbox y acepta los permisos. El sistema guardará automáticamente el <em>Auth Token</em> y el <em>Refresh Token</em>.</li>
                  <li>Repite los mismos pasos en el keyset <strong>Production</strong> para publicar en el entorno real. Asegúrate de registrar nuevamente el RuName (puedes reutilizar el mismo) y autorizar con tu cuenta comercial.</li>
                </ol>
              </div>
              <div className="bg-blue-50 border border-blue-200 text-xs text-blue-700 rounded p-3">
                <strong>Tip:</strong> Si ves el mensaje “Falta token OAuth de eBay”, revisa que el RuName sea el mismo que aparece en eBay Developer y vuelve a ejecutar el flujo OAuth desde el botón dedicado.
              </div>
            </div>
          </div>

          {/* Amazon SP-API */}
          <div className="border rounded-xl p-6 bg-gradient-to-r from-orange-50 to-red-50">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-lg font-semibold text-gray-900">Amazon SP-API</h4>
                <span className="text-sm text-orange-600 font-medium">Opcional (marketplace premium)</span>
              </div>
            </div>
            <p className="text-gray-700 mb-3">
              Vende en Amazon usando la Selling Partner API (requiere cuenta de vendedor y aprobación)
            </p>
            <div className="bg-white border rounded-lg p-4 space-y-3">
              <div className="text-sm">
                <strong>Campos requeridos:</strong>
              </div>
              <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
                <li><strong>Seller ID:</strong> Tu ID de vendedor en Amazon (formato: A2XXXXXXXXXX)</li>
                <li><strong>Client ID (LWA):</strong> ID de aplicación OAuth de Amazon Developer</li>
                <li><strong>Client Secret (LWA):</strong> Secret de aplicación OAuth</li>
                <li><strong>Refresh Token:</strong> Token de refresco OAuth (obtenido después de autorizar)</li>
                <li><strong>AWS Access Key ID:</strong> Credenciales AWS para firmar requests</li>
                <li><strong>AWS Secret Access Key:</strong> Secret de AWS</li>
                <li><strong>Region:</strong> Región de AWS (ej: us-east-1, eu-west-1)</li>
                <li><strong>Marketplace ID:</strong> ID del marketplace (ej: ATVPDKIKX0DER para US)</li>
              </ul>
              <div className="pt-2 border-t text-sm text-gray-700 space-y-2">
                <div className="font-semibold text-gray-900">Pasos para obtener las credenciales:</div>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Ve a <a href="https://developer.amazon.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Amazon Developer Central <ExternalLink className="w-3 h-3 inline" /></a> e inicia sesión</li>
                  <li>Ve a <strong>"Apps & Services"</strong> → <strong>"Develop Apps"</strong> → <strong>"Create a new app"</strong></li>
                  <li>Completa: App name, OAuth redirect URI, y selecciona <strong>"Selling Partner API"</strong></li>
                  <li>Guarda el <strong>Client ID</strong> y <strong>Client Secret</strong> (LWA credentials)</li>
                  <li>Autoriza la aplicación para obtener el <strong>Refresh Token</strong> (el sistema tiene un botón OAuth para esto)</li>
                  <li>Ve a <a href="https://console.aws.amazon.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">AWS Console <ExternalLink className="w-3 h-3 inline" /></a> y crea un usuario IAM con acceso programático</li>
                  <li>Asigna la política <strong>"SellingPartnerAPI"</strong> y guarda el <strong>Access Key ID</strong> y <strong>Secret Access Key</strong></li>
                  <li>Obtén tu <strong>Seller ID</strong> desde Amazon Seller Central</li>
                  <li>Selecciona el <strong>Marketplace ID</strong> según tu país (ver lista en documentación)</li>
                </ol>
              </div>
              <div className="text-sm text-gray-600">
                <strong>Documentación:</strong> 
                <a href="https://developer-docs.amazon.com/sp-api/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                  developer-docs.amazon.com/sp-api <ExternalLink className="w-3 h-3 inline" />
                </a>
              </div>
              <div className="bg-orange-50 border border-orange-200 text-orange-700 rounded p-3 text-xs">
                <strong>Nota:</strong> Amazon SP-API requiere aprobación y puede tomar varios días. Asegúrate de tener una cuenta de vendedor activa.
              </div>
            </div>
          </div>

          {/* ScraperAPI */}
          <div className="border rounded-xl p-6 bg-gradient-to-r from-green-50 to-teal-50">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-lg font-semibold text-gray-900">ScraperAPI</h4>
                <span className="text-sm text-green-600 font-medium">Crítica para Autopilot avanzado</span>
              </div>
            </div>
            <p className="text-gray-700 mb-3">
              Servicio de web scraping anti-detección para AliExpress y otros sitios. Evita bloqueos y CAPTCHAs.
            </p>
            <div className="bg-white border rounded-lg p-4 space-y-3">
              <div className="text-sm">
                <strong>Campo requerido:</strong> API Key
              </div>
              <div className="pt-2 border-t text-sm text-gray-700 space-y-2">
                <div className="font-semibold text-gray-900">Pasos para obtener la API Key:</div>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Ve a <a href="https://www.scraperapi.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">scraperapi.com <ExternalLink className="w-3 h-3 inline" /></a></li>
                  <li>Crea una cuenta (plan gratuito disponible para pruebas)</li>
                  <li>Ve a <strong>"Dashboard"</strong> → <strong>"API Keys"</strong></li>
                  <li>Copia tu <strong>API Key</strong></li>
                  <li>Pégala en el sistema en <code>Settings → Configuración de APIs → ScraperAPI</code></li>
                </ol>
              </div>
              <div className="text-sm text-gray-600">
                <strong>Documentación:</strong> 
                <a href="https://www.scraperapi.com/documentation/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                  scraperapi.com/documentation <ExternalLink className="w-3 h-3 inline" />
                </a>
              </div>
            </div>
          </div>

          {/* ZenRows */}
          <div className="border rounded-xl p-6 bg-gradient-to-r from-teal-50 to-cyan-50">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-lg font-semibold text-gray-900">ZenRows</h4>
                <span className="text-sm text-teal-600 font-medium">Alternativa a ScraperAPI</span>
              </div>
            </div>
            <p className="text-gray-700 mb-3">
              Alternativa a ScraperAPI para web scraping avanzado con rotación de proxies y anti-detección.
            </p>
            <div className="bg-white border rounded-lg p-4 space-y-3">
              <div className="text-sm">
                <strong>Campo requerido:</strong> API Key
              </div>
              <div className="pt-2 border-t text-sm text-gray-700 space-y-2">
                <div className="font-semibold text-gray-900">Pasos para obtener la API Key:</div>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Ve a <a href="https://www.zenrows.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">zenrows.com <ExternalLink className="w-3 h-3 inline" /></a></li>
                  <li>Crea una cuenta (plan gratuito disponible)</li>
                  <li>Ve a <strong>"Dashboard"</strong> → <strong>"API Keys"</strong></li>
                  <li>Copia tu <strong>API Key</strong></li>
                  <li>Pégala en el sistema en <code>Settings → Configuración de APIs → ZenRows</code></li>
                </ol>
              </div>
              <div className="text-sm text-gray-600">
                <strong>Documentación:</strong> 
                <a href="https://www.zenrows.com/documentation" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                  zenrows.com/documentation <ExternalLink className="w-3 h-3 inline" />
                </a>
              </div>
            </div>
          </div>

          {/* 2Captcha */}
          <div className="border rounded-xl p-6 bg-gradient-to-r from-indigo-50 to-purple-50">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-lg font-semibold text-gray-900">2Captcha</h4>
                <span className="text-sm text-indigo-600 font-medium">Resolver captchas automáticamente</span>
              </div>
            </div>
            <p className="text-gray-700 mb-3">
              Servicio para resolver CAPTCHAs automáticamente. Útil para Autopilot cuando AliExpress muestra CAPTCHAs.
            </p>
            <div className="bg-white border rounded-lg p-4 space-y-3">
              <div className="text-sm">
                <strong>Campo requerido:</strong> API Key
              </div>
              <div className="pt-2 border-t text-sm text-gray-700 space-y-2">
                <div className="font-semibold text-gray-900">Pasos para obtener la API Key:</div>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Ve a <a href="https://2captcha.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">2captcha.com <ExternalLink className="w-3 h-3 inline" /></a></li>
                  <li>Crea una cuenta y recarga saldo (mínimo $3 USD)</li>
                  <li>Ve a <strong>"Settings"</strong> → <strong>"API Key"</strong></li>
                  <li>Copia tu <strong>API Key</strong></li>
                  <li>Pégala en el sistema en <code>Settings → Configuración de APIs → 2Captcha</code></li>
                </ol>
              </div>
              <div className="text-sm text-gray-600">
                <strong>Documentación:</strong> 
                <a href="https://2captcha.com/2captcha-api" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                  2captcha.com/2captcha-api <ExternalLink className="w-3 h-3 inline" />
                </a>
              </div>
              <div className="bg-indigo-50 border border-indigo-200 text-indigo-700 rounded p-3 text-xs">
                <strong>Nota:</strong> 2Captcha es un servicio de pago. Cada CAPTCHA resuelto tiene un costo (aproximadamente $2.99 por 1000 CAPTCHAs).
              </div>
            </div>
          </div>

          {/* PayPal */}
          <div className="border rounded-xl p-6 bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-lg font-semibold text-gray-900">PayPal Payouts API</h4>
                <span className="text-sm text-blue-600 font-medium">Para pagos automáticos de comisiones</span>
              </div>
            </div>
            <p className="text-gray-700 mb-3">
              Permite pagar comisiones automáticamente a vendedores usando PayPal Payouts.
            </p>
            <div className="bg-white border rounded-lg p-4 space-y-3">
              <div className="text-sm">
                <strong>Campos requeridos:</strong>
              </div>
              <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
                <li><strong>Client ID:</strong> ID de aplicación de PayPal</li>
                <li><strong>Client Secret:</strong> Secret de aplicación de PayPal</li>
                <li><strong>Mode:</strong> <code>sandbox</code> para pruebas o <code>live</code> para producción</li>
              </ul>
              <div className="pt-2 border-t text-sm text-gray-700 space-y-2">
                <div className="font-semibold text-gray-900">Pasos para obtener las credenciales:</div>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Ve a <a href="https://developer.paypal.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">PayPal Developer <ExternalLink className="w-3 h-3 inline" /></a> e inicia sesión</li>
                  <li>Ve a <strong>"Dashboard"</strong> → <strong>"My Apps & Credentials"</strong></li>
                  <li>Crea una nueva aplicación o usa una existente</li>
                  <li>Selecciona el ambiente (<strong>Sandbox</strong> para pruebas o <strong>Live</strong> para producción)</li>
                  <li>Copia el <strong>Client ID</strong> y <strong>Secret</strong></li>
                  <li>Pégalos en el sistema en <code>Settings → Configuración de APIs → PayPal Payouts</code></li>
                </ol>
              </div>
              <div className="text-sm text-gray-600">
                <strong>Documentación:</strong> 
                <a href="https://developer.paypal.com/docs/payouts/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                  developer.paypal.com/docs/payouts <ExternalLink className="w-3 h-3 inline" />
                </a>
              </div>
              <div className="bg-blue-50 border border-blue-200 text-blue-700 rounded p-3 text-xs">
                <strong>Importante:</strong> Para usar PayPal Payouts en producción, necesitas aprobación de PayPal y una cuenta de negocio verificada.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Proceso de configuración */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">✍️ Cómo Configurar una API</h3>
        <ol className="space-y-3 text-gray-700">
          <li className="flex items-start gap-2">
            <span className="font-bold text-yellow-600">1.</span>
            <span>Busca la tarjeta de la API que necesitas</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold text-yellow-600">2.</span>
            <span>Completa los campos requeridos (marcados con *)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold text-yellow-600">3.</span>
            <span>Usa el botón 👁️ para mostrar/ocultar contraseñas</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold text-yellow-600">4.</span>
            <span>Haz clic en "Guardar Configuración"</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold text-yellow-600">5.</span>
            <span>El estado cambiará a "Configurada" ✅</span>
          </li>
        </ol>
      </div>

      {/* Seguridad */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <Shield className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">🔒 Seguridad</h3>
            <ul className="space-y-1 text-gray-700">
              <li>• Todas las credenciales se encriptan con <strong>AES-256-GCM</strong></li>
              <li>• Las claves se almacenan de forma segura en la base de datos</li>
              <li>• No se pueden visualizar después de guardadas (solo editar)</li>
              <li>• Conexión HTTPS en producción</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// SECCIÓN: GESTIÓN DE PRODUCTOS
// =====================================================
function GestionProductos() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">📦 Gestión de Productos</h2>
        <p className="text-gray-600 text-lg">
          Administra tu catálogo de productos
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="text-xl font-semibold mb-4">Acceso: Menu → Products</h3>
        <p className="text-gray-700">
          La sección de productos te permite gestionar todo tu inventario con funciones CRUD completas.
        </p>
      </div>

      {/* Funciones principales */}
      <div className="grid grid-cols-2 gap-6">
        <div className="border rounded-xl p-6 bg-white">
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            Crear Producto
          </h4>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>• Agregar manualmente desde formulario</li>
            <li>• Importar desde marketplace</li>
            <li>• Scraping automático (Autopilot)</li>
            <li>• Importación masiva (CSV/Excel)</li>
          </ul>
        </div>

        <div className="border rounded-xl p-6 bg-white">
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-blue-600" />
            Editar Producto
          </h4>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>• Actualizar información</li>
            <li>• Modificar precios y stock</li>
            <li>• Agregar/editar imágenes</li>
            <li>• Optimizar descripciones con IA</li>
          </ul>
        </div>

        <div className="border rounded-xl p-6 bg-white">
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-purple-600" />
            Publicar Producto
          </h4>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>• Publicación en marketplaces</li>
            <li>• Multi-marketplace simultáneo</li>
            <li>• Publicador inteligente</li>
            <li>• Sincronización automática</li>
          </ul>
        </div>

        <div className="border rounded-xl p-6 bg-white">
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-red-600" />
            Eliminar Producto
          </h4>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>• Eliminación con confirmación</li>
            <li>• Desactivar sin eliminar</li>
            <li>• Archivar para histórico</li>
            <li>• Eliminación masiva</li>
          </ul>
        </div>
      </div>

      {/* Búsqueda y filtros */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">🔍 Búsqueda y Filtros</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg">
            <div className="font-medium mb-2">Por texto</div>
            <div className="text-sm text-gray-600">Nombre, SKU, descripción</div>
          </div>
          <div className="bg-white p-4 rounded-lg">
            <div className="font-medium mb-2">Por categoría</div>
            <div className="text-sm text-gray-600">Filtrar por tipo</div>
          </div>
          <div className="bg-white p-4 rounded-lg">
            <div className="font-medium mb-2">Por estado</div>
            <div className="text-sm text-gray-600">Activo, inactivo, agotado</div>
          </div>
          <div className="bg-white p-4 rounded-lg">
            <div className="font-medium mb-2">Por precio</div>
            <div className="text-sm text-gray-600">Rango personalizado</div>
          </div>
          <div className="bg-white p-4 rounded-lg">
            <div className="font-medium mb-2">Por marketplace</div>
            <div className="text-sm text-gray-600">Donde está publicado</div>
          </div>
          <div className="bg-white p-4 rounded-lg">
            <div className="font-medium mb-2">Por rentabilidad</div>
            <div className="text-sm text-gray-600">Score de IA</div>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-3">💡 Tips</h3>
        <ul className="space-y-2 text-gray-700">
          <li>• Usa el <strong>Publicador Inteligente</strong> para publicar con IA</li>
          <li>• Activa <strong>Autopilot</strong> para gestión automática</li>
          <li>• Revisa <strong>Opportunities</strong> para productos rentables</li>
          <li>• Configura ciclos de vida en <strong>Flexible Dropshipping</strong></li>
        </ul>
      </div>
    </div>
  );
}

// =====================================================
// Las demás secciones siguen el mismo patrón...
// Por brevedad, incluyo solo las funciones stub
// =====================================================

function SistemaAutopilot() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">🤖 Sistema Autopilot</h2>
        <p className="text-gray-600 text-lg">Operación autónoma 24/7</p>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <p className="text-gray-700">
          El sistema Autopilot permite operación completamente autónoma: scraping de productos, análisis con IA, 
          publicación automática, gestión de inventario y monitoreo de precios.
        </p>
      </div>
      <div className="bg-green-50 border border-green-200 rounded-xl p-6">
        <h3 className="font-semibold mb-2">Acceso: Menu → Autopilot</h3>
        <p className="text-gray-700">Configura intervalos, categorías y marketplaces para operación automática.</p>
      </div>
    </div>
  );
}

function Oportunidades() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">🎯 Oportunidades de Negocio</h2>
        <p className="text-gray-600 text-lg">Sistema inteligente para encontrar productos rentables con demanda real</p>
      </div>

      {/* Qué es */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-3">¿Qué es el Sistema de Oportunidades?</h3>
        <p className="text-gray-700 mb-4">
          El sistema de oportunidades analiza productos de AliExpress usando <strong>múltiples criterios de calidad</strong> 
          para identificar solo productos que realmente tienen potencial de venta rápida y rentabilidad real.
        </p>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="bg-white p-4 rounded-lg border border-purple-200">
            <CheckCircle className="w-6 h-6 text-green-600 mb-2" />
            <div className="font-semibold text-gray-900">Validación Real</div>
            <div className="text-sm text-gray-600">Demanda verificada con Google Trends</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-purple-200">
            <CheckCircle className="w-6 h-6 text-green-600 mb-2" />
            <div className="font-semibold text-gray-900">Análisis de Tendencias</div>
            <div className="text-sm text-gray-600">Detección de productos en crecimiento</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-purple-200">
            <CheckCircle className="w-6 h-6 text-green-600 mb-2" />
            <div className="font-semibold text-gray-900">Velocidad de Venta</div>
            <div className="text-sm text-gray-600">Estimación de días hasta primera venta</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-purple-200">
            <CheckCircle className="w-6 h-6 text-green-600 mb-2" />
            <div className="font-semibold text-gray-900">Viabilidad Financiera</div>
            <div className="text-sm text-gray-600">Cálculo de tiempo hasta break-even</div>
          </div>
        </div>
      </div>

      {/* Cómo usar */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">📋 Cómo Usar el Sistema</h3>
        <ol className="space-y-4 text-gray-700">
          <li className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold flex-shrink-0">1</div>
            <div>
              <div className="font-semibold text-gray-900 mb-1">Ir a Opportunities</div>
              <p>Desde el menú lateral, haz clic en <strong>"Opportunities"</strong></p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold flex-shrink-0">2</div>
            <div>
              <div className="font-semibold text-gray-900 mb-1">Ingresar Búsqueda</div>
              <p>Escribe palabras clave del producto que buscas (ej: "phone case", "wireless earbuds")</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold flex-shrink-0">3</div>
            <div>
              <div className="font-semibold text-gray-900 mb-1">Configurar Filtros</div>
              <ul className="list-disc list-inside mt-1 space-y-1 text-sm">
                <li><strong>Marketplace:</strong> Selecciona donde quieres vender (eBay, Amazon, MercadoLibre)</li>
                <li><strong>Región:</strong> País destino (US, MX, CL, etc.)</li>
                <li><strong>Máximo de productos:</strong> Cuántos resultados quieres ver (recomendado: 10-20)</li>
              </ul>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold flex-shrink-0">4</div>
            <div>
              <div className="font-semibold text-gray-900 mb-1">Analizar Resultados</div>
              <p>El sistema mostrará solo productos que cumplen todos los criterios de calidad:</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm bg-white p-3 rounded border border-blue-200">
                <li>✅ Margen mínimo del 10% o más</li>
                <li>✅ Demanda real verificada (volumen de búsqueda ≥ 100)</li>
                <li>✅ Tendencias favorables (no declinantes)</li>
                <li>✅ Tiempo hasta primera venta ≤ 60 días</li>
                <li>✅ Break-even time ≤ 90 días</li>
              </ul>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold flex-shrink-0">5</div>
            <div>
              <div className="font-semibold text-gray-900 mb-1">Seleccionar Oportunidad</div>
              <p>Revisa los detalles de cada oportunidad y haz clic en <strong>"Crear Producto"</strong> para publicarlo</p>
            </div>
          </li>
        </ol>
      </div>

      {/* Criterios de calidad */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">✅ Criterios de Calidad Implementados</h3>
        <div className="space-y-3 text-gray-700">
          <div className="bg-white p-4 rounded-lg border border-green-200">
            <div className="font-semibold text-gray-900 mb-2">1. Margen Rentable</div>
            <p className="text-sm">Margen mínimo del 10% (configurable). El sistema calcula margen considerando: precio de AliExpress, costos de envío, impuestos de importación, y comisiones del marketplace.</p>
          </div>
          <div className="bg-white p-4 rounded-lg border border-green-200">
            <div className="font-semibold text-gray-900 mb-2">2. Demanda Real Verificada</div>
            <p className="text-sm">
              El sistema valida demanda usando <strong>Google Trends (SerpAPI)</strong>. Solo acepta productos con:
            </p>
            <ul className="list-disc list-inside mt-2 text-sm space-y-1">
              <li>Volumen de búsqueda ≥ 100</li>
              <li>Confianza de tendencias ≥ 30%</li>
              <li>Tendencia no declinante con baja confianza</li>
            </ul>
            <p className="text-sm mt-2 text-gray-600">
              💡 <strong>Nota:</strong> Si no tienes SerpAPI configurado, el sistema usará análisis de datos internos como fallback.
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg border border-green-200">
            <div className="font-semibold text-gray-900 mb-2">3. Velocidad de Venta</div>
            <p className="text-sm">
              Estimación de días hasta primera venta basada en volumen de búsqueda, tendencia, y competencia. 
              Solo se aceptan productos con estimación ≤ 60 días (configurable).
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg border border-green-200">
            <div className="font-semibold text-gray-900 mb-2">4. Viabilidad Financiera</div>
            <p className="text-sm">
              Cálculo de tiempo hasta recuperar inversión (break-even). Solo se aceptan productos con break-even ≤ 90 días (configurable).
            </p>
          </div>
        </div>
      </div>

      {/* Información mostrada */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">📊 Información Mostrada en cada Oportunidad</h3>
        <div className="grid grid-cols-2 gap-4 text-gray-700">
          <div className="bg-white p-4 rounded-lg border border-purple-200">
            <div className="font-semibold text-gray-900 mb-2">💰 Financiera</div>
            <ul className="text-sm space-y-1">
              <li>• Precio de compra (AliExpress)</li>
              <li>• Precio sugerido de venta</li>
              <li>• Margen de ganancia (%)</li>
              <li>• ROI (Return on Investment)</li>
              <li>• Costos totales (envío + impuestos)</li>
            </ul>
          </div>
          <div className="bg-white p-4 rounded-lg border border-purple-200">
            <div className="font-semibold text-gray-900 mb-2">📈 Demanda y Tendencias</div>
            <ul className="text-sm space-y-1">
              <li>• Volumen de búsqueda</li>
              <li>• Tendencia (creciente/estable/declinante)</li>
              <li>• Nivel de confianza</li>
              <li>• Razón de viabilidad</li>
            </ul>
          </div>
          <div className="bg-white p-4 rounded-lg border border-purple-200">
            <div className="font-semibold text-gray-900 mb-2">⏱️ Tiempos Estimados</div>
            <ul className="text-sm space-y-1">
              <li>• Días hasta primera venta</li>
              <li>• Días hasta break-even</li>
            </ul>
          </div>
          <div className="bg-white p-4 rounded-lg border border-purple-200">
            <div className="font-semibold text-gray-900 mb-2">🏪 Competencia</div>
            <ul className="text-sm space-y-1">
              <li>• Nivel de competencia</li>
              <li>• Precios promedio en marketplace</li>
              <li>• Precio competitivo sugerido</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Configuración recomendada */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <Info className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">💡 Recomendaciones para Mejores Resultados</h4>
            <ul className="space-y-2 text-gray-700">
              <li>
                <strong>1. Configura Google Trends (SerpAPI):</strong> 
                <span className="text-sm block mt-1">
                  Ve a Settings → Configuración de APIs → Google Trends API (SerpAPI). 
                  Es opcional pero recomendado para validaciones más precisas de demanda real.
                </span>
              </li>
              <li>
                <strong>2. Configura Marketplaces:</strong>
                <span className="text-sm block mt-1">
                  Para análisis de competencia más preciso, configura eBay, Amazon o MercadoLibre. 
                  Sin ellos, el sistema usará estimaciones heurísticas.
                </span>
              </li>
              <li>
                <strong>3. Usa palabras clave específicas:</strong>
                <span className="text-sm block mt-1">
                  En lugar de "phone", busca "iphone 15 pro max case". 
                  Palabras más específicas = resultados más precisos.
                </span>
              </li>
              <li>
                <strong>4. Revisa los filtros:</strong>
                <span className="text-sm block mt-1">
                  Si no encuentras productos, intenta aumentar el margen mínimo o cambiar el marketplace destino.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Finanzas() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">💰 Finanzas y Comisiones</h2>
        <p className="text-gray-600 text-lg">Dashboard financiero completo</p>
      </div>
      <div className="bg-green-50 border border-green-200 rounded-xl p-6">
        <p className="text-gray-700">
          Monitorea ventas, ganancias, comisiones y genera reportes financieros detallados.
        </p>
      </div>
    </div>
  );
}

function ConfiguracionRegional() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">🌍 Configuración Regional</h2>
        <p className="text-gray-600 text-lg">Adapta el sistema a tu región</p>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <p className="text-gray-700">
          Configura: país, moneda, idioma, zona horaria, formatos de fecha/hora y adaptaciones locales.
        </p>
      </div>
    </div>
  );
}

function UsuariosRoles() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">👥 Usuarios y Roles</h2>
        <p className="text-gray-600 text-lg">Gestión multi-usuario</p>
      </div>
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6">
        <p className="text-gray-700">
          Sistema multi-usuario con roles: Admin (control total), User (operación limitada), Viewer (solo lectura).
        </p>
      </div>
    </div>
  );
}

function ReportesAnalytics() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">📊 Reportes y Analytics</h2>
        <p className="text-gray-600 text-lg">Análisis y reportes avanzados</p>
      </div>
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-6">
        <p className="text-gray-700">
          Genera reportes en PDF, Excel y visualiza analytics con gráficas interactivas.
        </p>
      </div>
    </div>
  );
}

function FAQ() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">❓ Preguntas Frecuentes</h2>
      </div>
      
      {[
        {
          q: '¿Necesito configurar todas las APIs?',
          a: 'No. El sistema funciona sin APIs (funcionalidad básica). Para IA solo necesitas GROQ (gratis). Para vender configura el marketplace que prefieras.'
        },
        {
          q: '¿Cómo cambio mi contraseña?',
          a: 'Ve a Settings → Perfil de Usuario → Cambiar contraseña'
        },
        {
          q: '¿Puedo usar múltiples marketplaces?',
          a: 'Sí. Configura las APIs de los marketplaces que necesites y publica en todos simultáneamente.'
        },
        {
          q: '¿Qué es el sistema Autopilot?',
          a: 'Sistema autónomo 24/7 que busca productos, los analiza con IA y los publica automáticamente.'
        },
        {
          q: '¿Las credenciales son seguras?',
          a: 'Sí. Se encriptan con AES-256-GCM antes de almacenarse en la base de datos.'
        },
        {
          q: '¿Cómo funciona el CEO Agent?',
          a: 'Usa GROQ AI para analizar el rendimiento del negocio y tomar decisiones estratégicas automáticas.'
        }
      ].map((faq, idx) => (
        <div key={idx} className="bg-white border rounded-xl p-6">
          <h3 className="font-semibold text-gray-900 mb-2 flex items-start gap-2">
            <HelpCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            {faq.q}
          </h3>
          <p className="text-gray-700 ml-7">{faq.a}</p>
        </div>
      ))}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <div className="flex items-center gap-3">
          <MessageCircle className="w-6 h-6 text-blue-600" />
          <div>
            <h3 className="font-semibold text-gray-900">¿No encuentras tu respuesta?</h3>
            <p className="text-gray-700 text-sm mt-1">
              Contacta al soporte técnico o consulta la documentación completa del sistema.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
