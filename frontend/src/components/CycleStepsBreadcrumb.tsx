/**
 * Indicador del ciclo completo de dropshipping.
 * Tendencias → Oportunidades → Publicación → Venta → Compra proveedor → Envío
 */
import { Link } from 'react-router-dom';
import { TrendingUp, Search, Send, ShoppingCart, CreditCard, Truck } from 'lucide-react';

export type CycleStepId = 1 | 2 | 3 | 4 | 5 | 6;

const STEPS = [
  { id: 1 as CycleStepId, label: 'Tendencias', path: '/dashboard', search: '?tab=trends', icon: TrendingUp },
  { id: 2 as CycleStepId, label: 'Oportunidades', path: '/opportunities', search: '', icon: Search },
  { id: 3 as CycleStepId, label: 'Publicación', path: '/products', search: '', icon: Send },
  { id: 4 as CycleStepId, label: 'Venta', path: '/sales', search: '', icon: ShoppingCart },
  { id: 5 as CycleStepId, label: 'Compra proveedor', path: '/pending-purchases', search: '', icon: CreditCard },
  { id: 6 as CycleStepId, label: 'Envío', path: '/orders', search: '', icon: Truck },
] as const;

interface CycleStepsBreadcrumbProps {
  currentStep: CycleStepId;
  compact?: boolean;
}

export default function CycleStepsBreadcrumb({ currentStep, compact = false }: CycleStepsBreadcrumbProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const isCurrent = step.id === currentStep;
        const href = step.path + (step.search || '');
        return (
          <span key={step.id} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-300">→</span>}
            {isCurrent ? (
              <span className="flex items-center gap-1 px-2 py-1 bg-primary-100 text-primary-800 rounded font-medium">
                <Icon className="w-3.5 h-3.5" /> {step.label}
              </span>
            ) : (
              <Link
                to={href}
                className="flex items-center gap-1 px-2 py-1 text-gray-600 hover:bg-gray-100 rounded hover:text-primary-600 transition"
              >
                <Icon className="w-3.5 h-3.5" /> {step.label}
              </Link>
            )}
          </span>
        );
      })}
    </div>
  );
}
