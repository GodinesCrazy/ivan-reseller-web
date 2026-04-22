import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'auto';

function readSavedTheme(): Theme {
  const saved = localStorage.getItem('userSettings');
  if (!saved) return 'dark';
  try {
    const parsed = JSON.parse(saved);
    const candidate = parsed?.theme;
    if (candidate === 'light' || candidate === 'dark' || candidate === 'auto') {
      return candidate;
    }
  } catch {
    // Avoid repeated parse issues from malformed local values.
    localStorage.removeItem('userSettings');
  }
  return 'dark';
}

/**
 * Hook para manejar el tema de la aplicación
 * Aplica el tema al elemento <html> para que Tailwind funcione correctamente
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    // Cargar desde localStorage o usar dark por defecto.
    return readSavedTheme();
  });

  // Función para obtener el tema efectivo (resuelve 'auto' a 'light' o 'dark')
  const getEffectiveTheme = (): 'light' | 'dark' => {
    if (theme === 'auto') {
      // Detectar preferencia del sistema
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  };

  // Aplicar tema al HTML
  const applyTheme = (newTheme: Theme) => {
    const effectiveTheme = newTheme === 'auto' 
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : newTheme;

    const root = document.documentElement;
    
    if (effectiveTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  };

  // Aplicar tema inicial y cuando cambia
  useEffect(() => {
    applyTheme(theme);

    // Si el tema es 'auto', escuchar cambios en la preferencia del sistema
    if (theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => {
        applyTheme(theme);
      };
      
      // Escuchar cambios (solo para modo 'auto')
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
      } else {
        // Fallback para navegadores antiguos
        mediaQuery.addListener(handleChange);
        return () => mediaQuery.removeListener(handleChange);
      }
    }
  }, [theme]);

  // Actualizar tema
  const updateTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    // Guardar en localStorage (se sincronizará con backend cuando se guarde en Settings)
    const saved = localStorage.getItem('userSettings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        parsed.theme = newTheme;
        localStorage.setItem('userSettings', JSON.stringify(parsed));
      } catch {
        // Si falla, crear nuevo objeto
        localStorage.setItem('userSettings', JSON.stringify({ theme: newTheme }));
      }
    } else {
      localStorage.setItem('userSettings', JSON.stringify({ theme: newTheme }));
    }
    applyTheme(newTheme);
  };

  return {
    theme,
    effectiveTheme: getEffectiveTheme(),
    updateTheme,
  };
}

