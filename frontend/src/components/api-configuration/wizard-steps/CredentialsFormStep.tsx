import { useState, useEffect } from 'react';
import { Eye, EyeOff, ExternalLink } from 'lucide-react';
import { WizardData } from '../APIConfigurationWizard';
import FieldTooltip from '../FieldTooltip';
import ValidationIndicator from '../ValidationIndicator';
import api from '../../../services/api';

interface CredentialsFormStepProps {
  data: WizardData;
  onNext: (data?: Partial<WizardData>) => void;
  onBack: () => void;
  onUpdateData: (data: Partial<WizardData>) => void;
}

// Definiciones de campos por marketplace
const FIELD_DEFINITIONS: Record<string, Array<{
  key: string;
  label: string;
  type: 'text' | 'password';
  required: boolean;
  placeholder?: string;
  helpText?: string;
  example?: string;
  docsUrl?: string;
  validation?: (value: string) => { valid: boolean; message?: string };
}>> = {
  ebay: [
    {
      key: 'appId',
      label: 'App ID (Client ID)',
      type: 'text',
      required: true,
      placeholder: 'IvanMart-IVANRese-PRD-... o YourAppI-YourApp-PRD-...',
      helpText: 'Tu App ID de eBay Developer Portal. Puede tener diferentes formatos emitidos oficialmente por eBay.',
      example: 'IvanMart-IVANRese-PRD-abc123def456 o YourAppI-YourApp-PRD-abc123def456',
      docsUrl: 'https://developer.ebay.com/api-docs/static/oauth-credentials.html',
      validation: (value) => {
        if (!value) return { valid: false, message: 'App ID es requerido' };
        // ✅ CORREGIDO: eBay emite App IDs en varios formatos válidos
        // Ejemplos válidos: IvanMart-IVANRese-SBX-xxx, IvanMart-IVANRese-PRD-xxx, etc.
        // No todos los App IDs comienzan con "YourAppI-"
        const trimmed = value.trim();
        if (trimmed.length < 10) {
          return { valid: false, message: 'App ID parece ser muy corto. Verifica que sea correcto.' };
        }
        // Validar formato básico: debe contener al menos un guion y caracteres alfanuméricos
        const validFormat = /^[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9]$/.test(trimmed);
        if (!validFormat) {
          return { valid: false, message: 'App ID tiene formato inválido. Debe contener solo letras, números y guiones.' };
        }
        return { valid: true };
      }
    },
    {
      key: 'devId',
      label: 'Dev ID',
      type: 'text',
      required: true,
      placeholder: 'Your-DevI-PRD-...',
      helpText: 'Tu Developer ID de eBay',
      example: 'Your-DevI-PRD-xyz789',
      validation: (value) => {
        if (!value) return { valid: false, message: 'Dev ID es requerido' };
        return { valid: true };
      }
    },
    {
      key: 'certId',
      label: 'Cert ID (Client Secret)',
      type: 'password',
      required: true,
      placeholder: 'PRD-...',
      helpText: 'Tu Client Secret (Cert ID) de eBay. Mantén esto seguro.',
      example: 'PRD-abc123def456ghi789',
      validation: (value) => {
        if (!value) return { valid: false, message: 'Cert ID es requerido' };
        if (value.length < 10) {
          return { valid: false, message: 'Cert ID parece ser muy corto' };
        }
        return { valid: true };
      }
    },
    {
      key: 'redirectUri',
      label: 'Redirect URI (RuName)',
      type: 'text',
      required: true,
      placeholder: 'IvMart_IvanRese-IvanMart...',
      helpText: 'El RuName configurado en tu aplicación eBay',
      example: 'IvMart_IvanRese-IvanMart-SBX-12345678-abcdef',
      validation: (value) => {
        if (!value) return { valid: false, message: 'Redirect URI es requerido' };
        return { valid: true };
      }
    }
  ],
  amazon: [
    {
      key: 'clientId',
      label: 'Client ID (LWA)',
      type: 'text',
      required: true,
      placeholder: 'amzn1.application-oa2-client...',
      helpText: 'Tu LWA Client ID de Amazon SP-API',
      example: 'amzn1.application-oa2-client.abc123def456',
      docsUrl: 'https://developer-docs.amazon.com/sp-api/docs/registering-your-application',
      validation: (value) => {
        if (!value) return { valid: false, message: 'Client ID es requerido' };
        if (!value.startsWith('amzn1.application-oa2-client')) {
          return { valid: false, message: 'Client ID debe comenzar con "amzn1.application-oa2-client"' };
        }
        return { valid: true };
      }
    },
    {
      key: 'clientSecret',
      label: 'Client Secret',
      type: 'password',
      required: true,
      placeholder: 'amzn1.oa2-cs.v1...',
      helpText: 'Tu LWA Client Secret',
      example: 'amzn1.oa2-cs.v1.abc123def456',
      validation: (value) => {
        if (!value) return { valid: false, message: 'Client Secret es requerido' };
        return { valid: true };
      }
    },
    {
      key: 'refreshToken',
      label: 'Refresh Token',
      type: 'password',
      required: true,
      placeholder: 'Atzr|IwEB...',
      helpText: 'Tu Refresh Token de Amazon SP-API',
      example: 'Atzr|IwEBIA...',
      validation: (value) => {
        if (!value) return { valid: false, message: 'Refresh Token es requerido' };
        return { valid: true };
      }
    },
    {
      key: 'region',
      label: 'AWS Region',
      type: 'text',
      required: true,
      placeholder: 'us-east-1',
      helpText: 'La región AWS donde está tu aplicación',
      example: 'us-east-1',
      validation: (value) => {
        if (!value) return { valid: false, message: 'Region es requerido' };
        return { valid: true };
      }
    }
  ],
  mercadolibre: [
    {
      key: 'clientId',
      label: 'Client ID',
      type: 'text',
      required: true,
      placeholder: 'Tu Client ID',
      helpText: 'Tu Client ID de MercadoLibre',
      docsUrl: 'https://developers.mercadolibre.com.ar/es_ar/registro-y-autenticacion',
      validation: (value) => {
        if (!value) return { valid: false, message: 'Client ID es requerido' };
        return { valid: true };
      }
    },
    {
      key: 'clientSecret',
      label: 'Client Secret',
      type: 'password',
      required: true,
      placeholder: 'Tu Client Secret',
      helpText: 'Tu Client Secret de MercadoLibre',
      validation: (value) => {
        if (!value) return { valid: false, message: 'Client Secret es requerido' };
        return { valid: true };
      }
    }
  ],
  paypal: [
    {
      key: 'clientId',
      label: 'Client ID',
      type: 'text',
      required: true,
      placeholder: 'AYxxxxxxxxxxxxx',
      helpText: 'Tu PayPal Client ID',
      docsUrl: 'https://developer.paypal.com/api/rest/',
      validation: (value) => {
        if (!value) return { valid: false, message: 'Client ID es requerido' };
        return { valid: true };
      }
    },
    {
      key: 'clientSecret',
      label: 'Client Secret',
      type: 'password',
      required: true,
      placeholder: 'Tu Client Secret',
      helpText: 'Tu PayPal Client Secret',
      validation: (value) => {
        if (!value) return { valid: false, message: 'Client Secret es requerido' };
        return { valid: true };
      }
    }
  ]
};

export default function CredentialsFormStep({
  data,
  onNext,
  onBack,
  onUpdateData
}: CredentialsFormStepProps) {
  const [formData, setFormData] = useState<Record<string, string>>(data.credentials || {});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [fieldValidation, setFieldValidation] = useState<Record<string, { status: 'idle' | 'validating' | 'valid' | 'invalid'; message?: string }>>({});

  const marketplace = data.marketplace || '';
  const fields = FIELD_DEFINITIONS[marketplace] || [];

  useEffect(() => {
    onUpdateData({ credentials: formData });
  }, [formData, onUpdateData]);

  const handleFieldChange = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));

    // Validación en tiempo real
    const field = fields.find(f => f.key === key);
    if (field?.validation) {
      setFieldValidation(prev => ({ ...prev, [key]: { status: 'validating' } }));
      
      setTimeout(() => {
        const result = field.validation!(value);
        setFieldValidation(prev => ({
          ...prev,
          [key]: {
            status: result.valid ? 'valid' : 'invalid',
            message: result.message
          }
        }));
      }, 300);
    }
  };

  const togglePasswordVisibility = (key: string) => {
    setShowPasswords(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const allRequiredFieldsValid = () => {
    return fields
      .filter(f => f.required)
      .every(f => {
        const value = formData[f.key];
        const validation = fieldValidation[f.key];
        return value && validation?.status === 'valid';
      });
  };

  return (
    <div>
      <div className="mb-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-2">
          Configura tus credenciales
        </h4>
        <p className="text-sm text-gray-600">
          Ingresa las credenciales de tu aplicación. Si no las tienes, puedes obtenerlas desde el portal de desarrolladores.
        </p>
      </div>

      <div className="space-y-4">
        {fields.map((field) => {
          const value = formData[field.key] || '';
          const validation = fieldValidation[field.key] || { status: 'idle' as const };
          const showPassword = showPasswords[field.key];

          return (
            <div key={field.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
                {field.helpText && (
                  <FieldTooltip
                    content={field.helpText}
                    example={field.example}
                    documentationUrl={field.docsUrl}
                  />
                )}
              </label>
              
              <div className="relative">
                <input
                  type={field.type === 'password' && !showPassword ? 'password' : 'text'}
                  value={value}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                    validation.status === 'invalid' ? 'border-red-500' :
                    validation.status === 'valid' ? 'border-green-500' :
                    'border-gray-300'
                  }`}
                />
                
                {field.type === 'password' && (
                  <button
                    type="button"
                    onClick={() => togglePasswordVisibility(field.key)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                )}
              </div>

              {validation.status !== 'idle' && (
                <div className="mt-1">
                  <ValidationIndicator
                    status={validation.status}
                    message={validation.message}
                    size="sm"
                  />
                </div>
              )}

              {field.example && validation.status === 'idle' && (
                <p className="mt-1 text-xs text-gray-500">
                  Ejemplo: <code className="bg-gray-100 px-1 rounded">{field.example}</code>
                </p>
              )}
            </div>
          );
        })}
      </div>

      {!allRequiredFieldsValid() && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            Por favor completa todos los campos requeridos antes de continuar.
          </p>
        </div>
      )}

      {allRequiredFieldsValid() && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800">
            ✓ Todos los campos requeridos están completos. Puedes continuar.
          </p>
        </div>
      )}
    </div>
  );
}

