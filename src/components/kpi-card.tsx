type KpiCardProps = {
  label: string;
  value: string;
  delta: string;
  tone: "positive" | "neutral" | "warning";
};

const toneClasses: Record<KpiCardProps["tone"], string> = {
  positive: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  neutral: "bg-sky-50 text-sky-700 ring-sky-100",
  warning: "bg-amber-50 text-amber-700 ring-amber-100",
};

export function KpiCard({ label, value, delta, tone }: KpiCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{value}</p>
        </div>
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${toneClasses[tone]}`}>
          {delta}
        </span>
      </div>
    </div>
  );
}
