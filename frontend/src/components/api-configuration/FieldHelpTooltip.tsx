import { Info, HelpCircle } from 'lucide-react';
import { useState } from 'react';

interface FieldHelpTooltipProps {
  content: string;
  link?: string;
  linkText?: string;
}

export default function FieldHelpTooltip({ content, link, linkText }: FieldHelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onClick={() => setIsOpen(!isOpen)}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
      >
        <HelpCircle className="w-4 h-4" />
      </button>
      
      {isOpen && (
        <div className="absolute z-50 left-0 top-6 w-64 p-3 bg-gray-900 dark:bg-gray-800 text-white text-sm rounded-lg shadow-xl border border-gray-700">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-gray-100">{content}</p>
              {link && (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-primary-400 hover:text-primary-300 underline text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  {linkText || 'Ver más información'}
                </a>
              )}
            </div>
          </div>
          {/* Arrow */}
          <div className="absolute -top-1 left-4 w-2 h-2 bg-gray-900 dark:bg-gray-800 border-l border-t border-gray-700 transform rotate-45" />
        </div>
      )}
    </div>
  );
}

