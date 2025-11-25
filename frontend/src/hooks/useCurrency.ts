/**
 * ✅ Hook para obtener la moneda del usuario
 * 
 * Obtiene la moneda configurada del usuario desde settings (localStorage/API)
 * o usa USD como default.
 */

import { useState, useEffect } from 'react';
import { formatCurrencySimple, formatCurrency, CurrencyFormatOptions } from '../utils/currency';
import { api } from '../services/api';

export function useCurrency() {
  const [currency, setCurrency] = useState<string>('USD');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCurrency();
  }, []);

  const loadCurrency = async () => {
    try {
      // 1. Intentar cargar desde localStorage (rápido)
      const saved = localStorage.getItem('userSettings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.currencyFormat) {
          setCurrency(parsed.currencyFormat);
          setLoading(false);
        }
      }

      // 2. Validar con API (seguro)
      const { data } = await api.get('/api/settings');
      if (data?.success && data?.data?.currencyFormat) {
        const apiCurrency = data.data.currencyFormat;
        setCurrency(apiCurrency);

        // Actualizar localStorage si es diferente
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.currencyFormat !== apiCurrency) {
            parsed.currencyFormat = apiCurrency;
            localStorage.setItem('userSettings', JSON.stringify(parsed));
          }
        }
      }
    } catch (error) {
      console.warn('Error loading currency settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (value: number | null | undefined, options?: CurrencyFormatOptions) => {
    return formatCurrency(value, { ...options, currency });
  };

  return {
    currency,
    formatMoney,
    loading
  };
}

