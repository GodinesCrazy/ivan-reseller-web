import { CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';

interface ValidationIndicatorProps {
  status: 'idle' | 'validating' | 'valid' | 'invalid' | 'warning';
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function ValidationIndicator({
  status,
  message,
  size = 'md'
}: ValidationIndicatorProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6'
  };

  const iconClasses = sizeClasses[size];

  const getIcon = () => {
    switch (status) {
      case 'validating':
        return <Loader2 className={`${iconClasses} text-blue-500 animate-spin`} />;
      case 'valid':
        return <CheckCircle className={`${iconClasses} text-green-500`} />;
      case 'invalid':
        return <XCircle className={`${iconClasses} text-red-500`} />;
      case 'warning':
        return <AlertCircle className={`${iconClasses} text-yellow-500`} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex items-center gap-2">
      {getIcon()}
      {message && (
        <span
          className={`text-xs ${
            status === 'valid' ? 'text-green-600' :
            status === 'invalid' ? 'text-red-600' :
            status === 'warning' ? 'text-yellow-600' :
            'text-gray-600'
          }`}
        >
          {message}
        </span>
      )}
    </div>
  );
}

