import { Outlet, Navigate } from 'react-router-dom';

const ENABLED = import.meta.env.VITE_ENABLE_CJ_ML_CHILE_MODULE === 'true';

export default function CjMlChileModuleGate() {
  if (!ENABLED) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-8 text-center space-y-3">
        <p className="text-lg font-semibold text-slate-800 dark:text-slate-200">Módulo CJ → ML Chile desactivado</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Activa <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded text-xs">VITE_ENABLE_CJ_ML_CHILE_MODULE=true</code> en el frontend para habilitar este canal.
        </p>
      </div>
    );
  }
  return <Outlet />;
}
