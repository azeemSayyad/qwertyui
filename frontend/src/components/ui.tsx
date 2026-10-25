import { useState, type ReactNode } from "react";
import { RotateCw } from "lucide-react";

export function Card({ title, subtitle, action, children, className = "" }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-4 sm:p-6 ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3 sm:mb-4">
          <div className="min-w-0">
            {title && <h3 className="text-[15px] font-bold tracking-tight sm:text-[16px]">{title}</h3>}
            {subtitle && <p className="mt-0.5 hidden text-[13px] text-[var(--ink-2)] sm:block">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export type Accent = "violet" | "blue" | "peach" | "green";

export function Stat({ label, short, value, hint, tone, accent = "violet", icon, back }: {
  label: string;
  /** Shorter label used on phones. */
  short?: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "good" | "bad";
  accent?: Accent;
  icon?: ReactNode;
  /** Explanation shown on the reverse side; makes the tile flip on click. */
  back?: ReactNode;
}) {
  const [flipped, setFlipped] = useState(false);
  const tint = { background: `var(--tint-${accent})` };
  const front = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11.5px] font-medium leading-snug text-[var(--ink-2)] sm:text-[13px]">
          {short ? (
            <>
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{label}</span>
            </>
          ) : (
            label
          )}
        </p>
        {icon && (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--surface)] sm:h-9 sm:w-9 sm:rounded-xl [&>svg]:h-4 [&>svg]:w-4 sm:[&>svg]:h-[18px] sm:[&>svg]:w-[18px]" style={{ color: `var(--icon-${accent})` }}>
            {icon}
          </span>
        )}
      </div>
      <p className="tabular mt-1.5 text-[18px] font-bold leading-tight tracking-tight sm:mt-1 sm:text-[26px]">{value}</p>
      {hint && (
        <p
          className="mt-1.5 hidden text-[12.5px] leading-snug sm:block"
          style={{ color: tone === "good" ? "var(--good)" : tone === "bad" ? "var(--bad)" : "var(--ink-2)" }}
        >
          {hint}
        </p>
      )}
    </>
  );

  if (!back) return <div className="rounded-2xl p-3 sm:p-5" style={tint}>{front}</div>;

  return (
    <button
      type="button"
      aria-pressed={flipped}
      aria-label={`${label}: ${flipped ? "show value" : "what is this?"}`}
      onClick={() => setFlipped((f) => !f)}
      className="group relative block w-full cursor-pointer text-left [perspective:1000px]"
    >
      <div
        className="relative h-full transition-transform duration-500 [transform-style:preserve-3d]"
        style={{ transform: flipped ? "rotateY(180deg)" : undefined }}
      >
        <div className="h-full rounded-2xl p-3 [backface-visibility:hidden] sm:p-5" style={tint}>
          {front}
          <RotateCw size={12} aria-hidden className="absolute bottom-2.5 right-2.5 text-[var(--muted)] opacity-60 transition group-hover:opacity-100 sm:bottom-3 sm:right-3" />
        </div>
        <div
          className="absolute inset-0 overflow-auto rounded-2xl p-3 [backface-visibility:hidden] [transform:rotateY(180deg)] sm:p-5"
          style={tint}
        >
          <p className="text-[11.5px] font-semibold sm:text-[13px]" style={{ color: `var(--icon-${accent})` }}>{label}</p>
          <p className="mt-1 text-[11px] leading-snug text-[var(--ink)] sm:mt-1.5 sm:text-[13px] sm:leading-relaxed">{back}</p>
          <RotateCw size={13} aria-hidden className="absolute bottom-3 right-3 text-[var(--muted)]" />
        </div>
      </div>
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-full rounded-xl bg-[var(--surface-2)] p-1 sm:inline-flex sm:w-auto">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 whitespace-nowrap rounded-lg px-2 py-2 text-[12px] font-medium transition sm:flex-none sm:px-3 sm:py-1.5 sm:text-[13px] ${
            value === o.value ? "bg-[var(--accent)] text-white shadow-sm" : "text-[var(--ink-2)] hover:text-[var(--ink)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function LegendItem({ color, label, dashed, wash, opacity = 0.22 }: {
  color: string;
  label: string;
  dashed?: boolean;
  wash?: boolean;
  opacity?: number;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-[12px] text-[var(--ink-2)]">
      {wash ? (
        <span className="h-3 w-4 rounded-sm" style={{ background: color, opacity }} />
      ) : (
        <svg width="18" height="6" aria-hidden>
          <line x1="1" y1="3" x2="17" y2="3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeDasharray={dashed ? "3 3" : undefined} />
        </svg>
      )}
      {label}
    </span>
  );
}

export function Skeleton({ h = 280 }: { h?: number }) {
  return <div className="skeleton w-full" style={{ height: h }} />;
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-[var(--ring)] bg-[var(--surface-2)] p-4 text-[13px] text-[var(--bad)]">
      {message}
    </div>
  );
}

export function TooltipBox({ title, rows }: { title: string; rows: { color?: string; label: string; value: string }[] }) {
  return (
    <div className="min-w-[180px] rounded-xl border border-[var(--ring)] bg-[var(--surface)] px-3 py-2.5 text-[12px] shadow-lg">
      <p className="mb-1.5 font-medium text-[var(--ink)]">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="inline-flex items-center gap-1.5 text-[var(--ink-2)]">
            {r.color && <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="tabular font-medium text-[var(--ink)]">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
