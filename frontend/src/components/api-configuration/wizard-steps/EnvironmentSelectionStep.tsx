import { Info } from 'lucide-react';
import { WizardData } from '../APIConfigurationWizard';

interface EnvironmentSelectionStepProps {
  data: WizardData;
  onNext: (data?: Partial<WizardData>) => void;
  onBack: () => void;
  onUpdateData: (data: Partial<WizardData>) => void;
}

export default function EnvironmentSelectionStep({
  data,
  onNext,
  onBack,
  onUpdateData
}: EnvironmentSelectionStepProps) {
  const handleSelect = (environment: 'sandbox' | 'production') => {
    onUpdateData({ environment });
  };

  return (
    <div>
      <div className="mb-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-2">
          Selecciona el ambiente
        </h4>
        <p className="text-sm text-gray-600">
          Elige entre ambiente de pruebas (sandbox) o producción. Recomendamos empezar con sandbox.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sandbox */}
        <button
          onClick={() => handleSelect('sandbox')}
          className={`relative p-6 border-2 rounded-lg text-left transition-all hover:shadow-md ${
            data.environment === 'sandbox'
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-200 hover:border-primary-300'
          }`}
        >
          <div className="flex items-start">
            <div className="flex-1">
              <div className="flex items-center mb-2">
                <span className="text-2xl mr-2">🧪</span>
                <h5 className="font-semibold text-gray-900">Sandbox (Pruebas)</h5>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Ambiente de pruebas seguro para aprender y experimentar sin afectar datos reales.
              </p>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>✓ No afecta productos reales</li>
                <li>✓ Ideal para aprender</li>
                <li>✓ Datos de prueba</li>
              </ul>
            </div>
          </div>
        </button>

        {/* Production */}
        <button
          onClick={() => handleSelect('production')}
          className={`relative p-6 border-2 rounded-lg text-left transition-all hover:shadow-md ${
            data.environment === 'production'
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-200 hover:border-primary-300'
          }`}
        >
          <div className="flex items-start">
            <div className="flex-1">
              <div className="flex items-center mb-2">
                <span className="text-2xl mr-2">🚀</span>
                <h5 className="font-semibold text-gray-900">Production (Producción)</h5>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Ambiente real para operaciones comerciales. Usa con precaución.
              </p>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>⚠️ Afecta productos reales</li>
                <li>⚠️ Transacciones reales</li>
                <li>⚠️ Requiere credenciales de producción</li>
              </ul>
            </div>
          </div>
        </button>
      </div>

      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-start">
          <Info className="h-5 w-5 text-yellow-600 mt-0.5 mr-2 flex-shrink-0" />
          <div className="text-sm text-yellow-800">
            <strong>Recomendación:</strong> Si es tu primera vez configurando esta API, 
            te recomendamos empezar con <strong>Sandbox</strong> para familiarizarte con el proceso.
          </div>
        </div>
      </div>

      {data.environment && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Ambiente seleccionado:</strong> {data.environment === 'sandbox' ? 'Sandbox (Pruebas)' : 'Production (Producción)'}
          </p>
        </div>
      )}
    </div>
  );
}

