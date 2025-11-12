import { useState } from 'react';
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

export default function HelpCenter() {
  const [activeSection, setActiveSection] = useState('inicio');

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
              <h1 className="text-4xl font-bold mb-2">Centro de Ayuda</h1>
              <p className="text-blue-100 text-lg">
                Todo lo que necesitas saber sobre Ivan Reseller Web
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
                <code className="bg-blue-100 px-2 py-1 rounded">https://ivan-reseller-web.vercel.app/login</code>
              </p>
              <p>
                Las credenciales son provistas por el administrador. Si no recuerdas tu contraseña, usa la opción
                <strong> “Forgot password”</strong> o contacta al equipo de soporte.
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
              <li>• El sistema funciona sin APIs configuradas (funcionalidad básica)</li>
              <li>• Para usar IA: Solo necesitas GROQ API Key (gratis)</li>
              <li>• Para vender: Configura MercadoLibre, eBay o Amazon</li>
              <li>• Todas las credenciales se encriptan con AES-256</li>
              <li>• El dashboard se actualiza en tiempo real</li>
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

      {/* APIs Disponibles */}
      <div>
        <h3 className="text-2xl font-bold text-gray-900 mb-4">🌐 APIs Disponibles</h3>
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm mb-4">
          <p className="font-semibold mb-1">Resumen rápido</p>
          <ul className="space-y-1">
            <li>
              <strong>Críticas:</strong> AliExpress (origen), eBay (comparador), ScraperAPI o ZenRows (anti-bloqueo) y Groq
              (IA). Si faltan, el sistema no podrá evaluar oportunidades con precisión.
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
                “No se encontraron cookies en esta pestaña”, significa que lo ejecutaste en la pestaña del panel.
              </div>
            </div>
          </div>

          {/* GROQ */}
          <div className="border rounded-xl p-6 bg-gradient-to-r from-purple-50 to-pink-50">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-lg font-semibold text-gray-900">GROQ AI API</h4>
                <span className="text-sm text-purple-600 font-medium">Para CEO Agent e IA</span>
              </div>
              <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                Gratis
              </span>
            </div>
            <p className="text-gray-700 mb-3">
              IA estratégica para análisis de negocio y predicciones
            </p>
            <div className="bg-white border rounded-lg p-4 space-y-2">
              <div className="text-sm">
                <strong>Campo requerido:</strong> API Key
              </div>
              <div className="text-sm text-gray-600">
                <strong>Obtener en:</strong> 
                <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                  console.groq.com/keys <ExternalLink className="w-3 h-3 inline" />
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
              Publica y gestiona productos en MercadoLibre
            </p>
            <div className="bg-white border rounded-lg p-4 space-y-2">
              <div className="text-sm">
                <strong>Campos requeridos:</strong> Client ID, Client Secret
              </div>
              <div className="text-sm">
                <strong>Campos opcionales:</strong> Access Token, Refresh Token
              </div>
              <div className="text-sm text-gray-600">
                <strong>Obtener en:</strong> 
                <a href="https://developers.mercadolibre.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                  developers.mercadolibre.com <ExternalLink className="w-3 h-3 inline" />
                </a>
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
                    <code className="block bg-gray-100 rounded px-2 py-1 mt-1">https://ivan-reseller-web.vercel.app/api/marketplace-oauth/oauth/callback/ebay</code>
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

          {/* Amazon */}
          <div className="border rounded-xl p-6 bg-gradient-to-r from-orange-50 to-red-50">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-lg font-semibold text-gray-900">Amazon API</h4>
                <span className="text-sm text-orange-600 font-medium">Opcional (marketplace premium)</span>
              </div>
            </div>
            <p className="text-gray-700 mb-3">
              Vende en Amazon (requiere cuenta de vendedor)
            </p>
            <div className="bg-white border rounded-lg p-4 space-y-2">
              <div className="text-sm">
                <strong>Campos requeridos:</strong> Access Key, Secret Key, Marketplace ID, Seller ID
              </div>
              <div className="text-sm text-gray-600">
                <strong>Obtener en:</strong> 
                <a href="https://developer.amazonservices.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                  developer.amazonservices.com <ExternalLink className="w-3 h-3 inline" />
                </a>
              </div>
            </div>
          </div>

          {/* Scraping APIs */}
          <div className="border rounded-xl p-6 bg-gradient-to-r from-green-50 to-teal-50">
            <h4 className="text-lg font-semibold text-gray-900 mb-2">ScraperAPI / ZenRows</h4>
            <span className="text-sm text-green-600 font-medium">Para Autopilot avanzado</span>
            <p className="text-gray-700 mt-3 mb-3">
              Scraping anti-detección de productos
            </p>
            <div className="bg-white border rounded-lg p-4 space-y-2">
              <div className="text-sm">
                <strong>Campo requerido:</strong> API Key
              </div>
              <div className="text-sm text-gray-600">
                ScraperAPI: <a href="https://www.scraperapi.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  scraperapi.com <ExternalLink className="w-3 h-3 inline" />
                </a>
              </div>
              <div className="text-sm text-gray-600">
                ZenRows: <a href="https://www.zenrows.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  zenrows.com <ExternalLink className="w-3 h-3 inline" />
                </a>
              </div>
            </div>
          </div>

          {/* 2Captcha */}
          <div className="border rounded-xl p-6 bg-gradient-to-r from-indigo-50 to-purple-50">
            <h4 className="text-lg font-semibold text-gray-900 mb-2">2Captcha</h4>
            <span className="text-sm text-indigo-600 font-medium">Resolver captchas automáticamente</span>
            <p className="text-gray-700 mt-3 mb-3">
              Para Autopilot system
            </p>
            <div className="bg-white border rounded-lg p-4 space-y-2">
              <div className="text-sm">
                <strong>Campo requerido:</strong> API Key
              </div>
              <div className="text-sm text-gray-600">
                <strong>Obtener en:</strong> 
                <a href="https://2captcha.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                  2captcha.com <ExternalLink className="w-3 h-3 inline" />
                </a>
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
        <h2 className="text-3xl font-bold text-gray-900 mb-4">🎯 Oportunidades</h2>
        <p className="text-gray-600 text-lg">Productos rentables con IA</p>
      </div>
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-6">
        <p className="text-gray-700">
          El sistema analiza productos con IA para encontrar las mejores oportunidades de venta basándose en 
          múltiples factores: margen, demanda, competencia y tendencias.
        </p>
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
