import { Info, ExternalLink } from 'lucide-react';
import { useState } from 'react';

interface FieldTooltipProps {
  content: string;
  example?: string;
  documentationUrl?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

export default function FieldTooltip({
  content,
  example,
  documentationUrl,
  placement = 'top'
}: FieldTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  const placementClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        className="text-gray-400 hover:text-gray-600 focus:outline-none focus:text-gray-600"
        aria-label="Información del campo"
      >
        <Info className="h-4 w-4" />
      </button>
      
      {isOpen && (
        <div
          className={`absolute z-50 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg ${placementClasses[placement]}`}
          role="tooltip"
        >
          <p className="mb-2">{content}</p>
          
          {example && (
            <div className="mt-2 pt-2 border-t border-gray-700">
              <p className="text-gray-400 mb-1">Ejemplo:</p>
              <code className="text-green-400 text-xs break-all">{example}</code>
            </div>
          )}
          
          {documentationUrl && (
            <a
              href={documentationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center text-blue-400 hover:text-blue-300 text-xs"
            >
              Ver documentación
              <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          )}
          
          {/* Flecha del tooltip */}
          <div
            className={`absolute w-2 h-2 bg-gray-900 transform rotate-45 ${
              placement === 'top' ? 'top-full left-1/2 -translate-x-1/2 -mt-1' :
              placement === 'bottom' ? 'bottom-full left-1/2 -translate-x-1/2 -mb-1' :
              placement === 'left' ? 'left-full top-1/2 -translate-y-1/2 -ml-1' :
              'right-full top-1/2 -translate-y-1/2 -mr-1'
            }`}
          />
        </div>
      )}
    </div>
  );
}

