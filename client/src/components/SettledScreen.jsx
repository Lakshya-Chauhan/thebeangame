import React, { useState, useEffect } from 'react';
import { fmt$, fmtPnL, pnlClass } from '../utils.js';
import PriceChart from './PriceChart.jsx';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function SettledScreen({ gameState, settlementData, playerId, myPosition, onHome }) {
  const [phase, setPhase] = useState('suspense');

  useEffect(() => {
    const t = setTimeout(() => setPhase('reveal'), 3000);
    return () => clearTimeout(t);
  }, []);

  const results = settlementData?.results || gameState?.players?.filter((p) => !p.isGM) || [];
  const settlementPrice = gameState?.settlementPrice;
  const winner = results[0];
  const myResult = results.find((p) => p.id === playerId);

  // Recompute P&L from components so the breakdown sums to total
  let computedTotal = myPosition?.pnl ?? null;
  if (myPosition && settlementPrice != null) {
    const optEntries = Object.entries(myPosition.optionPositions || {}).filter(([, v]) => v.qty !== 0);
    const optTotal = optEntries.reduce((sum, [, info]) => {
      const payoff = info.type === 'CALL'
        ? Math.max(0, settlementPrice - info.strike)
        : Math.max(0, info.strike - settlementPrice);
      return sum + info.qty * payoff;
    }, 0);
    computedTotal = Math.round(((myPosition.cash || 0) + myPosition.beanPosition * settlementPrice + optTotal) * 100) / 100;
  }

  if (phase === 'suspense') {
    return (
      <div className="settled-screen">
        <div className="settled-suspense">
          <div className="suspense-bean">🫘</div>
          <h1 className="suspense-title">The final bean price is…</h1>
          <div className="suspense-dots">
            <span /><span /><span />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="settled-screen">
      <div className="settled-hero">
        <div className="settled-logo">🫘</div>
        <h1 className="settled-title">Game Over</h1>
        <div className="settled-price">
          Beans settled at{' '}
          <span className="sp-price reveal-price-anim">{fmt$(settlementPrice)}</span>
        </div>
        {winner && (
          <div className="settled-winner">
            🥇 Winner: <strong>{winner.name}</strong> with {fmtPnL(winner.pnl)}
          </div>
        )}
        {myResult && (
          <div className={`settled-mypnl ${pnlClass(myResult.pnl)}`}>
            Your final P&amp;L: {fmtPnL(myResult.pnl)}
          </div>
        )}
      </div>

      <div className="settled-body">
        <div className="settled-left">
          <div className="panel">
            <div className="panel-title">Final Standings</div>
            <ul className="settled-lb">
              {results.map((p, i) => (
                <li key={p.id} className={`settled-lb-row ${p.id === playerId ? 'lb-me' : ''}`}>
                  <span className="settled-rank">{MEDALS[i] ?? `${i + 1}`}</span>
                  <span className="settled-name">{p.name}{p.id === playerId ? ' (you)' : ''}</span>
                  <span className={`settled-pnl ${pnlClass(p.pnl)}`}>{fmtPnL(p.pnl)}</span>
                </li>
              ))}
            </ul>
          </div>

          {myPosition && (
            <div className="panel">
              <div className="panel-title">Your Final Position</div>
              <div className="settled-positions">
                <div className="sp-row">
                  <span>Cash</span>
                  <span className={pnlClass(myPosition.cash)}>{fmt$(myPosition.cash)}</span>
                </div>
                {myPosition.beanPosition !== 0 && (
                  <div className="sp-row">
                    <span>Bean ({myPosition.beanPosition > 0 ? '+' : ''}{myPosition.beanPosition} @ {fmt$(settlementPrice)})</span>
                    <span className={pnlClass(myPosition.beanPosition * settlementPrice)}>
                      {fmt$(myPosition.beanPosition * settlementPrice)}
                    </span>
                  </div>
                )}
                {Object.entries(myPosition.optionPositions || {}).filter(([, v]) => v.qty !== 0).map(([key, info]) => {
                  const payoff = info.type === 'CALL'
                    ? Math.max(0, settlementPrice - info.strike)
                    : Math.max(0, info.strike - settlementPrice);
                  const val = info.qty * payoff;
                  return (
                    <div key={key} className="sp-row">
                      <span>{info.qty > 0 ? '+' : ''}{info.qty} {info.type} ${info.strike?.toFixed(2)} (payoff {fmt$(payoff)})</span>
                      <span className={pnlClass(val)}>{fmt$(val)}</span>
                    </div>
                  );
                })}
                <div className="sp-row sp-total">
                  <span>Total P&amp;L</span>
                  <span className={pnlClass(computedTotal)}>{fmtPnL(computedTotal)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="settled-right">
          <div className="panel panel-chart-settled">
            <div className="panel-title">Price History</div>
            <PriceChart
              priceHistory={gameState?.priceHistory || []}
              fairValue={gameState?.fairValue}
              fairValueRange={gameState?.fairValueRange}
            />
          </div>
        </div>
      </div>

      <button className="btn-primary settled-home-btn" onClick={onHome}>
        Back to Home
      </button>
    </div>
  );
}
