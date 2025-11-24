import { CheckCircle } from 'lucide-react';
import { WizardData } from '../APIConfigurationWizard';

interface MarketplaceSelectionStepProps {
  data: WizardData;
  onNext: (data?: Partial<WizardData>) => void;
  onBack: () => void;
  onUpdateData: (data: Partial<WizardData>) => void;
}

const MARKETPLACES = [
  {
    id: 'ebay',
    name: 'eBay',
    icon: '🛒',
    description: 'Publicar y gestionar productos en eBay',
    docsUrl: 'https://developer.ebay.com/api-docs/static/gs_trading-api-intro.html',
    supportsOAuth: true
  },
  {
    id: 'amazon',
    name: 'Amazon SP-API',
    icon: '📦',
    description: 'Integración con Amazon Seller Partner API',
    docsUrl: 'https://developer-docs.amazon.com/sp-api/',
    supportsOAuth: false
  },
  {
    id: 'mercadolibre',
    name: 'MercadoLibre',
    icon: '💛',
    description: 'Publicar productos en MercadoLibre',
    docsUrl: 'https://developers.mercadolibre.com/',
    supportsOAuth: true
  },
  {
    id: 'paypal',
    name: 'PayPal',
    icon: '💳',
    description: 'Pagos automáticos y comisiones',
    docsUrl: 'https://developer.paypal.com/api/rest/',
    supportsOAuth: false
  }
];

export default function MarketplaceSelectionStep({
  data,
  onNext,
  onBack,
  onUpdateData
}: MarketplaceSelectionStepProps) {
  const handleSelect = (marketplaceId: string) => {
    onUpdateData({ marketplace: marketplaceId });
  };

  return (
    <div>
      <div className="mb-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-2">
          Selecciona el marketplace que deseas configurar
        </h4>
        <p className="text-sm text-gray-600">
          Elige el marketplace donde quieres publicar tus productos. Puedes configurar múltiples marketplaces más tarde.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MARKETPLACES.map((marketplace) => (
          <button
            key={marketplace.id}
            onClick={() => handleSelect(marketplace.id)}
            className={`relative p-4 border-2 rounded-lg text-left transition-all hover:shadow-md ${
              data.marketplace === marketplace.id
                ? 'border-primary-500 bg-primary-50'
                : 'border-gray-200 hover:border-primary-300'
            }`}
          >
            {data.marketplace === marketplace.id && (
              <div className="absolute top-2 right-2">
                <CheckCircle className="h-6 w-6 text-primary-600" />
              </div>
            )}
            
            <div className="flex items-start">
              <span className="text-3xl mr-3">{marketplace.icon}</span>
              <div className="flex-1">
                <h5 className="font-semibold text-gray-900 mb-1">
                  {marketplace.name}
                </h5>
                <p className="text-sm text-gray-600 mb-2">
                  {marketplace.description}
                </p>
                {marketplace.supportsOAuth && (
                  <span className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                    OAuth disponible
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {data.marketplace && (
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Seleccionado:</strong> {MARKETPLACES.find(m => m.id === data.marketplace)?.name}
          </p>
          <p className="text-xs text-blue-600 mt-1">
            Haz clic en "Siguiente" para continuar con la configuración.
          </p>
        </div>
      )}
    </div>
  );
}

