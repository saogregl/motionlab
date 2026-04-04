import { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { CommandFunctionShape } from '../../stores/mechanism.js';
import { evaluateFunction } from '../../utils/evaluate-function.js';

function readTheme() {
  const style = getComputedStyle(document.documentElement);
  return {
    series: style.getPropertyValue('--chart-series-1').trim() || '#3b82f6',
    axisText: style.getPropertyValue('--chart-axis-text').trim() || '#525252',
    grid: style.getPropertyValue('--chart-grid').trim() || '#e0e0e0',
  };
}

interface FunctionPreviewChartProps {
  fn: CommandFunctionShape;
  duration: number;
}

export function FunctionPreviewChart({ fn, duration }: FunctionPreviewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [themeKey, setThemeKey] = useState(0);

  // Watch for theme changes (class attribute on <html>)
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeKey((k) => k + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    });
    return () => observer.disconnect();
  }, []);

  // Single effect: create chart, observe resize, clean up
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const theme = readTheme();
    const { times, values } = evaluateFunction(fn, duration, 200);
    const data: uPlot.AlignedData = [new Float64Array(times), new Float64Array(values)];

    const opts: uPlot.Options = {
      width: el.clientWidth,
      height: 120,
      cursor: { show: true, drag: { x: false, y: false } },
      legend: { show: false },
      padding: [8, 8, 0, 0],
      axes: [
        {
          stroke: theme.axisText,
          grid: { stroke: theme.grid, width: 1 },
          font: '10px system-ui',
          size: 24,
          label: '',
        },
        {
          stroke: theme.axisText,
          grid: { stroke: theme.grid, width: 1 },
          font: '10px system-ui',
          size: 40,
          label: '',
        },
      ],
      series: [
        {},
        {
          stroke: theme.series,
          width: 1.5,
          fill: `${theme.series}18`,
        },
      ],
    };

    const chart = new uPlot(opts, data, el);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) chart.setSize({ width: entry.contentRect.width, height: 120 });
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      chart.destroy();
    };
  }, [fn, duration, themeKey]);

  return <div ref={containerRef} className="w-full" />;
}
