import { Link } from 'react-router-dom';

type Props = {
  /** Listings page: mention publish block flag */
  variant?: 'listings' | 'orders';
};

/**
 * Clarifies legacy Orders vs CJ eBay vertical for operators (FASE cierre operativo).
 */
export default function CjEbayOperatorPathCallout({ variant = 'listings' }: Props) {
  return (
    <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/80 dark:bg-indigo-950/30 px-4 py-3 text-sm text-indigo-950 dark:text-indigo-100 space-y-2">
      <p className="font-semibold text-indigo-900 dark:text-indigo-50">Flujo operador: CJ → eBay → venta → postventa</p>
      <ul className="list-disc pl-5 space-y-1.5 text-xs leading-relaxed">
        <li>
          <strong>Credencial CJ (admin/user):</strong>{' '}
          <Link to="/api-settings" className="underline font-medium">
            API / integraciones
          </Link>
          — guardá la CJ API Key ahí (solo backend; probá conexión sin exponer la clave completa).
        </li>
        <li>
          <strong>Draft / publicar listing:</strong>{' '}
          <Link to="/opportunities" className="underline font-medium">
            Oportunidades
          </Link>{' '}
          o{' '}
          <Link to="/product-research" className="underline font-medium">
            Product Research
          </Link>
          , luego revisá el estado aquí en <strong>Listings</strong>.
        </li>
        <li>
          <strong>Postventa canónica (CJ + eBay):</strong>{' '}
          <Link to="/cj-ebay/orders" className="underline font-medium">
            Órdenes CJ eBay
          </Link>
          — importá la orden eBay por ID; <em>Place → Confirmar → Pagar → Tracking</em> según tu modo de checkout.
        </li>
        <li>
          <strong>Órdenes globales (sync marketplace):</strong>{' '}
          <Link to="/orders" className="underline font-medium">
            Orders
          </Link>
          — puede aparecer una fila con <code className="text-[10px] px-1 rounded bg-white/60 dark:bg-black/30">supplier=cj</code> si el sync
          emparejó el SKU del listing CJ (complementario al vertical anterior).
        </li>
      </ul>
      {variant === 'listings' && (
        <p className="text-[11px] text-amber-900 dark:text-amber-200/90 border-t border-indigo-200/60 dark:border-indigo-800/50 pt-2">
          Si el servidor tiene{' '}
          <code className="text-[10px] bg-white/70 dark:bg-black/40 px-1 rounded">BLOCK_NEW_PUBLICATIONS=true</code>, la publicación
          devuelve 423 hasta desbloquear; el borrador puede existir igualmente.
        </p>
      )}
      {variant === 'orders' && (
        <p className="text-[11px] text-slate-600 dark:text-slate-400 border-t border-indigo-200/60 dark:border-indigo-800/50 pt-2">
          Pago real CJ vía API suele exigir{' '}
          <code className="text-[10px] px-1 rounded bg-white/60 dark:bg-black/30">CJ_PHASE_D_ALLOW_PAY=true</code> y política interna;
          revisá runbook de postventa antes de ejecutar pay en producción.
        </p>
      )}
    </div>
  );
}
