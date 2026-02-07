/**
 * Wrapper seguro para Help Center - ErrorBoundary + fallback, nunca pantalla en blanco
 * HelpCenter se importa directamente para evitar fallos de lazy() en producción
 */
import { HelpErrorBoundary } from './HelpErrorBoundary';
import { HelpFallbackUI } from './HelpFallbackUI';
import HelpCenter from '@/pages/HelpCenter';

const FALLBACK_UI = (
  <HelpFallbackUI message="Ocurrió un error. Por favor, recarga la página o contacta soporte." />
);

export function HelpCenterSafe() {
  return (
    <HelpErrorBoundary fallback={FALLBACK_UI}>
      <HelpCenter />
    </HelpErrorBoundary>
  );
}
