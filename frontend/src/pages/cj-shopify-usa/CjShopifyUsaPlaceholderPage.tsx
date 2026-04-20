export default function CjShopifyUsaPlaceholderPage({ title }: { title: string }) {
  return (
    <div className="p-8 text-center bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
      <h2 className="text-xl font-medium text-slate-800 dark:text-slate-100">{title}</h2>
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        Esta sección se encuentra en desarrollo. <br />
        (Arquitectura CJ → Shopify USA en curso).
      </p>
    </div>
  );
}
