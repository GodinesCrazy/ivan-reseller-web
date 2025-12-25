import { AlertCircle } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  // Only show if the message is not empty and conditions are met
  if (!message) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 bg-red-50 border-b border-red-200 p-4 shadow-sm z-50">
      <div className="flex items-center gap-3 max-w-7xl mx-auto">
        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
        <p className="text-sm text-red-800">{message}</p>
      </div>
    </div>
  );
}
