import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { Share2, Instagram, MessageCircle, RefreshCw, PenTool, Calendar, Link as LinkIcon, CheckCircle2 } from 'lucide-react';

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

  // Simulador de Motor de Contenido (Task 20)
  async function generateAIContent(listingId: number, title: string) {
    setGenerating(listingId);
    try {
      // En un futuro esto llamará a POST /api/cj-shopify-usa/analytics/social-autopilot/generate-caption
      await new Promise((resolve) => setTimeout(resolve, 1500));
      
      const hooks = [
        `¿Tu mascota también hace esto? 🐾 Descubre el nuevo ${title}.`,
        `Simplifica tu vida y la de tu mejor amigo con ${title} ✨`,
        `El secreto para una rutina perfecta de cuidado animal 🤫 👇`
      ];
      const selectedHook = hooks[Math.floor(Math.random() * hooks.length)];
      
      const newCaption = `${selectedHook}\n\n👉 Consíguelo ahora en PawVault y mejora su calidad de vida.\n\n#PawVault #MascotasFelices #PetLovers #DogLife #CatLife`;

      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          candidates: prev.candidates.map((c) => 
            c.listingId === listingId ? { ...c, caption: newCaption } : c
          )
        };
      });
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
              Scheduling (En progreso)
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              El agente vendedor seleccionará productos "Grado A" para crear posts orgánicos automáticamente. Esta funcionalidad se activará al conectar las cuentas.
            </p>
            <div className="rounded bg-slate-950 p-3 text-center border border-slate-800 border-dashed">
              <span className="text-xs text-slate-600 font-semibold uppercase tracking-widest">Inactivo</span>
            </div>
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
                      onClick={() => generateAIContent(c.listingId, c.title)}
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
        </div>

      </div>
    </div>
  );
}
