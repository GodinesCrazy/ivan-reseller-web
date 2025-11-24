import { ExternalLink, Copy, CheckCircle } from 'lucide-react';
import { useState } from 'react';

interface Template {
  apiName: string;
  name: string;
  description: string;
  fields: Record<string, string>;
  documentationUrl?: string;
}

const TEMPLATES: Record<string, Template[]> = {
  ebay: [
    {
      apiName: 'ebay',
      name: 'eBay Sandbox - Configuración Básica',
      description: 'Template para configurar eBay en modo sandbox con credenciales de prueba',
      fields: {
        appId: 'YourAppI-YourApp-SBX-xxxxxxxx-xxxxxxxx',
        devId: 'Your-DevI-SBX-xxxxxxxx-xxxxxxxx',
        certId: 'SBX-xxxxxxxxxxxxxxxxxxxxxxxx',
        redirectUri: 'IvMart_IvanRese-IvanMart-SBX-xxxxxxxx-xxxxx'
      },
      documentationUrl: 'https://developer.ebay.com/api-docs/static/oauth-credentials.html'
    },
    {
      apiName: 'ebay',
      name: 'eBay Production - Configuración Completa',
      description: 'Template para configurar eBay en producción',
      fields: {
        appId: 'YourAppI-YourApp-PRD-xxxxxxxx-xxxxxxxx',
        devId: 'Your-DevI-PRD-xxxxxxxx-xxxxxxxx',
        certId: 'PRD-xxxxxxxxxxxxxxxxxxxxxxxx',
        redirectUri: 'IvMart_IvanRese-IvanMart-PRD-xxxxxxxx-xxxxx'
      },
      documentationUrl: 'https://developer.ebay.com/api-docs/static/oauth-credentials.html'
    }
  ],
  amazon: [
    {
      apiName: 'amazon',
      name: 'Amazon SP-API - Sandbox',
      description: 'Template para configurar Amazon SP-API en sandbox',
      fields: {
        clientId: 'amzn1.application-oa2-client.xxxxxxxxxxxxxxxxxxxxxxxx',
        clientSecret: 'amzn1.oa2-cs.v1.xxxxxxxxxxxxxxxxxxxxxxxx',
        refreshToken: 'Atzr|IwEBIxxxxxxxxxxxxxxxxxxxxxxxx',
        region: 'us-east-1'
      },
      documentationUrl: 'https://developer-docs.amazon.com/sp-api/'
    }
  ],
  mercadolibre: [
    {
      apiName: 'mercadolibre',
      name: 'MercadoLibre - Configuración Básica',
      description: 'Template para configurar MercadoLibre',
      fields: {
        clientId: 'xxxxxxxxxxxxxxxxxxxxxxxx',
        clientSecret: 'xxxxxxxxxxxxxxxxxxxxxxxx'
      },
      documentationUrl: 'https://developers.mercadolibre.com/'
    }
  ]
};

interface CredentialTemplatesProps {
  apiName: string;
  onUseTemplate: (fields: Record<string, string>) => void;
}

export default function CredentialTemplates({
  apiName,
  onUseTemplate
}: CredentialTemplatesProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const templates = TEMPLATES[apiName] || [];

  if (templates.length === 0) {
    return null;
  }

  const handleCopy = (value: string, fieldKey: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="mt-4 space-y-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-2">
        Templates de Ejemplo
      </h4>
      {templates.map((template, index) => (
        <div
          key={index}
          className="border border-gray-200 rounded-lg p-4 bg-gray-50"
        >
          <div className="flex items-start justify-between mb-2">
            <div>
              <h5 className="font-medium text-gray-900">{template.name}</h5>
              <p className="text-xs text-gray-600 mt-1">{template.description}</p>
            </div>
            {template.documentationUrl && (
              <a
                href={template.documentationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 text-xs flex items-center gap-1"
              >
                Docs
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          
          <div className="space-y-2 mt-3">
            {Object.entries(template.fields).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-white border border-gray-200 rounded px-2 py-1 font-mono text-gray-700">
                  {value}
                </code>
                <button
                  onClick={() => handleCopy(value, `${index}-${key}`)}
                  className="p-1 text-gray-500 hover:text-gray-700"
                  title="Copiar"
                >
                  {copiedField === `${index}-${key}` ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={() => onUseTemplate(template.fields)}
            className="mt-3 w-full px-3 py-2 bg-primary-600 text-white text-sm rounded hover:bg-primary-700 transition-colors"
          >
            Usar este template
          </button>
        </div>
      ))}
    </div>
  );
}

