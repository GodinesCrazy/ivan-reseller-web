import type { ReactNode } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot, Search, Sparkles } from 'lucide-react';

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
    <section className="rounded-lg border border-slate-700/80 bg-slate-950/65 p-5 shadow-lg shadow-black/20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-cyan-300">
            <Sparkles className="h-3.5 w-3.5" />
            {eyebrow}
          </div>
          <h1 className="text-xl font-bold text-white">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-300">{description}</p>
        </div>
        {children ? <div className="shrink-0">{children}</div> : null}
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

  return (
    <section className={`rounded-lg border ${styles.border} ${styles.bg} p-4`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${styles.border} ${styles.bg}`}>
            {tone === 'emerald' ? <CheckCircle2 className={`h-4 w-4 ${styles.accent}`} /> : <AlertTriangle className={`h-4 w-4 ${styles.accent}`} />}
          </div>
          <div className="min-w-0">
            <h2 className={`text-sm font-bold ${styles.text}`}>{title}</h2>
            <p className="mt-1 text-sm text-slate-300">{description}</p>
            {meta.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {meta.map((item) => (
                  <span key={item} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${styles.chip}`}>
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {(primaryLabel || secondaryLabel) ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {secondaryLabel ? (
              <button
                type="button"
                onClick={onSecondary}
                disabled={disabled || !onSecondary}
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {secondaryLabel}
              </button>
            ) : null}
            {primaryLabel ? (
              <button
                type="button"
                onClick={onPrimary}
                disabled={disabled || !onPrimary}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {primaryLabel}
                <ArrowRight className="h-4 w-4" />
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

  return (
    <div className={`rounded-lg border ${styles.border} bg-slate-900/70 p-4`}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      {detail ? <p className={`mt-1 text-xs ${styles.accent}`}>{detail}</p> : null}
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
    <div className="flex flex-wrap gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2">
      {tabs.map((tab) => {
        const active = tab.value === value;
        const styles = toneClass[tab.tone ?? 'cyan'];
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className={`rounded-md border px-3 py-2 text-xs font-bold transition ${
              active
                ? `${styles.border} ${styles.bg} ${styles.text}`
                : 'border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-900 hover:text-slate-100'
            }`}
          >
            {tab.label}
            {tab.count !== undefined ? <span className="ml-2 rounded bg-black/20 px-1.5 py-0.5 tabular-nums">{tab.count}</span> : null}
          </button>
        );
      })}
    </div>
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
    <section className="rounded-lg border border-slate-800 bg-slate-950/55 p-3">
      <div className="grid gap-2 md:grid-cols-6">
        {cycleSteps.map((step, index) => {
          const isDone = index < activeIndex;
          const isActive = step.id === active;
          return (
            <div
              key={step.id}
              className={`rounded-lg border px-3 py-2 text-xs font-bold ${
                isActive
                  ? 'border-cyan-400/45 bg-cyan-500/15 text-cyan-100'
                  : isDone
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                    : 'border-slate-800 bg-slate-900/70 text-slate-400'
              }`}
            >
              {index + 1}. {step.label}
            </div>
          );
        })}
      </div>
    </section>
  );
}
