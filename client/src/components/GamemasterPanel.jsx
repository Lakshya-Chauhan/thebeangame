import React, { useState, useEffect } from 'react';
import { fmt$ } from '../utils.js';

const QUARTER_SIGMA_RANGES = [
  { min: 0.10, max: 0.30 },
  { min: 0.06, max: 0.20 },
  { min: 0.03, max: 0.10 },
  { min: 0.01, max: 0.05 },
];
const ENTITIES = ['Government', 'Walmart', 'Amazon', 'China', 'Hedge Fund', 'Consumers', 'EU Commission', 'USDA'];
const DURATIONS = [10, 20, 30];

export default function GamemasterPanel({ gameState, onGmUpdateDist, onGmAnnounceSentiment, onGmEntityOrder, onGmSettle }) {
  const { distribution, quarter, quarterEstimates, sigmaRanges } = gameState || {};
  const { mu = 0.50, sigma = 0.22 } = distribution || {};

  const qIdx = Math.max(0, (quarter || 1) - 1);
  const sigmaRange = (sigmaRanges || QUARTER_SIGMA_RANGES)[qIdx];

  // Slider values as numbers (kept in sync with server state)
  const [muInput,    setMuInput]    = useState(mu);
  const [sigmaInput, setSigmaInput] = useState(sigma);
  const [entity,     setEntity]     = useState('Government');
  const [eoSide,     setEoSide]     = useState('BUY');
  const [eoQty,      setEoQty]      = useState('10000');
  const [eoPrice,    setEoPrice]    = useState('');
  const [eoDuration, setEoDuration] = useState(20);
  const [settlePriceInput, setSettlePriceInput] = useState('');
  const [statuses, setStatuses] = useState({});

  useEffect(() => { setMuInput(mu); }, [mu]);
  useEffect(() => { setSigmaInput(sigma); }, [sigma]);

  const setStatus = (key, msg) => {
    setStatuses(s => ({ ...s, [key]: msg }));
    setTimeout(() => setStatuses(s => ({ ...s, [key]: '' })), 3000);
  };

  const handleUpdateDist = () => {
    const newMu    = parseFloat(muInput);
    const newSigma = parseFloat(sigmaInput);
    if (isNaN(newMu)    || newMu < 0.01 || newMu > 0.99)    return setStatus('dist', '✗ Median must be 0.01–0.99');
    if (isNaN(newSigma) || newSigma < sigmaRange.min || newSigma > sigmaRange.max)
      return setStatus('dist', `✗ σ must be ${sigmaRange.min}–${sigmaRange.max} this quarter`);
    onGmUpdateDist(newMu, newSigma, res => {
      if (res?.success) setStatus('dist', '✓ Updated');
      else setStatus('dist', '✗ Error');
    });
  };

  const handleAnnounceSentiment = () => {
    onGmAnnounceSentiment(res => {
      if (res?.success) setStatus('dist', `✓ Announced ($${res.sample?.toFixed(2)})`);
    });
  };

  const handleEntityOrder = () => {
    const qty   = parseInt(eoQty);
    const price = parseFloat(eoPrice);
    if (isNaN(qty) || qty <= 0)     return setStatus('eo', '✗ Invalid qty');
    if (isNaN(price) || price <= 0) return setStatus('eo', '✗ Invalid price');
    onGmEntityOrder({ entity, side: eoSide, quantity: qty, price, duration: eoDuration }, res => {
      if (res?.success) setStatus('eo', '✓ Flash event launched!');
      else setStatus('eo', `✗ ${res?.error}`);
    });
  };

  const handleSettle = () => {
    const sp = settlePriceInput ? parseFloat(settlePriceInput) : null;
    if (settlePriceInput && (isNaN(sp) || sp < 0)) return setStatus('settle', '✗ Invalid price');
    const msg = sp != null
      ? `Settle at $${sp.toFixed(2)}? This ends the game immediately.`
      : `Settle at a random price sampled from the current distribution (μ=$${mu.toFixed(2)}, σ=${sigma.toFixed(3)})?\nThis ends the game.`;
    if (!window.confirm(msg)) return;
    onGmSettle(sp, res => { if (!res?.success) setStatus('settle', `✗ ${res?.error}`); });
  };

  const qLabel = quarter ? `Q${quarter}` : 'Pre-game';

  // Derived display values
  const muVal    = parseFloat(muInput) || mu;
  const sigmaVal = parseFloat(sigmaInput) || sigma;
  const bandLo   = Math.max(0, muVal - 2 * sigmaVal);
  const bandHi   = Math.min(1, muVal + 2 * sigmaVal);
  const sigmaFillPct = ((sigmaVal - sigmaRange.min) / (sigmaRange.max - sigmaRange.min)) * 100;

  return (
    <div className="gm-panel">
      <div className="gm-panel-title">
        🏛️ Gamemaster Control Room
        <span className="gm-quarter-badge">{qLabel} | σ={sigma.toFixed(3)} | σ range this quarter: {sigmaRange.min}–{sigmaRange.max}</span>
      </div>

      <div className="gm-grid">

        {/* Distribution control */}
        <div className="gm-card">
          <div className="gm-card-title">Consumer Sentiment Distribution</div>

          {/* Mu number-line slider */}
          <div className="dist-nl-section">
            <div className="dist-nl-header">
              <span className="dist-nl-label">Median (μ)</span>
              <span className="dist-nl-mu-val">μ = ${muVal.toFixed(2)}</span>
            </div>
            <div className="dist-nl-wrap">
              <div className="dist-nl-track">
                <div className="dist-nl-band" style={{
                  left:  `${bandLo * 100}%`,
                  width: `${(bandHi - bandLo) * 100}%`,
                }} />
                <div className="dist-nl-mu-marker" style={{ left: `${muVal * 100}%` }} />
                <input
                  type="range"
                  className="dist-nl-slider"
                  min={0.01} max={0.99} step={0.01}
                  value={muVal}
                  onChange={e => setMuInput(parseFloat(e.target.value))}
                />
              </div>
              <div className="dist-nl-tick-row">
                <span>$0.00</span>
                <span>$0.25</span>
                <span>$0.50</span>
                <span>$0.75</span>
                <span>$1.00</span>
              </div>
              <div className="dist-nl-range-hint">95% range: ${bandLo.toFixed(2)} – ${bandHi.toFixed(2)}</div>
            </div>
          </div>

          {/* Sigma slider */}
          <div className="dist-sigma-section">
            <div className="dist-sigma-header">
              <span className="dist-sigma-label">Spread (σ)</span>
              <span className="dist-sigma-val">σ = {sigmaVal.toFixed(3)}</span>
            </div>
            <input
              type="range"
              className="dist-sigma-slider"
              min={sigmaRange.min} max={sigmaRange.max} step={0.005}
              value={sigmaVal}
              onChange={e => setSigmaInput(parseFloat(e.target.value))}
              style={{
                background: `linear-gradient(to right, var(--gold) 0%, var(--gold) ${sigmaFillPct}%, var(--bg3) ${sigmaFillPct}%, var(--bg3) 100%)`,
              }}
            />
            <div className="dist-sigma-bounds">
              <span>min σ: {sigmaRange.min}</span>
              <span>max σ: {sigmaRange.max}</span>
            </div>
          </div>

          {/* Quarter estimates */}
          {quarterEstimates?.length > 0 && (
            <div className="gm-estimates">
              {quarterEstimates.map((e, i) => (
                <span key={i} className="gm-estimate-chip">Q{i+1}: ${e.toFixed(2)}</span>
              ))}
            </div>
          )}

          {/* Quarter sigma forecast */}
          <div className="gm-sigma-forecast">
            {QUARTER_SIGMA_RANGES.map((r, i) => (
              <div key={i} className={`gm-sigma-q ${i + 1 === quarter ? 'active' : ''} ${i + 1 < quarter ? 'past' : ''}`}>
                Q{i+1}<br/><span>σ {r.min}–{r.max}</span>
              </div>
            ))}
          </div>

          <div className="gm-row">
            <button className="gm-btn" onClick={handleUpdateDist}>Update Distribution</button>
            <button className="gm-btn gm-btn-sentiment" onClick={handleAnnounceSentiment}>
              📊 Announce Sentiment
            </button>
            {statuses.dist && <span className="gm-status">{statuses.dist}</span>}
          </div>
        </div>

        {/* Flash entity order */}
        <div className="gm-card">
          <div className="gm-card-title">⚡ Flash Entity Order</div>
          <div className="gm-hint">Emergency order separate from the book — players have seconds to respond</div>
          <div className="gm-inputs-row">
            <div className="gm-input-group">
              <label>Entity</label>
              <select value={entity} onChange={e => setEntity(e.target.value)} className="of-select">
                {ENTITIES.map(en => <option key={en} value={en}>{en}</option>)}
              </select>
            </div>
            <div className="gm-input-group">
              <label>Direction</label>
              <div className="of-btn-group">
                <button className={`of-tog ${eoSide === 'BUY'  ? 'active-bull' : ''}`} onClick={() => setEoSide('BUY')}>BUY</button>
                <button className={`of-tog ${eoSide === 'SELL' ? 'active-bear' : ''}`} onClick={() => setEoSide('SELL')}>SELL</button>
              </div>
            </div>
          </div>
          <div className="gm-inputs-row">
            <div className="gm-input-group">
              <label>Quantity</label>
              <input type="number" value={eoQty} onChange={e => setEoQty(e.target.value)} min={1} />
            </div>
            <div className="gm-input-group">
              <label>Price ($)</label>
              <input type="number" step="0.01" min="0.01" max="0.99"
                value={eoPrice} onChange={e => setEoPrice(e.target.value)} placeholder="0.00" />
            </div>
            <div className="gm-input-group">
              <label>Duration</label>
              <div className="of-btn-group">
                {DURATIONS.map(d => (
                  <button key={d} className={`of-tog ${eoDuration === d ? 'active' : ''}`}
                    onClick={() => setEoDuration(d)}>{d}s</button>
                ))}
              </div>
            </div>
          </div>
          <div className="gm-row">
            <button className={`gm-btn ${eoSide === 'BUY' ? 'gm-btn-bull' : 'gm-btn-bear'}`} onClick={handleEntityOrder}>
              ⚡ Launch Flash Event
            </button>
            {statuses.eo && <span className="gm-status">{statuses.eo}</span>}
          </div>
        </div>

        {/* Settlement */}
        <div className="gm-card gm-card-settle">
          <div className="gm-card-title">⚡ Settle Game</div>
          <div className="gm-hint">
            Leave blank to sample from N(μ={mu.toFixed(2)}, σ={sigma.toFixed(3)}) for the final price.
            Or pin a specific price.
          </div>
          <div className="gm-inputs-row">
            <div className="gm-input-group">
              <label>Override price (optional)</label>
              <input type="number" step="0.01" min="0.01" max="0.99"
                value={settlePriceInput} onChange={e => setSettlePriceInput(e.target.value)}
                placeholder="leave blank = random sample" />
            </div>
          </div>
          <div className="gm-row">
            <button className="gm-btn gm-btn-settle" onClick={handleSettle}>🔔 Settle Now</button>
            {statuses.settle && <span className="gm-status">{statuses.settle}</span>}
          </div>
        </div>

      </div>
    </div>
  );
}
