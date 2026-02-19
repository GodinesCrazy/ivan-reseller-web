/**
 * Asistente de configuraci�n inicial para nuevos usuarios
 * Pasos: Bienvenida, PayPal, Marketplaces, Umbrales, Autopilot, Confirmaci�n
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';
interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  route?: string;
}

const steps: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Bienvenida',
    description: 'Ivan Reseller automatiza el dropshipping. Compras productos a proveedores, los publicas en tu marketplace y, cuando vendes, recibes la ganancia en tu PayPal.',
  },
  {
    id: 'paypal',
    title: 'Configurar PayPal',
    description: 'Configura tu email de PayPal para recibir tus ganancias. Sin esto, no podr�s cobrar.',
    route: '/settings',
  },
  {
    id: 'marketplaces',
    title: 'Conectar marketplaces',
    description: 'Conecta al menos un marketplace (eBay, Amazon o MercadoLibre) para publicar productos.',
    route: '/api-settings',
  },
  {
    id: 'profit',
    title: 'Umbrales de ganancia',
    description: 'El sistema bloquea ventas sin margen (Profit Guard). Revisa los precios sugeridos antes de publicar.',
  },
  {
    id: 'autopilot',
    title: 'Autopilot (opcional)',
    description: 'Puedes ejecutar workflows manualmente o programar Autopilot. Configura l�mites diarios de �rdenes y gasto.',
    route: '/autopilot',
  },
  {
    id: 'confirm',
    title: 'Confirmaci�n',
    description: 'Ya puedes buscar oportunidades, publicar productos y vender. Las ganancias se desglosan: tu parte va a tu PayPal, la comisi�n de plataforma al admin.',
  },
];

interface OnboardingWizardProps {
  onComplete?: () => void;
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = steps[stepIndex];

  const handleNext = () => {
    if (stepIndex < steps.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      onComplete?.();
    }
  };

  const handlePrev = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  };

  const handleGoToRoute = () => {
    if (currentStep.route) {
      navigate(currentStep.route);
    }
  };

  return (
    <div className="max-w-xl mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center gap-2 mb-6">
        {steps.map((s, i) => (
          <div
            key={s.id}
            className={`h-2 flex-1 rounded-full ${
              i <= stepIndex ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
            }`}
          />
        ))}
      </div>
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
        Paso {stepIndex + 1}: {currentStep.title}
      </h2>
      <p className="text-gray-600 dark:text-gray-300 mb-6">{currentStep.description}</p>
      <div className="flex justify-between">
        <button
          onClick={handlePrev}
          disabled={stepIndex === 0}
          className="flex items-center gap-1 px-4 py-2 text-gray-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
        >
          <ChevronLeft className="w-4 h-4" /> Anterior
        </button>
        <div className="flex gap-2">
          {currentStep.route && (
            <button
              onClick={handleGoToRoute}
              className="flex items-center gap-1 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500"
            >
              Ir a configurar <ChevronRight className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleNext}
            className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            {stepIndex === steps.length - 1 ? (
              <>
                Finalizar <Check className="w-4 h-4" />
              </>
            ) : (
              <>
                Siguiente <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
