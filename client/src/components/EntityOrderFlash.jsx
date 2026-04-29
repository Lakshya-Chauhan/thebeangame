import React, { useState, useEffect } from 'react';
import { fmt$ } from '../utils.js';

export default function EntityOrderFlash({ entityOrder, isGM, onAccept }) {
  const [remaining, setRemaining] = useState(0);
  const [qty, setQty] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!entityOrder) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((entityOrder.expiresAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [entityOrder]);

  if (!entityOrder) return null;

  const filledPct = Math.round((entityOrder.filledQty / entityOrder.quantity) * 100);
  const remainingQty = entityOrder.quantity - (entityOrder.filledQty || 0);

  // Entity BUY = entity is buying = players can SELL to them
  // Entity SELL = entity is selling = players can BUY from them
  const playerAction = entityOrder.side === 'BUY' ? 'SELL' : 'BUY';
  const urgencyClass = remaining <= 5 ? 'eo-urgent' : remaining <= 10 ? 'eo-warn' : '';

  const handleAccept = () => {
    const q = Math.max(1, parseInt(qty) || remainingQty);
    if (q <= 0) return;
    onAccept(q, (res) => {
      const filled = res.qty != null && !isNaN(res.qty) ? res.qty : q;
      if (res.success) setStatus(`✓ ${filled} beans ${playerAction === 'SELL' ? 'sold' : 'bought'} at ${fmt$(res.price)}`);
      else setStatus(`✗ ${res.error}`);
    });
  };

  return (
    <div className={`eo-overlay ${urgencyClass}`}>
      <div className="eo-banner">
        <div className="eo-left">
          <span className="eo-flash">⚡ FLASH EVENT</span>
          <span className="eo-entity">{entityOrder.entity}</span>
          <span className={`eo-action ${entityOrder.side === 'BUY' ? 'pos' : 'neg'}`}>
            wants to {entityOrder.side}
          </span>
          <span className="eo-qty">{entityOrder.quantity.toLocaleString()} beans</span>
          <span className="eo-at">at</span>
          <span className="eo-price">{fmt$(entityOrder.price)}</span>
        </div>

        <div className="eo-fill-bar-wrap">
          <div className="eo-fill-bar" style={{ width: `${filledPct}%` }} />
          <span className="eo-fill-label">{filledPct}% filled</span>
        </div>

        <div className={`eo-timer ${urgencyClass}`}>{remaining}s</div>

        {!isGM && !entityOrder.accepted && remaining > 0 && (
          <div className="eo-accept">
            <input
              type="number"
              value={qty}
              onChange={e => setQty(e.target.value)}
              placeholder={`max ${remainingQty}`}
              className="eo-qty-input"
              min={1}
              max={remainingQty}
            />
            <button
              className={`eo-btn ${playerAction === 'BUY' ? 'btn-buy' : 'btn-sell'}`}
              onClick={handleAccept}
            >
              {playerAction} at {fmt$(entityOrder.price)}
            </button>
          </div>
        )}

        {entityOrder.accepted && <div className="eo-done">✓ Accepted</div>}
        {status && <div className="eo-status">{status}</div>}
      </div>
    </div>
  );
}
