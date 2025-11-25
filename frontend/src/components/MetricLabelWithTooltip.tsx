import React from 'react';

export interface MetricLabelWithTooltipProps {
  /** Label del indicador (ej: "Confianza IA", "Margen") */
  label: string;
  /** Título del tooltip (opcional, por defecto usa el label) */
  tooltipTitle?: string;
  /** Cuerpo del tooltip con explicación */
  tooltipBody: string;
  /** Contenido del indicador (valor, icono, etc.) */
  children?: React.ReactNode;
  /** Clases CSS adicionales para el contenedor */
  className?: string;
}

/**
 * Componente reutilizable para mostrar métricas con tooltip informativo
 * Basado en el patrón usado para "Confianza IA"
 */
export default function MetricLabelWithTooltip({
  label,
  tooltipTitle,
  tooltipBody,
  children,
  className = ''
}: MetricLabelWithTooltipProps) {
  return (
    <div className={`relative group inline-block ${className}`}>
      <span
        className="cursor-help"
        title={tooltipBody.replace(/<[^>]*>/g, '')} // Strip HTML for native tooltip
      >
        {children || label}
      </span>
      <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-normal w-64 z-50 shadow-lg">
        <strong>{tooltipTitle || label}:</strong>
        <br />
        <span dangerouslySetInnerHTML={{ __html: tooltipBody.replace(/\n/g, '<br />') }} />
      </span>
    </div>
  );
}

