import { useEffect, useState } from "react";
import { Gauge, LayoutDashboard, Moon, Sun, Wind } from "lucide-react";
import { Accuracy } from "./components/Accuracy";
import { DecisionDesk } from "./components/DecisionDesk";
import { ErrorNote, Skeleton } from "./components/ui";
import { api } from "./lib/api";
import { useTheme } from "./lib/theme";
import type { Meta } from "./lib/types";

// Forecast runs land at 02:30, 04:30, 07:30, 09:30 and 11:30 UTC, so these gates pick different runs.
const GATES = ["06:00", "08:00", "09:00", "09:30", "10:00", "11:00", "12:00"];

const SECTIONS = [
  { id: "desk", label: "Decision desk", Icon: LayoutDashboard },
  { id: "accuracy", label: "Accuracy", Icon: Gauge },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export default function App() {
  const { mode, palette, toggle } = useTheme();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState("10:00");
  const [day, setDay] = useState("2026-01-15");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const [section, setSection] = useState<SectionId>("desk");

  // Highlight the tab of the section currently in view.
  useEffect(() => {
    if (!meta) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setSection(visible.target.id as SectionId);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [meta]);

  useEffect(() => {
    api
      .meta()
      .then((m) => {
        setMeta(m);
        setGate(m.default_gate);
        setStart(m.default_start);
        setEnd(m.default_end);
      })
      .catch((e) => setError(`Could not reach the API: ${e.message}`));
  }, []);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[var(--ring)] bg-[var(--surface)]/90 backdrop-blur-md">
        <div className="flex items-center gap-3 px-4 py-2.5 sm:gap-4 sm:px-6 sm:py-3 lg:px-10">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--accent)] text-white shadow-[0_6px_16px_-6px_var(--accent)] sm:h-9 sm:w-9">
              <Wind size={17} aria-hidden />
            </span>
            <div className="leading-tight">
              <p className="text-[15px] font-bold tracking-tight sm:text-[16px]">Windsight</p>
              <p className="hidden text-[11px] text-[var(--muted)] sm:block">GB day-ahead wind desk</p>
            </div>
          </div>
          <nav className="ml-4 hidden gap-1 md:flex">
            <a href="#desk" className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-[var(--ink-2)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent)]">Decision desk</a>
            <a href="#accuracy" className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-[var(--ink-2)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent)]">Accuracy</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-2 text-[12px] text-[var(--ink-2)]">
              <span className="hidden sm:inline">Gate closure (D-1)</span>
              <span className="text-[11px] sm:hidden">Gate</span>
              <select aria-label="Gate closure time" className="field h-9 py-1 text-[13px] tabular sm:text-[14px]" value={gate} onChange={(e) => setGate(e.target.value)}>
                {GATES.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            <button aria-label="Toggle dark mode" onClick={toggle} className="field grid h-9 w-9 place-items-center p-0">
              {mode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </header>

      <main className="space-y-10 px-4 pb-28 pt-5 sm:space-y-14 sm:px-6 sm:pt-8 md:pb-16 lg:px-10">
        {error && <ErrorNote message={error} />}
        {!meta && !error && <Skeleton h={420} />}
        {meta && (
          <>
            <div id="desk" className="scroll-mt-20">
              <DecisionDesk
                day={day}
                setDay={setDay}
                gate={gate}
                min={meta.default_start}
                max={meta.default_end}
                palette={palette}
              />
            </div>
            <div id="accuracy" className="scroll-mt-20">
              <Accuracy
                start={start}
                end={end}
                setStart={setStart}
                setEnd={setEnd}
                min="2025-12-31"
                max={meta.default_end}
                gate={gate}
                lookback={meta.band_lookback_days}
                palette={palette}
              />
            </div>
          </>
        )}
      </main>

      <nav
        aria-label="Sections"
        className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-[var(--ring)] bg-[var(--surface)]/95 px-6 pt-2 backdrop-blur-md md:hidden"
      >
        <div className="mx-auto grid max-w-sm grid-cols-2 gap-2">
          {SECTIONS.map(({ id, label, Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={section === id ? "true" : undefined}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition ${
                section === id ? "bg-[var(--accent-wash)] text-[var(--accent)]" : "text-[var(--muted)]"
              }`}
            >
              <Icon size={19} aria-hidden />
              {label}
            </a>
          ))}
        </div>
      </nav>
    </div>
  );
}
