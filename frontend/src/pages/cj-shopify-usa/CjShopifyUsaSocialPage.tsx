import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { Share2, Instagram, MessageCircle, RefreshCw, PenTool, Calendar, Link as LinkIcon, CheckCircle2, Zap } from 'lucide-react';
import {
  ActionPriorityBand,
  CommercialMetricCard,
  CommercialPageHeader,
  CycleNarrativeStrip,
} from './components/CommercialCockpit';

interface SocialCandidate {
  listingId: number;
  title: string;
  handle: string;
  priceUsd: number;
  url: string | null;
  caption: string;
}

interface SocialAutopilotData {
  ok: boolean;
  status: string;
  platforms: {
    instagram: { required: string[]; canAutoPublishNow: boolean };
    tiktok: { required: string[]; canAutoPublishNow: boolean };
  };
  candidates: SocialCandidate[];
}

export default function CjShopifyUsaSocialPage() {
  const [data, setData] = useState<SocialAutopilotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await api.get<SocialAutopilotData>('/api/cj-shopify-usa/analytics/social-autopilot');
      setData(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  // Simulador de Motor de Contenido (Task 20) conectado al backend híbrido
  async function generateAIContent(listingId: number, title: string, priceUsd: number, handle: string | null) {
    setGenerating(listingId);
    try {
      const res = await api.post<{ ok: boolean; caption: string }>('/api/cj-shopify-usa/analytics/social-autopilot/generate-caption', {
        listingId,
        title,
        priceUsd,
        handle,
        platform: 'pinterest',
      });
      
      if (res.data.ok) {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            candidates: prev.candidates.map((c) => 
              c.listingId === listingId ? { ...c, caption: res.data.caption } : c
            )
          };
        });
      }
    } catch {
      // Ignorar el error visualmente por simplicidad en esta fase, o agregar toast
    } finally {
      setGenerating(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-500">
        <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
        Cargando Social Autopilot...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-white space-y-6">
      <CommercialPageHeader
        title="Promocion organica"
        description="Convierte productos publicados en contenido Pinterest/social para generar trafico sin ads pagados."
      />

      <ActionPriorityBand
        tone={(data?.candidates.length ?? 0) > 0 ? 'violet' : 'cyan'}
        title={(data?.candidates.length ?? 0) > 0 ? 'Hay productos listos para generar contenido organico.' : 'No hay candidatos sociales en este momento.'}
        description="Social queda integrado al ciclo comercial: promocionar productos con margen, medir respuesta y repetir ganadores."
        primaryLabel="Actualizar"
        onPrimary={() => void loadData()}
        secondaryLabel={(data?.candidates.length ?? 0) > 0 ? 'Abrir agente' : undefined}
        onSecondary={(data?.candidates.length ?? 0) > 0 ? () => window.location.assign('/cj-shopify-usa/sales-agent') : undefined}
        meta={[
          `${data?.candidates.length ?? 0} candidatos`,
          `instagram ${data?.platforms.instagram.canAutoPublishNow ? 'auto' : 'manual'}`,
          `tiktok ${data?.platforms.tiktok.canAutoPublishNow ? 'auto' : 'manual'}`,
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <CommercialMetricCard label="Candidatos" value={data?.candidates.length ?? 0} detail="para contenido organico" tone="violet" />
        <CommercialMetricCard label="Instagram" value={data?.platforms.instagram.canAutoPublishNow ? 'auto' : 'manual'} detail="estado publicacion" tone="cyan" />
        <CommercialMetricCard label="TikTok" value={data?.platforms.tiktok.canAutoPublishNow ? 'auto' : 'manual'} detail="estado publicacion" tone="cyan" />
      </div>

      <CycleNarrativeStrip active="promote" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
            <Share2 className="h-6 w-6 text-fuchsia-400" />
            Social Autopilot
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Motor de contenido orgánico y distribución en redes (Fase 5)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Panel Izquierdo: Cuentas y Estado */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
              <LinkIcon className="h-4 w-4 text-slate-400" />
              Cuentas Conectadas
            </h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-emerald-500/20 p-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-emerald-300">Pinterest (Vía Shopify)</p>
                    <p className="text-xs text-emerald-400/70">Catálogo sincronizado auto</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-slate-800 p-2">
                    <Instagram className="h-4 w-4 text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-300">Instagram</p>
                    <p className="text-[10px] text-slate-500">
                      {data?.platforms.instagram.required[0] ?? 'Requiere OAuth'}
                    </p>
                  </div>
                </div>
                <button className="rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700">
                  Conectar
                </button>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-slate-800 p-2">
                    <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12.525.02c1.31-.02 2.61-.01 3.91.04.15 1.56.81 3.03 1.84 4.14 1.05 1.13 2.53 1.8 4.09 1.95v3.91c-1.39-.08-2.73-.55-3.88-1.35-.11.83-.16 1.66-.16 2.5 0 2.57-1.12 5.02-3.08 6.74-1.92 1.69-4.5 2.55-7.08 2.37-2.61-.17-5.04-1.38-6.75-3.34-1.72-1.99-2.58-4.63-2.38-7.25.19-2.65 1.45-5.11 3.49-6.85 1.99-1.69 4.63-2.53 7.25-2.31v4.06c-1.29-.11-2.61.27-3.61 1.08-1.01.81-1.63 2.05-1.66 3.35-.03 1.32.55 2.59 1.54 3.44 1.01.86 2.38 1.25 3.69 1.05 1.31-.19 2.47-.94 3.19-2.06.55-.83.84-1.81.84-2.82V.02z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-300">TikTok</p>
                    <p className="text-[10px] text-slate-500">
                      {data?.platforms.tiktok.required[0] ?? 'Requiere API Approval'}
                    </p>
                  </div>
                </div>
                <button className="rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700">
                  Conectar
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <h3 className="text-sm font-bold text-slate-200 mb-2 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-400" />
              Scheduling Social
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              El agente vendedor seleccionará automáticamente tus productos "Grado A" y los promocionará (hasta 5 a la vez).
            </p>
            <button 
              onClick={async () => {
                setLoading(true);
                try {
                  const res = await api.post('/api/cj-shopify-usa/sales-agent/actions', {
                    actionType: 'PROMOTE_TOP_PRODUCTS',
                    limit: 3
                  });
                  if (res.data.blockedByLock) {
                    alert(res.data.message);
                  } else {
                    alert(res.data.message || 'Se encolaron los productos exitosamente.');
                    loadData();
                  }
                } catch (e) {
                  alert('Error al ejecutar el scheduler social.');
                } finally {
                  setLoading(false);
                }
              }}
              className="w-full rounded bg-indigo-600/20 px-3 py-2 text-xs font-bold text-indigo-400 hover:bg-indigo-600/30 border border-indigo-500/30 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="h-3 w-3" />
              Promocionar Top Productos
            </button>
          </div>
        </div>

        {/* Panel Derecho: Motor de Contenido */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
              <PenTool className="h-5 w-5 text-indigo-400" />
              Motor de Contenido (Candidatos)
            </h2>
            <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-xs font-bold text-indigo-300">
              {data?.candidates.length ?? 0} listos
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {data?.candidates.map((c) => (
              <div key={c.listingId} className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-800/60 bg-slate-900 flex-shrink-0">
                  <h4 className="text-sm font-bold text-slate-200 line-clamp-1" title={c.title}>
                    {c.title}
                  </h4>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs font-mono text-emerald-400">${c.priceUsd.toFixed(2)}</span>
                    <a href={c.url ?? '#'} target="_blank" rel="noreferrer" className="text-xs text-indigo-400 hover:underline line-clamp-1">
                      {c.handle}
                    </a>
                  </div>
                </div>
                
                <div className="p-4 flex-1 flex flex-col bg-slate-950">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 block">
                    Caption Generado
                  </label>
                  <textarea
                    readOnly
                    className="w-full flex-1 resize-none rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 min-h-[100px]"
                    value={c.caption}
                  />
                  
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => generateAIContent(c.listingId, c.title, c.priceUsd, c.handle)}
                      disabled={generating === c.listingId}
                      className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                      {generating === c.listingId ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <PenTool className="h-3 w-3" />
                      )}
                      {generating === c.listingId ? 'Generando...' : 'Re-escribir con IA'}
                    </button>
                    <button className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 transition-colors">
                      <MessageCircle className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            {data?.candidates.length === 0 && (
              <div className="col-span-2 rounded-xl border border-slate-800 border-dashed py-12 text-center">
                <p className="text-sm text-slate-500">No hay productos activos elegibles para redes sociales.</p>
              </div>
            )}
          </div>
          
          <div className="mt-8 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-indigo-950/30 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-400" />
                  Auto-Optimizador SEO en Bulk
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-lg leading-relaxed">
                  Utiliza el Motor de Contenido para detectar descripciones pobres en Shopify y re-escribirlas automáticamente con ganchos comerciales y emojis. Esto impactará tu SEO orgánico en Google y tu catálogo de Pinterest instantáneamente.
                </p>
              </div>
              <button 
                onClick={async () => {
                  if (confirm('¿Estás seguro de optimizar las descripciones en Shopify? Esto usará el Motor de Contenido para 10 productos.')) {
                    setLoading(true);
                    try {
                      const res = await api.post('/api/cj-shopify-usa/analytics/seo-optimizer/run');
                      alert(`¡Éxito! Se optimizaron ${res.data.processed} productos en Shopify.`);
                      loadData();
                    } catch (e) {
                      alert('Error optimizando el SEO en bulk.');
                      setLoading(false);
                    }
                  }
                }}
                className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.3)] transition-all"
              >
                Optimizar Catálogo Ahora
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
