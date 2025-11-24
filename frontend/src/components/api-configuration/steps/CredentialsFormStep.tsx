import { useState, useEffect } from 'react';
import { Eye, EyeOff, AlertCircle, CheckCircle2, Info, ExternalLink } from 'lucide-react';
import { WizardData } from '../APIConfigurationWizard';
import FieldHelpTooltip from '../FieldHelpTooltip';
import api from '../../../services/api';

interface CredentialsFormStepProps {
  data: WizardData;
  onUpdateData: (updates: Partial<WizardData>) => void;
  onNext: () => void;
  onBack: () => void;
  onComplete: () => void;
}

interface FieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'password';
  required: boolean;
  placeholder?: string;
  helpText?: string;
  validation?: {
    pattern?: RegExp;
    minLength?: number;
    maxLength?: number;
    custom?: (value: string) => string | null;
  };
}

export default function CredentialsFormStep({
  data,
  onUpdateData,
}: CredentialsFormStepProps) {
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fieldValid, setFieldValid] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (data.selectedAPI) {
      loadFields();
    }
  }, [data.selectedAPI, data.selectedEnvironment]);

  const loadFields = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/settings/apis');
      const result = response.data;
      
      if (result.success && result.data) {
        const api = result.data.find((a: any) => a.apiName === data.selectedAPI);
        if (api) {
          const env = data.selectedEnvironment;
          const envConfig = api.supportsEnvironments && api.environments?.[env];
          const apiFields = envConfig?.fields || api.fields || [];
          
          const fieldDefinitions: FieldDefinition[] = apiFields
            .filter((f: any) => !f.disabled)
            .map((f: any) => ({
              key: f.key,
              label: f.label,
              type: f.type === 'password' ? 'password' : 'text',
              required: f.required || false,
              placeholder: f.placeholder,
              helpText: f.helpText,
              validation: getValidationRules(data.selectedAPI!, f.key),
            }));
          
          setFields(fieldDefinitions);
        }
      }
    } catch (error) {
      console.error('Error loading fields:', error);
    } finally {
      setLoading(false);
    }
  };

  const getValidationRules = (apiName: string, fieldKey: string) => {
    const rules: Record<string, any> = {};
    
    // Validación para App ID de eBay
    if (apiName === 'ebay' && fieldKey === 'appId') {
      rules.pattern = /^[A-Za-z0-9-]+$/;
      rules.minLength = 10;
    }
    
    // Validación para URLs
    if (fieldKey.includes('redirectUri') || fieldKey.includes('url')) {
      rules.custom = (value: string) => {
        if (!value) return null;
        try {
          new URL(value);
          return null;
        } catch {
          return 'Debe ser una URL válida';
        }
      };
    }
    
    // Validación para emails
    if (fieldKey === 'email') {
      rules.pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    }
    
    return Object.keys(rules).length > 0 ? rules : undefined;
  };

  const handleFieldChange = (fieldKey: string, value: string) => {
    const field = fields.find(f => f.key === fieldKey);
    
    // Validación en tiempo real
    let error: string | null = null;
    
    if (field?.validation) {
      const { pattern, minLength, maxLength, custom } = field.validation;
      
      if (value && pattern && !pattern.test(value)) {
        error = `Formato inválido para ${field.label}`;
      }
      
      if (value && minLength && value.length < minLength) {
        error = `Mínimo ${minLength} caracteres`;
      }
      
      if (value && maxLength && value.length > maxLength) {
        error = `Máximo ${maxLength} caracteres`;
      }
      
      if (value && custom) {
        error = custom(value);
      }
    }
    
    // Validación de campo requerido
    if (field?.required && !value.trim()) {
      error = `${field.label} es requerido`;
    }
    
    // Actualizar errores y estado válido
    setFieldErrors(prev => ({
      ...prev,
      [fieldKey]: error || '',
    }));
    
    setFieldValid(prev => ({
      ...prev,
      [fieldKey]: !error && value.trim().length > 0,
    }));
    
    // Actualizar credenciales
    onUpdateData({
      credentials: {
        ...data.credentials,
        [fieldKey]: value,
      },
    });
  };

  const togglePasswordVisibility = (fieldKey: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [fieldKey]: !prev[fieldKey],
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const requiredFields = fields.filter(f => f.required);
  const filledRequiredFields = requiredFields.filter(f => 
    data.credentials[f.key] && data.credentials[f.key].trim().length > 0
  );
  const allRequiredFilled = filledRequiredFields.length === requiredFields.length;

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
              Ingresa las credenciales de {data.selectedAPI}
            </h3>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              {filledRequiredFields.length} de {requiredFields.length} campos requeridos completados
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {fields.map((field) => {
          const value = data.credentials[field.key] || '';
          const error = fieldErrors[field.key];
          const isValid = fieldValid[field.key];
          const showPassword = showPasswords[field.key];

          return (
            <div key={field.key} className="space-y-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {field.label}
                {field.required && (
                  <span className="text-red-500 ml-1">*</span>
                )}
              </label>
              
              <div className="relative">
                <input
                  type={field.type === 'password' && !showPassword ? 'password' : 'text'}
                  value={value}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors ${
                    error
                      ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20'
                      : isValid
                      ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20'
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
                  }`}
                />
                
                {field.type === 'password' && (
                  <button
                    type="button"
                    onClick={() => togglePasswordVisibility(field.key)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                )}
                
                {isValid && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  </div>
                )}
              </div>
              
              {error && (
                <div className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="w-4 h-4" />
                  <span>{error}</span>
                </div>
              )}
              
              {field.helpText && !error && (
                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1">
                  <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>{field.helpText}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {allRequiredFilled && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-900 dark:text-green-100">
              Todos los campos requeridos están completados
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

