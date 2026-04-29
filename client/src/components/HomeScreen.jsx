import React, { useState } from 'react';
import { socket } from '../socket.js';

export default function HomeScreen({ onCreated, onJoined }) {
  const [tab, setTab] = useState('join'); // join | create
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [duration, setDuration] = useState(32);
  const [initialMu, setInitialMu] = useState(0.50);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = () => {
    if (!name.trim()) return setError('Enter your name');
    if (!code.trim()) return setError('Enter a game code');
    setLoading(true);
    setError('');
    socket.emit('join_game', { name: name.trim(), code: code.trim() }, (res) => {
      setLoading(false);
      if (!res.success) return setError(res.error || 'Failed to join');
      onJoined({ gameState: res.gameState, playerId: res.playerId });
    });
  };

  const handleCreate = () => {
    if (!name.trim()) return setError('Enter your name');
    if (!duration || duration < 8) return setError('Minimum 8 minutes (2 per quarter)');
    if (initialMu < 0.01 || initialMu > 0.99) return setError('Initial median must be between $0.01 and $0.99');
    setLoading(true);
    setError('');
    socket.emit('create_game', { name: name.trim(), duration, initialMu }, (res) => {
      setLoading(false);
      if (!res.success) return setError(res.error || 'Failed to create game');
      onCreated({ code: res.code, gameState: res.gameState, playerId: res.playerId });
    });
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') tab === 'join' ? handleJoin() : handleCreate();
  };

  return (
    <div className="home-screen">
      <div className="home-hero">
        <div className="home-logo">🫘</div>
        <h1 className="home-title">JACK AND THE BEAN STOCK</h1>
        <p className="home-subtitle">Trade beans. Beat the market. Win glory.</p>
      </div>

      <div className="home-card">
        <div className="tab-bar">
          <button className={`tab-btn ${tab === 'join' ? 'active' : ''}`} onClick={() => { setTab('join'); setError(''); }}>
            Join Game
          </button>
          <button className={`tab-btn ${tab === 'create' ? 'active' : ''}`} onClick={() => { setTab('create'); setError(''); }}>
            Create Game (GM)
          </button>
        </div>

        <div className="home-form">
          <div className="form-group">
            <label>Your Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKey}
              placeholder={tab === 'create' ? 'Gamemaster name' : 'Player name'}
              autoFocus
              maxLength={24}
            />
          </div>

          {tab === 'join' && (
            <div className="form-group">
              <label>Game Code</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={handleKey}
                placeholder="e.g. BEAN42"
                maxLength={6}
                className="code-input"
              />
            </div>
          )}

          {tab === 'create' && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>Duration (minutes)</label>
                  <input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value) || 30)}
                    min={5}
                    max={180}
                  />
                </div>
                <div className="form-group">
                  <label>Initial Consumer Median ($0.01–$0.99)</label>
                  <input
                    type="number"
                    value={initialMu}
                    onChange={(e) => setInitialMu(parseFloat(e.target.value) || 0.50)}
                    min={0.01} max={0.99} step={0.01}
                  />
                </div>
              </div>
              <div className="create-info">
                <span>🏛️ As Gamemaster, you set consumer sentiment (a normal distribution) and reveal its median over 4 quarters. Players trade beans $0–$1.</span>
              </div>
            </>
          )}

          {error && <div className="form-error">{error}</div>}

          <button
            className="btn-primary"
            onClick={tab === 'join' ? handleJoin : handleCreate}
            disabled={loading}
          >
            {loading ? '...' : tab === 'join' ? 'Join Game' : 'Create Game'}
          </button>
        </div>
      </div>

      <div className="home-rules">
        <div className="rule"><span>📊</span><span>Trade bean shares and options on margin</span></div>
        <div className="rule"><span>🏛️</span><span>The GM releases information like a central bank chair</span></div>
        <div className="rule"><span>💰</span><span>Highest P&amp;L at settlement wins</span></div>
      </div>
    </div>
  );
}
