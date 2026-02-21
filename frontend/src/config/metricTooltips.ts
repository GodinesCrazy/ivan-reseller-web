/**
 * Configuración centralizada de tooltips para métricas e indicadores
 * Textos de ayuda para usuarios en español
 */

export const metricTooltips = {
  // ==================== MÉTRICAS DE RENTABILIDAD ====================
  
  /**
   * Margen de ganancia porcentual
   */
  profitMargin: {
    title: 'Margen (%)',
    body: 'Porcentaje estimado de utilidad bruta sobre el precio de venta después de costos y comisiones. Un margen alto indica mayor rentabilidad potencial por unidad vendida.'
  },

  /**
   * Ganancia potencial en términos monetarios
   */
  potentialProfit: {
    title: 'Ganancia Potencial',
    body: 'Monto estimado de utilidad por unidad vendida, considerando costos, comisiones de marketplace y tipo de cambio actual. Este valor puede variar según las condiciones reales de venta.'
  },

  /**
   * ROI (Return on Investment)
   */
  roi: {
    title: 'ROI (%)',
    body: 'Retorno de inversión porcentual. Indica cuánto se gana por cada dólar invertido. Un ROI alto significa que la inversión se recupera rápidamente con buenas ganancias.'
  },

  // ==================== MÉTRICAS DE IA ====================
  
  /**
   * Confianza de la IA en la oportunidad
   */
  aiConfidence: {
    title: 'Confianza IA',
    body: 'Indica qué tan segura está la inteligencia artificial sobre esta oportunidad.<br /><strong>0–39%:</strong> baja confianza (revisa con más detalle).<br /><strong>40–69%:</strong> confianza media (requiere análisis manual).<br /><strong>70–100%:</strong> alta confianza (condiciones favorables según los datos analizados).'
  },

  // ==================== MÉTRICAS DE MERCADO ====================
  
  /**
   * Nivel de competencia en el marketplace
   */
  competition: {
    title: 'Competencia',
    body: 'Nivel de oferta disponible de productos similares en el marketplace seleccionado. <strong>Baja:</strong> poca competencia, mayor oportunidad. <strong>Media:</strong> competencia moderada. <strong>Alta:</strong> mercado saturado, requiere diferenciación.'
  },

  /**
   * Nivel de demanda real
   */
  demand: {
    title: 'Demanda Real',
    body: 'Indicador basado en datos históricos de ventas y búsquedas en el marketplace seleccionado. Indica qué tan probable es que el producto se venda basándose en el comportamiento de compradores anteriores.'
  },

  /**
   * Tendencias de mercado
   */
  trend: {
    title: 'Tendencia',
    body: 'Dirección del mercado para productos similares:<br /><strong>Rising:</strong> demanda en aumento, buen momento para entrar.<br /><strong>Stable:</strong> mercado estable, ventas predecibles.<br /><strong>Declining:</strong> demanda en descenso, considerar alternativas.'
  },

  /**
   * Ventas mensuales estimadas
   */
  monthlySales: {
    title: 'Ventas/mes',
    body: 'Número estimado de unidades vendidas por mes para productos similares en el marketplace. Basado en análisis de datos históricos y competencia. Valores estimados pueden variar según condiciones reales.'
  },

  /**
   * Número de proveedores disponibles
   */
  suppliers: {
    title: 'Proveedores',
    body: 'Cantidad de proveedores que ofrecen productos similares en AliExpress o fuentes similares. Más proveedores generalmente significa mejores precios y mayor disponibilidad de stock.'
  },

  // ==================== ESTADOS DE PRODUCTO ====================
  
  /**
   * Estado: PENDING
   */
  statusPending: {
    title: 'Estado: PENDING',
    body: 'El producto está pendiente de revisión. Requiere aprobación manual antes de poder ser publicado en el marketplace.'
  },

  /**
   * Estado: APPROVED
   */
  statusApproved: {
    title: 'Estado: APPROVED',
    body: 'El producto ha sido aprobado y está listo para publicarse. Puede procederse con la publicación en el marketplace seleccionado.'
  },

  /**
   * Estado: PUBLISHED
   */
  statusPublished: {
    title: 'Estado: PUBLISHED',
    body: 'El producto ya fue publicado en el marketplace correspondiente. Los cambios se sincronizan según la configuración de Ivan Reseller. Puedes ver la publicación usando el botón "View on Marketplace".'
  },

  /**
   * Estado: REJECTED
   */
  statusRejected: {
    title: 'Estado: REJECTED',
    body: 'El producto fue rechazado durante la revisión. Revisa los motivos y corrige los problemas antes de reintentar la aprobación.'
  },

  // ==================== PRECIOS ====================
  
  /**
   * Precio actual del producto
   */
  currentPrice: {
    title: 'Precio Actual',
    body: 'Precio actual de compra del producto en AliExpress o fuente original, en la moneda original del proveedor. Este es el costo base para calcular ganancias.'
  },

  /**
   * Precio sugerido de venta
   */
  suggestedPrice: {
    title: 'Precio Sugerido',
    body: 'Precio recomendado de venta en el marketplace, calculado para maximizar ganancias considerando costos, comisiones y competencia. Este valor puede ser estimado si faltan datos de competencia.'
  },

  // ==================== MARKETPLACE ====================
  
  /**
   * Marketplace donde se publica
   */
  marketplace: {
    title: 'Marketplace',
    body: 'Plataforma donde se publica o se publicará el producto. Puede ser eBay, Amazon, MercadoLibre u otros marketplaces configurados en el sistema.'
  },

  // ==================== DASHBOARD / NEGOCIO ====================

  gananciaNeta: {
    title: 'Ganancia neta',
    body: 'Utilidad real después de costos del producto, envío, impuestos, comisiones del marketplace, comisiones de PayPal y comisión de plataforma.'
  },
  comisionPlataforma: {
    title: 'Comisión plataforma',
    body: 'Porcentaje retenido por la plataforma de la ganancia bruta de cada venta. El resto se envía a tu PayPal.'
  },
  ventasTotales: {
    title: 'Ventas totales',
    body: 'Suma de los precios de venta de todas las ventas confirmadas.'
  },
  autopilot: {
    title: 'Autopilot',
    body: 'Ejecución automática de workflows (búsqueda, publicación, precios) según la programación definida. Configura límites diarios de órdenes y gasto.'
  },
  profitGuard: {
    title: 'Profit Guard',
    body: 'Protección que bloquea ventas cuando el precio no cubre costos, comisiones y envío. Evita pérdidas por márgenes negativos.'
  },
  dynamicPricing: {
    title: 'Precios dinámicos',
    body: 'Ajuste automático de precios según competencia. Nunca baja del margen mínimo (Profit Guard).'
  },
  dailyLimits: {
    title: 'Límites diarios',
    body: 'Máximo de órdenes y gasto por día. El sistema bloquea nuevas órdenes al alcanzar el límite.'
  }
} as const;

/**
 * Helper para obtener tooltip por key
 */
export function getMetricTooltip(key: keyof typeof metricTooltips) {
  return metricTooltips[key];
}

