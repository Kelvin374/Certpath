"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/* -------------------------------------------------------------------------
 * Tooltip
 * ---------------------------------------------------------------------- */

function ChartTooltip({
  active,
  payload,
  label,
  suffix = "%",
}: {
  active?: boolean;
  payload?: { value?: number | string; name?: string }[];
  label?: string | number;
  suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value;
  return (
    <div className="rounded-xl border border-border bg-card/95 px-3 py-2 text-xs shadow-soft backdrop-blur">
      {label !== undefined ? <p className="font-medium">{label}</p> : null}
      <p className="text-muted-foreground">
        {typeof value === "number" ? value : value}
        {suffix}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Domain radar
 * ---------------------------------------------------------------------- */

export interface DomainDatum {
  domain: string;
  pct: number;
}

export function DomainRadar({
  data,
  accent = "hsl(var(--accent))",
  height = 240,
}: {
  data: DomainDatum[];
  accent?: string;
  height?: number;
}) {
  if (!data.length) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Take a quiz to reveal your domain strengths.
      </p>
    );
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarAngleAxis
            dataKey="domain"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
            axisLine={false}
          />
          <Radar
            name="Strength"
            dataKey="pct"
            stroke={accent}
            fill={accent}
            fillOpacity={0.22}
            strokeWidth={2}
          />
          <Tooltip content={<ChartTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Score trend
 * ---------------------------------------------------------------------- */

export interface TrendDatum {
  label: string;
  score: number;
}

export function TrendLine({
  data,
  accent = "hsl(var(--accent))",
  height = 240,
}: {
  data: TrendDatum[];
  accent?: string;
  height?: number;
}) {
  if (!data.length) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Complete a quiz to start your trend.
      </p>
    );
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTooltip />} />
          <Line
            type="monotone"
            dataKey="score"
            stroke={accent}
            strokeWidth={2.5}
            dot={{ r: 3.5, fill: accent }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Domain bars
 * ---------------------------------------------------------------------- */

export function DomainBars({
  data,
  accent = "hsl(var(--accent))",
}: {
  data: DomainDatum[];
  accent?: string;
}) {
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.domain}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="truncate pr-2 text-muted-foreground">{d.domain}</span>
            <span className="font-medium tabular-nums">{d.pct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{ width: `${Math.max(0, Math.min(100, d.pct))}%`, background: accent }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
