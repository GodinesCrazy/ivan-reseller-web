/**
 * Indicador del ciclo completo de dropshipping — 8 etapas.
 * Tendencias → Oportunidades → Productos → Publisher → Listing → Orden → Compra prov. → Envío/Cierre
 *
 * Paso 1: Tendencias (detectar nichos)
 * Paso 2: Oportunidades (evaluar candidatos)
 * Paso 3: Productos (revisar, validar, decidir GO/NO-GO)
 * Paso 4: Publisher (aprobar y publicar en marketplace)
 * Paso 5: Listing activo (monitorear listing en marketplace)
 * Paso 6: Orden recibida (sincronizar y gestionar orden del cliente)
 * Paso 7: Compra proveedor (comprar en AliExpress y enviar tracking)
 * Paso 8: Envío / Cierre (fulfillment completado, postventa mínima)
 */
import { Link } from 'react-router-dom';
import { TrendingUp, Search, Package, Send, Globe, ShoppingBag, CreditCard, Truck } from 'lucide-react';

export type CycleStepId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const STEPS = [
  { id: 1 as CycleStepId, label: 'Tendencias',     path: '/dashboard',          search: '?tab=trends', icon: TrendingUp },
  { id: 2 as CycleStepId, label: 'Oportunidades',  path: '/opportunities',      search: '',            icon: Search     },
  { id: 3 as CycleStepId, label: 'Productos',       path: '/products',           search: '',            icon: Package    },
  { id: 4 as CycleStepId, label: 'Publisher',       path: '/publisher',          search: '',            icon: Send       },
  { id: 5 as CycleStepId, label: 'Listing',         path: '/listings',           search: '',            icon: Globe      },
  { id: 6 as CycleStepId, label: 'Orden',           path: '/orders',             search: '',            icon: ShoppingBag},
  { id: 7 as CycleStepId, label: 'Compra prov.',    path: '/pending-purchases',  search: '',            icon: CreditCard },
  { id: 8 as CycleStepId, label: 'Envío/Cierre',    path: '/sales',              search: '',            icon: Truck      },
] as const;

interface CycleStepsBreadcrumbProps {
  currentStep: CycleStepId;
  compact?: boolean;
}

export default function CycleStepsBreadcrumb({ currentStep, compact = false }: CycleStepsBreadcrumbProps) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 text-xs text-slate-500 dark:text-slate-400">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const isCurrent = step.id === currentStep;
        const isPast = step.id < currentStep;
        const href = step.path + (step.search || '');
        return (
          <span key={step.id} className="flex items-center gap-0.5">
            {i > 0 && (
              <span className={`select-none mx-0.5 ${isPast || isCurrent ? 'text-slate-400 dark:text-slate-500' : 'text-slate-200 dark:text-slate-700'}`}>
                →
              </span>
            )}
            {isCurrent ? (
              <span className="flex items-center gap-1 px-2 py-1 bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 rounded-md font-semibold">
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {!compact && <span>{step.label}</span>}
              </span>
            ) : isPast ? (
              <Link
                to={href}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                title={step.label}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {!compact && <span className="hidden sm:inline">{step.label}</span>}
              </Link>
            ) : (
              <Link
                to={href}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-slate-300 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-500 dark:hover:text-slate-400 transition-colors"
                title={step.label}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {!compact && <span className="hidden md:inline">{step.label}</span>}
              </Link>
            )}
          </span>
        );
      })}
    </div>
  );
}
