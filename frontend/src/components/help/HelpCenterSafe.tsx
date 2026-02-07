/**
 * Wrapper seguro para Help Center - ErrorBoundary + fallback, nunca pantalla en blanco
 */
import { Suspense, lazy } from 'react';
import { HelpErrorBoundary } from './HelpErrorBoundary';
import { HelpFallbackUI } from './HelpFallbackUI';

const HelpCenter = lazy(() => import('@pages/HelpCenter'));

const Loader = () => (
  <HelpFallbackUI message="Cargando centro de ayuda..." />
);

export function HelpCenterSafe() {
  return (
    <HelpErrorBoundary fallback={<HelpFallbackUI message="Ocurrió un error. Por favor, recarga la página o contacta soporte." />}>
      <Suspense fallback={<Loader />}>
        <HelpCenter />
      </Suspense>
    </HelpErrorBoundary>
  );
}
