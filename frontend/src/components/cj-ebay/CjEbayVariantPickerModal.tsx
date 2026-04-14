import { useEffect, useId, useState } from 'react';
import { cjVariantKey, cjVariantLabel, type CjProductVariantApi } from '@/lib/cjEbayVariantUtils';

type Props = {
  open: boolean;
  productTitle: string;
  cjProductId: string;
  variants: CjProductVariantApi[];
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (variantKey: string) => void;
};

/**
 * Modal to pick CJ vid/SKU when product has multiple variants (Opportunities / Research).
 */
export default function CjEbayVariantPickerModal({
  open,
  productTitle,
  cjProductId,
  variants,
  busy,
  onCancel,
  onConfirm,
}: Props) {
  const idBase = useId();
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    if (!open || variants.length === 0) {
      setSelected('');
      return;
    }
    setSelected(cjVariantKey(variants[0]!));
  }, [open, variants]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${idBase}-title`}
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-5 space-y-4">
        <h2 id={`${idBase}-title`} className="text-lg font-semibold text-slate-900 dark:text-white">
          Elegí variante CJ
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          El producto <span className="font-medium">{productTitle.slice(0, 80)}</span> tiene varias variantes.
          Seleccioná la que querés usar para eBay. <span className="text-slate-500">PID: {cjProductId}</span>
        </p>
        <div>
          <label htmlFor={`${idBase}-sel`} className="block text-xs font-medium text-slate-500 mb-1">
            Variante (vid o SKU)
          </label>
          <select
            id={`${idBase}-sel`}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={busy}
          >
            {variants.map((v) => {
              const key = cjVariantKey(v);
              return (
                <option key={key} value={key}>
                  {cjVariantLabel(v)}
                </option>
              );
            })}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            onClick={onCancel}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-sm bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
            onClick={() => onConfirm(selected)}
            disabled={busy || !selected}
          >
            {busy ? 'Procesando…' : 'Continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}
