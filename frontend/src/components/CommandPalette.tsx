import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Search } from 'lucide-react';

export type PaletteItem = { to: string; label: string; group: string; icon: ComponentType<{ className?: string }> };

const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();

/** Quick module search (Ctrl+K / ⌘K): type a few letters, press Enter. */
export function CommandPalette({ items, open, onClose }: { items: PaletteItem[]; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => {
    const needle = normalize(query.trim());
    return needle ? items.filter(item => normalize(`${item.label} ${item.group}`).includes(needle)) : items;
  }, [items, query]);
  useEffect(() => { if (open) { setQuery(''); setActive(0); setTimeout(() => input.current?.focus(), 0); } }, [open]);
  useEffect(() => { setActive(0); }, [query]);
  if (!open) return null;
  const go = (item?: PaletteItem) => { if (!item) return; onClose(); navigate(item.to); };
  return <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-[12vh]" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label="Rechercher un module" className="w-full max-w-lg overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
      <div className="flex items-center gap-3 border-b border-stone-100 px-4">
        <Search className="h-5 w-5 shrink-0 text-stone-400"/>
        <input ref={input} value={query} onChange={event => setQuery(event.target.value)} placeholder="Aller à… (élèves, factures, internat…)"
          onKeyDown={event => {
            if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(index + 1, results.length - 1)); }
            if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, 0)); }
            if (event.key === 'Enter') { event.preventDefault(); go(results[active]); }
            if (event.key === 'Escape') onClose();
          }}
          className="h-14 w-full !border-0 !bg-transparent text-base !shadow-none !outline-none"/>
        <kbd className="hidden rounded border border-stone-200 px-1.5 py-0.5 text-[10px] text-stone-500 sm:block">Échap</kbd>
      </div>
      <ul className="max-h-[50vh] overflow-y-auto p-2">
        {results.map((item, index) => { const Icon = item.icon; return <li key={item.to}>
          <button type="button" onMouseEnter={() => setActive(index)} onClick={() => go(item)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${index === active ? 'bg-brand-gold-soft text-stone-900' : 'text-stone-700'}`}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600"><Icon className="h-4 w-4"/></span>
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{item.label}</span><span className="block truncate text-xs text-stone-500">{item.group}</span></span>
            {index === active && <CornerDownLeft className="h-4 w-4 text-stone-400"/>}
          </button>
        </li>; })}
        {!results.length && <li className="p-6 text-center text-sm text-stone-500">Aucun module ne correspond.</li>}
      </ul>
    </div>
  </div>;
}
