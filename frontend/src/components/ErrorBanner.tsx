import { AlertCircle } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  if (!import.meta.env.VITE_API_URL) {
    return (
      <div className="fixed top-0 left-0 right-0 bg-red-500 text-white px-4 py-3 flex items-center gap-2 z-50">
        <AlertCircle className="w-5 h-5" />
        <span>{message}</span>
      </div>
    );
  }
  return null;
}
