export default function CjEbayPlaceholderPage({
  title,
  phaseNote,
}: {
  title: string;
  phaseNote: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/30 px-5 py-8 text-center">
      <h2 className="text-lg font-medium text-slate-800 dark:text-slate-200">{title}</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto">
        Placeholder honesto — {phaseNote}. No hay datos simulados de CJ ni eBay.
      </p>
    </div>
  );
}
