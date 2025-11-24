import { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, CheckCircle, Loader2 } from 'lucide-react';
// Usar los steps existentes que ya están implementados
import APISelectorStep from './steps/APISelectorStep';
import APIInfoStep from './steps/APIInfoStep';
import CredentialsFormStep from './steps/CredentialsFormStep';
import OAuthFlowStep from './steps/OAuthFlowStep';
import ValidationStep from './steps/ValidationStep';

export interface WizardData {
  selectedAPI?: string;
  selectedEnvironment?: 'sandbox' | 'production';
  credentials?: Record<string, string>;
  oauthCompleted?: boolean;
  validationResult?: {
    success: boolean;
    message: string;
    errors?: string[];
  };
}

interface APIConfigurationWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (data: WizardData) => void;
  initialAPI?: string;
}

const STEPS = [
  { id: 'selector', title: 'Seleccionar API', component: APISelectorStep },
  { id: 'info', title: 'Información de la API', component: APIInfoStep },
  { id: 'credentials', title: 'Configurar Credenciales', component: CredentialsFormStep },
  { id: 'oauth', title: 'Autorización OAuth', component: OAuthFlowStep },
  { id: 'validation', title: 'Validación', component: ValidationStep },
];

export default function APIConfigurationWizard({
  isOpen,
  onClose,
  onComplete,
  initialAPI
}: APIConfigurationWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [wizardData, setWizardData] = useState<WizardData>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && initialAPI) {
      setWizardData({ selectedAPI: initialAPI });
      // Saltar al paso de info si ya hay API seleccionada
      setCurrentStep(1);
    } else if (isOpen) {
      setCurrentStep(0);
      setWizardData({});
    }
  }, [isOpen, initialAPI]);

  if (!isOpen) return null;

  const currentStepConfig = STEPS[currentStep];
  const CurrentStepComponent = currentStepConfig.component;

  const handleNext = (stepData?: Partial<WizardData>) => {
    if (stepData) {
      setWizardData(prev => ({ ...prev, ...stepData }));
    }
    
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleComplete = async () => {
    setIsSaving(true);
    try {
      await onComplete(wizardData);
      // Cerrar wizard después de completar
      setTimeout(() => {
        onClose();
        setCurrentStep(0);
        setWizardData({});
        setIsSaving(false);
      }, 1000);
    } catch (error) {
      setIsSaving(false);
      throw error;
    }
  };

  const canGoNext = () => {
    switch (currentStep) {
      case 0: // API Selector
        return !!wizardData.selectedAPI;
      case 1: // API Info (siempre puede continuar)
        return true;
      case 2: // Credentials
        return !!wizardData.credentials && Object.keys(wizardData.credentials).length > 0;
      case 3: // OAuth
        // OAuth es opcional, puede saltarse si no aplica
        return true;
      case 4: // Validation
        return !!wizardData.validationResult;
      default:
        return false;
    }
  };

  const shouldShowOAuthStep = () => {
    // Solo mostrar OAuth para APIs que lo soportan
    const oauthAPIs = ['ebay', 'mercadolibre'];
    return oauthAPIs.includes(wizardData.selectedAPI || '');
  };

  // Ajustar steps según si OAuth aplica
  const effectiveSteps = shouldShowOAuthStep() 
    ? STEPS 
    : STEPS.filter(step => step.id !== 'oauth');

  const effectiveCurrentStep = shouldShowOAuthStep()
    ? currentStep
    : currentStep > 2 ? currentStep - 1 : currentStep;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full">
          {/* Header */}
          <div className="bg-primary-600 px-6 py-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">
                Configuración de API - Paso {effectiveCurrentStep + 1} de {effectiveSteps.length}
              </h3>
              <p className="text-sm text-primary-100 mt-1">
                {currentStepConfig.title}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="bg-gray-200 h-2">
            <div
              className="bg-primary-600 h-2 transition-all duration-300"
              style={{ width: `${((effectiveCurrentStep + 1) / effectiveSteps.length) * 100}%` }}
            />
          </div>

          {/* Content */}
          <div className="px-6 py-6">
            <CurrentStepComponent
              data={wizardData}
              onNext={handleNext}
              onBack={handleBack}
              onUpdateData={(data) => setWizardData(prev => ({ ...prev, ...data }))}
            />
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 flex items-center justify-between">
            <button
              onClick={handleBack}
              disabled={effectiveCurrentStep === 0}
              className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Anterior
            </button>

            <div className="flex items-center gap-2">
              {effectiveCurrentStep < effectiveSteps.length - 1 ? (
                <button
                  onClick={() => handleNext()}
                  disabled={!canGoNext() || isSaving}
                  className="flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4 ml-1" />
                </button>
              ) : (
                <button
                  onClick={handleComplete}
                  disabled={!canGoNext() || isSaving}
                  className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Completar Configuración
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
