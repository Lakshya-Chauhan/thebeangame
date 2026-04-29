import React from 'react';
import { fmtPnL, pnlClass } from '../utils.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Leaderboard({ players, playerId }) {
  const ranked = (players || []).filter((p) => !p.isGM);

  return (
    <div className="leaderboard">
      <div className="lb-title">Leaderboard</div>
      {ranked.length === 0 ? (
        <div className="lb-empty">No players yet</div>
      ) : (
        <ul className="lb-list">
          {ranked.map((p, i) => (
            <li key={p.id} className={`lb-row ${p.id === playerId ? 'lb-me' : ''}`}>
              <span className="lb-rank">{MEDALS[i] ?? `${i + 1}`}</span>
              <span className="lb-name">{p.name}{p.id === playerId ? ' (you)' : ''}</span>
              <span className={`lb-pnl ${pnlClass(p.pnl)}`}>{fmtPnL(p.pnl)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
