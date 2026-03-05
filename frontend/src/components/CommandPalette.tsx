import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  LayoutDashboard,
  Search,
  Package,
  DollarSign,
  Receipt,
  Settings,
  HelpCircle,
} from 'lucide-react';

interface CommandItem {
  id: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

const COMMANDS: CommandItem[] = [
  { id: 'dashboard', label: 'Panel', path: '/dashboard', icon: LayoutDashboard },
  { id: 'opportunities', label: 'Oportunidades', path: '/opportunities', icon: Search },
  { id: 'products', label: 'Productos', path: '/products', icon: Package },
  { id: 'sales', label: 'Ventas', path: '/sales', icon: DollarSign },
  { id: 'orders', label: 'Órdenes', path: '/orders', icon: Receipt },
  { id: 'api-settings', label: 'API Settings', path: '/api-settings', icon: Settings },
  { id: 'help', label: 'Centro de ayuda', path: '/help', icon: HelpCircle },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const filtered = COMMANDS.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => {
          if (!prev) {
            setQuery('');
            setSelected(0);
            setTimeout(() => inputRef.current?.focus(), 0);
          }
          return !prev;
        });
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) setSelected(0);
  }, [query, open]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === 'Enter' && filtered[selected]) {
        e.preventDefault();
        navigate(filtered[selected].path);
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, selected, filtered, navigate]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const item = el.querySelector(`[data-index="${selected}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!open) return null;

  const content = (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 bg-black/50"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-gray-200 dark:border-gray-700 px-4">
          <span className="text-gray-400 text-sm mr-2">Buscar</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ir a..."
            className="flex-1 py-3 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none"
          />
          <kbd className="hidden sm:inline px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded text-gray-500">
            ESC
          </kbd>
        </div>
        <div
          ref={listRef}
          className="max-h-64 overflow-y-auto py-2"
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">Sin resultados</div>
          ) : (
            filtered.map((cmd, i) => {
              const Icon = cmd.icon;
              return (
                <button
                  key={cmd.id}
                  data-index={i}
                  type="button"
                  onClick={() => {
                    navigate(cmd.path);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === selected
                      ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span>{cmd.label}</span>
                </button>
              );
            })
          )}
        </div>
        <div className="px-4 py-2 text-xs text-gray-500 border-t border-gray-200 dark:border-gray-700">
          <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">?</kbd>
          <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded ml-1">?</kbd>
          <span className="ml-2">navegar</span>
          <span className="mx-2">?</span>
          <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">?</kbd>
          <span className="ml-2">seleccionar</span>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
