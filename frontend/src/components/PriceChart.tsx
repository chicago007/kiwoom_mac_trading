"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatUsd } from "@/lib/format";
import type { ChartBar, ChartInterval, Exchange } from "@/lib/types";

const TFS: { id: ChartInterval; label: string }[] = [
  { id: "1", label: "1분" },
  { id: "5", label: "5분" },
  { id: "D", label: "일" },
];

type Props = {
  stkCd: string;
  stexTp: Exchange;
  last?: number;
  onPick?: (price: number) => void;
};

export function PriceChart({ stkCd, stexTp, last, onPick }: Props) {
  const [interval, setIntervalTf] = useState<ChartInterval>("D");
  const [bars, setBars] = useState<ChartBar[]>([]);
  const [note, setNote] = useState("");
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 280, h: 180 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let live = true;
    setNote("차트를 불러오는 중…");
    const load = () =>
      api
        .chart(stkCd, stexTp, interval)
        .then((data) => {
          if (!live) return;
          setBars(data.bars || []);
          setNote(data.note || (data.source === "mock" ? "목업 차트" : "키움 차트"));
        })
        .catch((err: unknown) => {
          if (!live) return;
          setNote(err instanceof Error ? err.message : "차트를 불러오지 못했습니다.");
          window.setTimeout(() => {
            if (live) load();
          }, 1500);
        });
    load();
    return () => {
      live = false;
    };
  }, [stkCd, stexTp, interval]);

  const layout = useMemo(() => layoutChart(bars, size.w, size.h, last), [bars, size, last]);
  const tip = hover != null ? bars[hover] : null;

  return (
    <section className="panel flex min-h-[10rem] min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-1 px-2 py-1">
        <span className="mr-auto text-[13px] text-cream-500">{note || "차트"}</span>
        {TFS.map((tf) => (
          <button
            key={tf.id}
            type="button"
            className={`px-1.5 py-0.5 text-[12px] ${interval === tf.id ? "bg-brass-500 text-ink-950" : "bg-ink-800 text-cream-300"}`}
            onClick={() => setIntervalTf(tf.id)}
          >
            {tf.label}
          </button>
        ))}
      </div>
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        {bars.length === 0 ? (
          <p className="px-2 py-8 text-center text-[13px] text-cream-500">{note || "차트를 불러오는 중…"}</p>
        ) : (
          <svg
            width={Math.max(1, size.w)}
            height={Math.max(1, size.h)}
            className="block h-full w-full"
            onMouseLeave={() => setHover(null)}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * size.w;
              setHover(indexAt(layout, x));
            }}
            onClick={() => {
              if (tip && onPick) onPick(tip.c);
            }}
          >
            {layout.lastY != null && (
              <line
                x1={layout.left}
                x2={layout.right}
                y1={layout.lastY}
                y2={layout.lastY}
                stroke="#f0b429"
                strokeWidth="1"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {layout.candles.map((c) => (
              <g key={c.i}>
                <line x1={c.x} x2={c.x} y1={c.yH} y2={c.yL} stroke={c.up ? "#ff4d4d" : "#4d8bff"} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <rect
                  x={c.x - c.hw}
                  y={c.bodyY}
                  width={c.hw * 2}
                  height={Math.max(1, c.bodyH)}
                  fill={c.up ? "#ff4d4d" : "#4d8bff"}
                />
                {c.volH > 0 && <rect x={c.x - c.hw} y={c.volY} width={c.hw * 2} height={c.volH} fill={c.up ? "rgba(255,77,77,0.28)" : "rgba(77,139,255,0.28)"} />}
              </g>
            ))}
            {layout.labels.map((lb) => (
              <text key={lb.t} x={lb.x} y={size.h - 4} fill="#6b7785" fontSize="11" textAnchor={lb.anchor}>
                {lb.t}
              </text>
            ))}
            {layout.yLabels.map((lb) => (
              <text key={lb.y} x={size.w - 2} y={lb.y + 3} fill="#6b7785" fontSize="11" textAnchor="end">
                {lb.t}
              </text>
            ))}
          </svg>
        )}
        {tip && (
          <div className="pointer-events-none absolute left-1 top-1 bg-ink-950/90 px-1.5 py-0.5 font-mono text-[12px] text-cream-50">
            {stampLabel(tip.t)} · O {formatUsd(tip.o)} H {formatUsd(tip.h)} L {formatUsd(tip.l)} C {formatUsd(tip.c)}
          </div>
        )}
      </div>
    </section>
  );
}

type CandleLayout = {
  i: number;
  x: number;
  hw: number;
  yH: number;
  yL: number;
  bodyY: number;
  bodyH: number;
  volY: number;
  volH: number;
  up: boolean;
};

function layoutChart(bars: ChartBar[], w: number, h: number, last?: number) {
  const left = 6;
  const right = Math.max(52, w - 44);
  if (!bars.length || w < 8 || h < 8) {
    return { left, right, candles: [] as CandleLayout[], lastY: null as number | null, labels: [] as { x: number; t: string; anchor: "start" | "end" }[], yLabels: [] as { y: number; t: string }[], step: 1 };
  }
  const top = 10;
  const volH = Math.max(16, h * 0.18);
  const plotBottom = h - volH - 16;
  const plotH = Math.max(20, plotBottom - top);
  const n = Math.max(bars.length, 1);
  const step = (right - left) / n;
  const hw = Math.max(0.7, Math.min(4.5, step * 0.36));
  const lo = Math.min(...bars.map((b) => b.l));
  const hi = Math.max(...bars.map((b) => b.h));
  const pad = (hi - lo) * 0.06 || 1;
  const min = lo - pad;
  const max = hi + pad;
  const span = max - min || 1;
  const y = (px: number) => top + ((max - px) / span) * plotH;
  const maxV = Math.max(...bars.map((b) => b.v), 1);
  const candles: CandleLayout[] = bars.map((b, i) => {
    const x = left + step * (i + 0.5);
    const yO = y(b.o);
    const yC = y(b.c);
    const bodyY = Math.min(yO, yC);
    const volBar = (b.v / maxV) * (volH - 8);
    return {
      i,
      x,
      hw,
      yH: y(b.h),
      yL: y(b.l),
      bodyY,
      bodyH: Math.max(1, Math.abs(yC - yO)),
      volY: h - 16 - volBar,
      volH: volBar,
      up: b.c >= b.o,
    };
  });
  const lastY = last && last >= min && last <= max ? y(last) : null;
  const labels = [];
  if (bars[0]) labels.push({ x: left, t: stampLabel(bars[0].t), anchor: "start" as const });
  if (bars.length > 1) labels.push({ x: right, t: stampLabel(bars[bars.length - 1].t), anchor: "end" as const });
  const yLabels = [
    { y: top + 8, t: axisPx(max) },
    { y: top + plotH / 2, t: axisPx((max + min) / 2) },
    { y: plotBottom - 2, t: axisPx(min) },
  ];
  return { left, right, candles, lastY, labels, yLabels, step };
}

function axisPx(n: number) {
  if (!Number.isFinite(n)) return "";
  if (n >= 1000) return n.toFixed(0);
  if (n >= 100) return n.toFixed(1);
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function indexAt(layout: ReturnType<typeof layoutChart>, x: number) {
  if (!layout.candles.length) return null;
  const i = Math.round((x - layout.left) / layout.step - 0.5);
  if (i < 0 || i >= layout.candles.length) return null;
  return i;
}

function stampLabel(t: string) {
  if (t.length >= 12) return `${t.slice(4, 6)}/${t.slice(6, 8)} ${t.slice(8, 10)}:${t.slice(10, 12)}`;
  if (t.length >= 8) return `${t.slice(4, 6)}/${t.slice(6, 8)}`;
  return t;
}
