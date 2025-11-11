import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';

interface SessionInfo {
  success: boolean;
  provider: string;
  status: 'pending' | 'completed' | 'expired';
  loginUrl: string;
  expiresAt?: string;
  completedAt?: string;
}

const providerLabels: Record<string, string> = {
  aliexpress: 'AliExpress',
};

function parseCookies(raw: string): any[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // ignore
  }

  if (trimmed.includes('=')) {
    return trimmed
      .split(';')
      .map(chunk => chunk.trim())
      .filter(Boolean)
      .map(pair => {
        const [name, ...rest] = pair.split('=');
        const value = rest.join('=');
        return {
          name,
          value,
          domain: '.aliexpress.com',
          path: '/',
        };
      });
  }

  return [];
}

export default function ManualLogin() {
  const { token } = useParams<{ token: string }>();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cookiesText, setCookiesText] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renewing, setRenewing] = useState(false);

  useEffect(() => {
    const loadSession = async () => {
      if (!token) {
        setLoading(false);
        setLoadError('session_not_found');
        return;
      }
      try {
        const response = await fetch(`/api/manual-auth/${token}`);
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'session_not_found');
        }
        setSession(data);
        setLoadError(null);
      } catch (error: any) {
        const message = error?.message || 'session_not_found';
        setLoadError(message);
        setSession(null);
        toast.error(message === 'session_not_found' ? 'La sesión ha expirado. Solicita una nueva.' : message);
      } finally {
        setLoading(false);
      }
    };

    loadSession();
  }, [token]);

  const provider = session?.provider || 'aliexpress';

  const handleRequestNewSession = async () => {
    setRenewing(true);
    try {
      const response = await fetch('/api/manual-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || 'No se pudo generar una nueva sesión');
      }
      toast.success('Se generó una nueva sesión. Abriendo ventana...');
      window.location.replace(`/manual-login/${data.token}`);
    } catch (error: any) {
      toast.error(error.message || 'Error creando nueva sesión. Inténtalo nuevamente.');
    } finally {
      setRenewing(false);
    }
  };

  const expiresLabel = useMemo(() => {
    if (!session?.expiresAt) return null;
    try {
      return new Intl.DateTimeFormat('es-ES', {
        dateStyle: 'short',
        timeStyle: 'medium',
      }).format(new Date(session.expiresAt));
    } catch {
      return session.expiresAt;
    }
  }, [session?.expiresAt]);

  const handleOpenLogin = () => {
    if (session?.loginUrl) {
      window.open(session.loginUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleSaveCookies = async () => {
    if (!token) return;
    const parsedCookies = parseCookies(cookiesText);
    if (parsedCookies.length === 0) {
      toast.error('Por favor pega las cookies en formato válido (JSON o document.cookie).');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/manual-auth/${token}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider,
          cookies: parsedCookies,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || 'No se pudo guardar la sesión');
      }
      toast.success('Sesión guardada correctamente. Vuelve a la plataforma y reintenta la búsqueda.');
      setSession((prev) => (prev ? { ...prev, status: 'completed', completedAt: new Date().toISOString() } : prev));
      setCookiesText('');
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar la sesión');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-600">
        Cargando sesión…
      </div>
    );
  }

  const renderRenewButton = (
    <button
      onClick={handleRequestNewSession}
      disabled={renewing}
      className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
    >
      {renewing ? 'Generando nueva sesión…' : 'Generar nueva sesión'}
    </button>
  );

  if (!session || loadError === 'session_not_found') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center text-gray-600">
        <p>La sesión no existe o ha expirado.</p>
        {renderRenewButton}
      </div>
    );
  }

  if (session.status === 'expired') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center text-gray-600">
        <p>⚠️ Esta sesión ha expirado. Solicita una nueva para continuar.</p>
        {renderRenewButton}
      </div>
    );
  }

  const providerLabel = providerLabels[session.provider] || session.provider;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="bg-white shadow border border-gray-200 rounded-lg p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Autenticación manual en {providerLabel}</h1>
            <p className="text-gray-600">Sigue los pasos para iniciar sesión manualmente. La sesión expira {expiresLabel ? `el ${expiresLabel}` : 'en unos minutos'}.</p>
          </div>

          {session.status === 'completed' ? (
            <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded">
              ✅ Sesión guardada correctamente. Puedes cerrar esta ventana.
            </div>
          ) : (
            <div className="space-y-6">
              <section className="space-y-2">
                <h2 className="text-lg font-semibold text-gray-800">1. Abrir la página de login</h2>
                <p className="text-gray-600 text-sm">
                  Haz clic en el siguiente botón para abrir la página oficial de AliExpress en una nueva pestaña y completa el inicio de sesión.
                </p>
                <button
                  onClick={handleOpenLogin}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition"
                >
                  Abrir login de AliExpress
                </button>
              </section>

              <section className="space-y-2">
                <h2 className="text-lg font-semibold text-gray-800">2. Copiar las cookies de la sesión</h2>
                <p className="text-gray-600 text-sm">
                  Una vez iniciada la sesión, abre la consola del navegador (F12 → Console) y pega el siguiente snippet:
                </p>
                <pre className="bg-gray-900 text-green-200 text-xs rounded-md p-3 overflow-x-auto">
{`copy(JSON.stringify(
  document.cookie.split(';').map(c => {
    const [name, ...rest] = c.trim().split('=');
    return { name, value: rest.join('='), domain: '.aliexpress.com', path: '/' };
  })
))`}
                </pre>
                <p className="text-gray-600 text-sm">
                  Esto copiará las cookies al portapapeles en formato JSON. Pégalas en el cuadro de abajo.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-lg font-semibold text-gray-800">3. Pegar y guardar</h2>
                <textarea
                  rows={8}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono"
                  placeholder="Pega aquí el JSON de cookies o el resultado de document.cookie"
                  value={cookiesText}
                  onChange={(e) => setCookiesText(e.target.value)}
                />
                <button
                  onClick={handleSaveCookies}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Guardando…' : 'Guardar sesión'}
                </button>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

