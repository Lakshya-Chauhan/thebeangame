import React from 'react';

export default function LobbyScreen({ gameState, isGM, onStart }) {
  if (!gameState) return <div className="loading">Loading…</div>;

  const players = (gameState.players || []).filter((p) => !p.isGM);

  return (
    <div className="lobby-screen">
      <div className="lobby-card">
        <div className="lobby-logo">🫘</div>
        <h1 className="lobby-title">JACK AND THE BEAN STOCK</h1>
        <p className="lobby-gm">Gamemaster: {gameState.gamemasterName}</p>

        <div className="lobby-code-box">
          <div className="lobby-code-label">Game Code</div>
          <div className="lobby-code">{gameState.code}</div>
          <div className="lobby-code-hint">Share this with players</div>
        </div>

        <div className="lobby-details">
          <div className="lobby-detail">
            <span className="ld-label">Duration</span>
            <span className="ld-val">{gameState.duration} min</span>
          </div>
          <div className="lobby-detail">
            <span className="ld-label">Starting Price</span>
            <span className="ld-val">${gameState.startingPrice?.toFixed(2)}</span>
          </div>
          <div className="lobby-detail">
            <span className="ld-label">Option Strikes</span>
            <span className="ld-val">{gameState.strikes?.length || 0}</span>
          </div>
        </div>

        <div className="lobby-players">
          <div className="lobby-players-title">Players ({players.length})</div>
          {players.length === 0 ? (
            <div className="lobby-empty">Waiting for players to join…</div>
          ) : (
            <ul className="player-list">
              {players.map((p, i) => (
                <li key={p.id} className="player-item">
                  <span className="player-num">{i + 1}</span>
                  <span className="player-name">{p.name}</span>
                  <span className="player-ready">✓</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {isGM ? (
          <button
            className="btn-primary btn-start"
            onClick={onStart}
            disabled={players.length === 0}
          >
            {players.length === 0 ? 'Waiting for players…' : `Start Game (${players.length} player${players.length !== 1 ? 's' : ''})`}
          </button>
        ) : (
          <div className="lobby-waiting">
            <div className="waiting-dot" />
            <div className="waiting-dot" />
            <div className="waiting-dot" />
            <span>Waiting for the Gamemaster to start…</span>
          </div>
        )}
      </div>
    </div>
  );
}
