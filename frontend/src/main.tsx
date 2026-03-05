import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { Toaster as SonnerToaster } from 'sonner';
import App from './App';
import { RootErrorBoundary } from '@/components/RootErrorBoundary';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <App />
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4500,
            style: {
              borderRadius: '12px',
              padding: '14px 18px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              background: 'var(--toast-bg, #363636)',
              color: 'var(--toast-color, #fff)',
            },
            success: {
              style: {
                borderLeft: '4px solid #22c55e',
              },
            },
            error: {
              style: {
                borderLeft: '4px solid #ef4444',
              },
            },
          }}
        />
        <SonnerToaster position="top-right" richColors />
      </QueryClientProvider>
    </BrowserRouter>
    </RootErrorBoundary>
  </React.StrictMode>,
);
