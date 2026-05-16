import type { ReactNode } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot, Search, Sparkles, TrendingUp, ShieldCheck, Activity, Target, Zap, BarChart2, Check } from 'lucide-react';

type Tone = 'cyan' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate';

const toneClass: Record<Tone, { border: string; bg: string; text: string; accent: string; chip: string }> = {
  cyan: {
    border: 'border-cyan-500/25',
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-200',
    accent: 'text-cyan-300',
    chip: 'bg-cyan-500/15 text-cyan-200 border-cyan-400/25',
  },
  emerald: {
    border: 'border-emerald-500/25',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-200',
    accent: 'text-emerald-300',
    chip: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/25',
  },
  amber: {
    border: 'border-amber-500/25',
    bg: 'bg-amber-500/10',
    text: 'text-amber-200',
    accent: 'text-amber-300',
    chip: 'bg-amber-500/15 text-amber-200 border-amber-400/25',
  },
  rose: {
    border: 'border-rose-500/25',
    bg: 'bg-rose-500/10',
    text: 'text-rose-200',
    accent: 'text-rose-300',
    chip: 'bg-rose-500/15 text-rose-200 border-rose-400/25',
  },
  violet: {
    border: 'border-violet-500/25',
    bg: 'bg-violet-500/10',
    text: 'text-violet-200',
    accent: 'text-violet-300',
    chip: 'bg-violet-500/15 text-violet-200 border-violet-400/25',
  },
  slate: {
    border: 'border-slate-700/80',
    bg: 'bg-slate-900/65',
    text: 'text-slate-200',
    accent: 'text-slate-300',
    chip: 'bg-slate-800 text-slate-200 border-slate-700',
  },
};

type CommercialPageHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
};

export function CommercialPageHeader({ eyebrow = 'CJ -> SHOPIFY USA', title, description, children }: CommercialPageHeaderProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl border-2 border-slate-800/80 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-black/40">
      {/* Accent side bar */}
      <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-cyan-400 via-violet-500 to-emerald-400" />
      
      {/* Background glow */}
      <div className="absolute -left-20 -top-20 h-40 w-40 rounded-full bg-cyan-500/10 blur-[50px]" />
      
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-cyan-300 shadow-inner">
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
            {eyebrow}
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white drop-shadow-sm">{title}</h1>
          <p className="mt-2 max-w-3xl text-base leading-relaxed text-slate-300/90">{description}</p>
        </div>
        {children ? <div className="shrink-0 pt-1 lg:pt-0">{children}</div> : null}
      </div>
    </section>
  );
}

type ActionPriorityBandProps = {
  tone?: Tone;
  title: string;
  description: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  meta?: string[];
  disabled?: boolean;
};

export function ActionPriorityBand({
  tone = 'cyan',
  title,
  description,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  meta = [],
  disabled = false,
}: ActionPriorityBandProps) {
  const styles = toneClass[tone];
  const isAlert = tone === 'amber' || tone === 'rose';

  return (
    <section className={`relative overflow-hidden rounded-xl border-2 ${styles.border} bg-slate-950 p-5 shadow-lg`}>
      {/* Background soft glow based on tone */}
      <div className={`absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-current opacity-5 text-${tone}-500`} />
      
      {/* Thick left accent bar */}
      <div className={`absolute inset-y-0 left-0 w-1.5 ${
        tone === 'cyan' ? 'bg-cyan-500 shadow-cyan-500/50' :
        tone === 'emerald' ? 'bg-emerald-500 shadow-emerald-500/50' :
        tone === 'amber' ? 'bg-amber-500 shadow-amber-500/50' :
        tone === 'rose' ? 'bg-rose-500 shadow-rose-500/50' :
        tone === 'violet' ? 'bg-violet-500 shadow-violet-500/50' :
        'bg-slate-500 shadow-slate-500/50'
      } shadow-[0_0_10px]`} />

      <div className="relative ml-2 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 gap-4">
          <div className={`relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 ${styles.border} ${styles.bg} shadow-inner`}>
            {/* Pulsing effect for alerts */}
            {isAlert && (
              <span className={`absolute inset-0 animate-ping rounded-xl opacity-20 ${
                tone === 'amber' ? 'bg-amber-500' : 'bg-rose-500'
              }`} />
            )}
            {tone === 'emerald' ? <CheckCircle2 className={`h-5 w-5 ${styles.accent}`} /> : <AlertTriangle className={`h-5 w-5 ${styles.accent}`} />}
          </div>
          <div className="min-w-0">
            <h2 className={`text-base font-extrabold tracking-wide drop-shadow-sm ${styles.text}`}>{title}</h2>
            <p className="mt-1 text-sm font-medium text-slate-300/90">{description}</p>
            {meta.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {meta.map((item) => (
                  <span key={item} className={`rounded-md border-b-2 px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${styles.chip}`}>
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {(primaryLabel || secondaryLabel) ? (
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {secondaryLabel ? (
              <button
                type="button"
                onClick={onSecondary}
                disabled={disabled || !onSecondary}
                className="rounded-lg border-2 border-slate-700 bg-slate-900/50 px-5 py-2.5 text-sm font-bold text-slate-300 transition-all hover:border-slate-500 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {secondaryLabel}
              </button>
            ) : null}
            {primaryLabel ? (
              <button
                type="button"
                onClick={onPrimary}
                disabled={disabled || !onPrimary}
                className={`group relative inline-flex items-center gap-2 overflow-hidden rounded-lg px-6 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${
                  tone === 'cyan' ? 'bg-gradient-to-r from-cyan-600 to-blue-600 shadow-cyan-900/50 hover:from-cyan-500 hover:to-blue-500' :
                  tone === 'emerald' ? 'bg-gradient-to-r from-emerald-600 to-teal-600 shadow-emerald-900/50 hover:from-emerald-500 hover:to-teal-500' :
                  tone === 'amber' ? 'bg-gradient-to-r from-amber-600 to-orange-600 shadow-amber-900/50 hover:from-amber-500 hover:to-orange-500' :
                  tone === 'rose' ? 'bg-gradient-to-r from-rose-600 to-red-600 shadow-rose-900/50 hover:from-rose-500 hover:to-red-500' :
                  tone === 'violet' ? 'bg-gradient-to-r from-violet-600 to-purple-600 shadow-violet-900/50 hover:from-violet-500 hover:to-purple-500' :
                  'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-blue-900/50 hover:from-blue-500 hover:to-indigo-500'
                }`}
              >
                <span className="relative z-10 flex items-center gap-2">
                  {primaryLabel}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

type CommercialMetricCardProps = {
  label: string;
  value: string | number;
  detail?: string;
  tone?: Tone;
};

export function CommercialMetricCard({ label, value, detail, tone = 'slate' }: CommercialMetricCardProps) {
  const styles = toneClass[tone];
  const activeGlow: Record<string, string> = {
    cyan: 'hover:shadow-cyan-500/20',
    emerald: 'hover:shadow-emerald-500/20',
    amber: 'hover:shadow-amber-500/20',
    rose: 'hover:shadow-rose-500/20',
    violet: 'hover:shadow-violet-500/20',
    slate: 'hover:shadow-slate-500/10',
  };

  return (
    <div className={`group relative overflow-hidden rounded-xl border-2 ${styles.border} bg-gradient-to-br from-slate-900 to-slate-950 p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${activeGlow[tone]}`}>
      {/* Top right icon */}
      <div className={`absolute right-4 top-4 opacity-50 transition-opacity duration-300 group-hover:opacity-100 ${styles.accent}`}>
        {tone === 'cyan' ? <Activity className="h-6 w-6" /> :
         tone === 'emerald' ? <ShieldCheck className="h-6 w-6" /> :
         tone === 'amber' ? <Zap className="h-6 w-6" /> :
         tone === 'rose' ? <Target className="h-6 w-6" /> :
         tone === 'violet' ? <TrendingUp className="h-6 w-6" /> :
         <BarChart2 className="h-6 w-6" />}
      </div>
      
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
      
      {/* Value with gradient */}
      <div className="mt-3 bg-gradient-to-br from-white to-slate-400 bg-clip-text text-3xl font-extrabold drop-shadow-sm text-transparent">
        {value}
      </div>
      
      {detail ? (
        <div className="mt-2 flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${styles.bg.replace('10', '50')} ${styles.border.replace('25', '100')}`} />
          <p className={`text-xs font-medium ${styles.accent}`}>{detail}</p>
        </div>
      ) : null}

      {/* Bottom progress/accent line */}
      <div className={`absolute bottom-0 left-0 h-1 w-full scale-x-0 bg-gradient-to-r ${
        tone === 'cyan' ? 'from-cyan-400 to-cyan-600' :
        tone === 'emerald' ? 'from-emerald-400 to-emerald-600' :
        tone === 'amber' ? 'from-amber-400 to-amber-600' :
        tone === 'rose' ? 'from-rose-400 to-rose-600' :
        tone === 'violet' ? 'from-violet-400 to-violet-600' :
        'from-slate-500 to-slate-700'
      } transition-transform duration-500 group-hover:scale-x-100`} style={{ transformOrigin: 'left' }} />
    </div>
  );
}

type PremiumSectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  tone?: Tone;
  children?: ReactNode;
};

export function PremiumSectionHeader({ eyebrow, title, description, tone = 'cyan', children }: PremiumSectionHeaderProps) {
  const styles = toneClass[tone];
  return (
    <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className={`text-[11px] font-bold uppercase tracking-wide ${styles.accent}`}>{eyebrow}</p> : null}
        <h2 className="mt-1 text-base font-bold text-white">{title}</h2>
        {description ? <p className="mt-1 max-w-3xl text-sm text-slate-400">{description}</p> : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}

type DecisionTabsProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  tabs: Array<{ value: T; label: string; count?: number; tone?: Tone }>;
};

export function DecisionTabs<T extends string>({ value, onChange, tabs }: DecisionTabsProps<T>) {
  return (
    <nav className="relative rounded-xl border-2 border-cyan-500/20 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-1.5 shadow-lg shadow-cyan-500/5">
      {/* Glow accent line */}
      <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
      <div className="flex gap-1.5 overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.value === value;
          const tone = tab.tone ?? 'cyan';
          const styles = toneClass[tone];
          const activeGlow: Record<string, string> = {
            cyan: 'shadow-cyan-500/25',
            emerald: 'shadow-emerald-500/25',
            amber: 'shadow-amber-500/25',
            rose: 'shadow-rose-500/25',
            violet: 'shadow-violet-500/25',
            slate: 'shadow-slate-500/15',
          };
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onChange(tab.value)}
              className={`group relative flex-1 min-w-[120px] rounded-lg px-4 py-3 text-sm font-bold tracking-wide transition-all duration-300 ${
                active
                  ? `${styles.bg} ${styles.text} border-2 ${styles.border} shadow-lg ${activeGlow[tone] ?? ''}`
                  : 'border-2 border-transparent text-slate-500 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {/* Active bottom glow bar */}
              {active && (
                <span className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gradient-to-r ${
                  tone === 'cyan' ? 'from-cyan-400 to-cyan-600' :
                  tone === 'emerald' ? 'from-emerald-400 to-emerald-600' :
                  tone === 'amber' ? 'from-amber-400 to-amber-600' :
                  tone === 'rose' ? 'from-rose-400 to-rose-600' :
                  tone === 'violet' ? 'from-violet-400 to-violet-600' :
                  'from-slate-400 to-slate-600'
                }`} />
              )}
              <span className="flex items-center justify-center gap-2">
                {/* Active dot indicator */}
                {active && <span className={`h-2 w-2 rounded-full ${
                  tone === 'cyan' ? 'bg-cyan-400 shadow-[0_0_6px] shadow-cyan-400' :
                  tone === 'emerald' ? 'bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400' :
                  tone === 'amber' ? 'bg-amber-400 shadow-[0_0_6px] shadow-amber-400' :
                  tone === 'rose' ? 'bg-rose-400 shadow-[0_0_6px] shadow-rose-400' :
                  tone === 'violet' ? 'bg-violet-400 shadow-[0_0_6px] shadow-violet-400' :
                  'bg-slate-400'
                }`} />}
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className={`ml-1 rounded-full px-2 py-0.5 text-xs tabular-nums font-bold ${
                    active
                      ? 'bg-white/15 text-white'
                      : 'bg-slate-800 text-slate-500 group-hover:bg-slate-700 group-hover:text-slate-300'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

type CompactDataPanelProps = {
  title: string;
  value?: string | number;
  detail?: string;
  tone?: Tone;
  children?: ReactNode;
};

export function CompactDataPanel({ title, value, detail, tone = 'slate', children }: CompactDataPanelProps) {
  const styles = toneClass[tone];
  return (
    <section className={`rounded-lg border ${styles.border} bg-slate-950/65 p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</p>
          {value !== undefined ? <p className="mt-2 text-2xl font-bold text-white">{value}</p> : null}
          {detail ? <p className={`mt-1 text-xs ${styles.accent}`}>{detail}</p> : null}
        </div>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${styles.border} ${styles.bg}`}>
          <CircleDot className={`h-4 w-4 ${styles.accent}`} />
        </div>
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}

type SignalBadgeProps = {
  children: ReactNode;
  tone?: Tone;
};

export function SignalBadge({ children, tone = 'slate' }: SignalBadgeProps) {
  const styles = toneClass[tone];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${styles.chip}`}>
      {children}
    </span>
  );
}

type ProductSignalRowProps = {
  title: string;
  decision: string;
  tone?: Tone;
  metrics: Array<{ label: string; value: string | number }>;
  reason?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function ProductSignalRow({ title, decision, tone = 'cyan', metrics, reason, actionLabel, onAction }: ProductSignalRowProps) {
  const styles = toneClass[tone];
  return (
    <div className={`rounded-lg border ${styles.border} bg-slate-950/70 p-3`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="max-w-xl truncate text-sm font-bold text-white" title={title}>{title}</h3>
            <SignalBadge tone={tone}>{decision}</SignalBadge>
          </div>
          {reason ? <p className="mt-1 text-xs text-slate-400 line-clamp-2">{reason}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {metrics.map((metric) => (
            <span key={metric.label} className="rounded border border-slate-800 bg-slate-900 px-2.5 py-1 text-[11px] text-slate-300">
              {metric.label}: <b className="text-slate-100">{metric.value}</b>
            </span>
          ))}
          {actionLabel ? (
            <button
              type="button"
              onClick={onAction}
              disabled={!onAction}
              className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-slate-100 hover:border-cyan-400 disabled:opacity-50"
            >
              {actionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type EmptyCommercialStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyCommercialState({ title, description, actionLabel, onAction }: EmptyCommercialStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/50 px-6 py-10 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-900">
        <Search className="h-4 w-4 text-cyan-300" />
      </div>
      <h3 className="mt-4 text-sm font-bold text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-400">{description}</p>
      {actionLabel ? (
        <button
          type="button"
          onClick={onAction}
          disabled={!onAction}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {actionLabel}
          <ArrowRight className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

type ProductDecisionCardProps = {
  title: string;
  subtitle?: string;
  decision: string;
  tone?: Tone;
  metrics?: Array<{ label: string; value: string | number }>;
  actionLabel?: string;
  onAction?: () => void;
};

export function ProductDecisionCard({ title, subtitle, decision, tone = 'cyan', metrics = [], actionLabel, onAction }: ProductDecisionCardProps) {
  const styles = toneClass[tone];

  return (
    <article className={`rounded-lg border ${styles.border} bg-slate-950/70 p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-white">{title}</h3>
          {subtitle ? <p className="mt-1 text-xs text-slate-400">{subtitle}</p> : null}
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${styles.chip}`}>{decision}</span>
      </div>
      {metrics.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-lg border border-slate-800 bg-slate-900/70 p-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">{metric.label}</p>
              <p className="mt-1 text-sm font-bold text-slate-100">{metric.value}</p>
            </div>
          ))}
        </div>
      ) : null}
      {actionLabel ? (
        <button
          type="button"
          onClick={onAction}
          disabled={!onAction}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {actionLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </article>
  );
}

type RiskActionQueueProps = {
  title?: string;
  items: Array<{ id: string; title: string; detail?: string; tone?: Tone; actionLabel?: string; onAction?: () => void }>;
  emptyLabel?: string;
};

export function RiskActionQueue({ title = 'Cola de decisiones', items, emptyLabel = 'Sin riesgos comerciales inmediatos.' }: RiskActionQueueProps) {
  return (
    <section className="rounded-lg border border-slate-700/80 bg-slate-950/65 p-4">
      <div className="mb-3 flex items-center gap-2">
        <CircleDot className="h-4 w-4 text-cyan-300" />
        <h2 className="text-sm font-bold text-white">{title}</h2>
      </div>
      {items.length ? (
        <div className="space-y-2">
          {items.map((item) => {
            const styles = toneClass[item.tone ?? 'slate'];
            return (
              <div key={item.id} className={`flex flex-col gap-3 rounded-lg border ${styles.border} ${styles.bg} p-3 sm:flex-row sm:items-center sm:justify-between`}>
                <div>
                  <p className={`text-sm font-bold ${styles.text}`}>{item.title}</p>
                  {item.detail ? <p className="mt-1 text-xs text-slate-300">{item.detail}</p> : null}
                </div>
                {item.actionLabel ? (
                  <button
                    type="button"
                    onClick={item.onAction}
                    disabled={!item.onAction}
                    className="shrink-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {item.actionLabel}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-400">{emptyLabel}</p>
      )}
    </section>
  );
}

type CycleNarrativeStripProps = {
  active?: 'discover' | 'evaluate' | 'publish' | 'promote' | 'measure' | 'optimize';
};

const cycleSteps = [
  { id: 'discover', label: 'Descubrir' },
  { id: 'evaluate', label: 'Evaluar' },
  { id: 'publish', label: 'Publicar' },
  { id: 'promote', label: 'Promocionar' },
  { id: 'measure', label: 'Medir' },
  { id: 'optimize', label: 'Optimizar' },
] as const;

export function CycleNarrativeStrip({ active = 'discover' }: CycleNarrativeStripProps) {
  const activeIndex = cycleSteps.findIndex((step) => step.id === active);

  return (
    <section className="overflow-hidden rounded-xl border-2 border-slate-800/60 bg-slate-950/80 p-5 shadow-inner">
      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-0">
        {/* Background connector line for desktop */}
        <div className="absolute left-[5%] right-[5%] top-1/2 hidden h-1.5 -translate-y-1/2 rounded-full bg-slate-800/50 md:block" />
        
        {cycleSteps.map((step, index) => {
          const isDone = index < activeIndex;
          const isActive = step.id === active;
          
          return (
            <div key={step.id} className="relative z-10 flex flex-1 flex-col items-center gap-3">
              <div 
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold shadow-lg transition-all duration-300 ${
                  isActive
                    ? 'scale-110 border-cyan-400 bg-cyan-950 text-cyan-300 shadow-cyan-500/40 ring-4 ring-cyan-500/20'
                    : isDone
                      ? 'border-emerald-500 bg-emerald-500 text-white shadow-emerald-500/30'
                      : 'border-slate-700 bg-slate-900 text-slate-500'
                }`}
              >
                {isDone ? <Check className="h-5 w-5" /> : index + 1}
              </div>
              
              <div className={`text-xs font-black uppercase tracking-widest transition-colors ${
                isActive ? 'text-cyan-300' : isDone ? 'text-emerald-400' : 'text-slate-500'
              }`}>
                {step.label}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
