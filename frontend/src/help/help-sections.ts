/**
 * Estructura de secciones de ayuda para Ivan Reseller
 * Usado por HelpCenter, tooltips y componentes de onboarding
 */

export type HelpSectionId =
  | 'dashboard'
  | 'ganancia-neta'
  | 'comision-plataforma'
  | 'autopilot'
  | 'dynamic-pricing'
  | 'profit-guard'
  | 'learning-engine'
  | 'account-rotation'
  | 'daily-limits'
  | 'opportunities'
  | 'products'
  | 'sales'
  | 'paypal-payout'
  | 'admin-revenue'
  | 'empty-opportunities'
  | 'empty-products'
  | 'empty-sales'
  | 'empty-accounts';

export interface HelpSection {
  id: HelpSectionId;
  title: string;
  /** Qu� hace la funcionalidad */
  whatItDoes: string;
  /** C�mo genera dinero */
  howItMakesMoney: string;
  /** Qu� hace el sistema autom�ticamente */
  systemAutomation?: string;
  /** Qu� debe configurar el usuario */
  userMustConfigure?: string;
  /** Errores comunes */
  commonMistakes?: string;
  /** Resultados esperados */
  expectedResults?: string;
  /** Texto corto para tooltip */
  tooltipShort?: string;
}
