import React, { useMemo } from 'react';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import { fmt$ } from '../utils.js';

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="chart-tooltip">
      <div className="ct-price">{fmt$(d.price)}</div>
      {d.volume > 0 && <div className="ct-vol">Vol: {d.volume}</div>}
      <div className="ct-time">{new Date(d.time).toLocaleTimeString()}</div>
    </div>
  );
}

function downsample(history, maxPoints = 200) {
  if (history.length <= maxPoints) return history;
  const step = Math.ceil(history.length / maxPoints);
  const result = [];
  for (let i = 0; i < history.length; i += step) {
    const chunk = history.slice(i, i + step);
    const vol = chunk.reduce((s, p) => s + p.volume, 0);
    result.push({ ...chunk[chunk.length - 1], volume: vol });
  }
  return result;
}

export default function PriceChart({ priceHistory, distribution, quarterEstimates }) {
  const data = useMemo(() => downsample(priceHistory || [], 200), [priceHistory]);

  const prices = data.map(d => d.price).filter(Boolean);
  const minP = prices.length ? Math.min(...prices) : 0;
  const maxP = prices.length ? Math.max(...prices) : 1;
  const pad = Math.max((maxP - minP) * 0.15, 0.05);
  const domain = [Math.max(0, minP - pad), Math.min(1.05, maxP + pad)];

  const volumes = data.map(d => d.volume);
  const maxVol = Math.max(...volumes, 1);

  const mu = distribution?.mu;
  const sigma = distribution?.sigma;
  const lo = sigma && mu ? Math.max(0, mu - 2 * sigma) : null;
  const hi = sigma && mu ? Math.min(1, mu + 2 * sigma) : null;

  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a2436" vertical={false} />
          <XAxis
            dataKey="time"
            tickFormatter={t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            stroke="#374151" tick={{ fill: '#6b7280', fontSize: 10 }}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="price" domain={domain}
            tickFormatter={v => `$${v.toFixed(2)}`}
            stroke="#374151" tick={{ fill: '#6b7280', fontSize: 10 }} width={52}
          />
          <YAxis yAxisId="vol" orientation="right" domain={[0, maxVol * 4]} hide />
          <Tooltip content={<CustomTooltip />} />

          {/* Distribution range */}
          {hi != null && <ReferenceLine yAxisId="price" y={hi} stroke="#854d0e" strokeDasharray="4 3" label={{ value: 'Est. Hi', fill: '#92400e', fontSize: 9, position: 'right' }} />}
          {lo != null && <ReferenceLine yAxisId="price" y={lo} stroke="#854d0e" strokeDasharray="4 3" label={{ value: 'Est. Lo', fill: '#92400e', fontSize: 9, position: 'right' }} />}
          {mu != null && <ReferenceLine yAxisId="price" y={mu} stroke="#f59e0b" strokeDasharray="6 3" label={{ value: 'μ', fill: '#f59e0b', fontSize: 11, position: 'right' }} />}

          {/* Quarter estimates */}
          {(quarterEstimates || []).map((est, i) => (
            <ReferenceLine key={i} yAxisId="price" y={est} stroke="#a371f7" strokeDasharray="3 3"
              label={{ value: `Q${i+1}`, fill: '#a371f7', fontSize: 9, position: 'insideTopLeft' }} />
          ))}

          <Bar yAxisId="vol" dataKey="volume" fill="#1e3a5f" opacity={0.5} radius={[1,1,0,0]} />
          <Line
            yAxisId="price" type="monotone" dataKey="price"
            stroke="#58a6ff" strokeWidth={2} dot={false}
            activeDot={{ r: 4, fill: '#58a6ff' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
