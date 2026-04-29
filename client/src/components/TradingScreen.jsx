import React, { useState, useEffect, useCallback } from 'react';
import PriceChart from './PriceChart.jsx';
import OrderBook from './OrderBook.jsx';
import OrderForm from './OrderForm.jsx';
import OptionsChain from './OptionsChain.jsx';
import Leaderboard from './Leaderboard.jsx';
import NewsFeed from './NewsFeed.jsx';
import Positions from './Positions.jsx';
import GamemasterPanel from './GamemasterPanel.jsx';
import EntityOrderFlash from './EntityOrderFlash.jsx';
import { fmt$, fmtPnL, fmtTime, pnlClass } from '../utils.js';

function useCountdown(endTime) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!endTime) return;
    const tick = () => setRemaining(Math.max(0, endTime - Date.now()));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [endTime]);
  return remaining;
}

function QuarterIndicator({ quarter, quarterDuration, startTime }) {
  const total = 4;
  return (
    <div className="quarter-indicator">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`qi-pip ${i + 1 < quarter ? 'qi-done' : i + 1 === quarter ? 'qi-active' : ''}`}>
          Q{i + 1}
        </div>
      ))}
    </div>
  );
}

function DistributionBadge({ distribution }) {
  if (!distribution) return null;
  const { mu, sigma } = distribution;
  const lo = Math.max(0, mu - 2 * sigma).toFixed(2);
  const hi = Math.min(1, mu + 2 * sigma).toFixed(2);
  return (
    <div className="dist-badge" title={`Consumer price distribution: μ=$${mu.toFixed(2)}, σ=${sigma.toFixed(3)}`}>
      <span className="dist-badge-label">Consumer Est.</span>
      <span className="dist-badge-range">${lo}–${hi}</span>
    </div>
  );
}

export default function TradingScreen({
  gameState, playerId, isGM, myPosition, myPnL,
  myOrders, entityOrder,
  onPlaceOrder, onCancelOrder, onAcceptEntity,
  onGmUpdateDist, onGmAnnounceSentiment, onGmEntityOrder, onGmSettle,
}) {
  const [prefill, setPrefill] = useState(null);

  const remaining = useCountdown(gameState?.endTime);

  const handleBookClick = useCallback((price, side) => {
    setPrefill({ security: 'BEAN', orderType: 'LIMIT', side: side === 'bid' ? 'SELL' : 'BUY', price });
  }, []);

  const handleOptionPrefill = useCallback((data) => setPrefill(data), []);

  if (!gameState) return <div className="loading">Loading game…</div>;

  const {
    lastPrice, priceHistory, beanBook, optionBooks,
    strikes, players, news, distribution, quarter, quarterEstimates,
    quarterDuration, startTime, state: gameStateVal,
  } = gameState;

  const priceChange = lastPrice != null && gameState.priceHistory?.length > 1
    ? ((lastPrice - gameState.priceHistory[0].price) / gameState.priceHistory[0].price) * 100
    : 0;

  const timerClass = remaining < 60000 ? 'timer-urgent' : remaining < 300000 ? 'timer-warn' : '';

  return (
    <div className="trading-screen">
      {/* Entity order flash overlay */}
      <EntityOrderFlash entityOrder={entityOrder} isGM={isGM} onAccept={onAcceptEntity} />

      {/* Header */}
      <header className="trading-header">
        <div className="th-left">
          <span className="th-logo">🫘</span>
          <span className="th-title">JACK AND THE BEAN STOCK</span>
          {isGM && <span className="th-gm-badge">GAMEMASTER</span>}
          <QuarterIndicator quarter={quarter} />
        </div>

        <div className="th-center">
          <div className="th-price-block">
            <span className="th-price">{fmt$(lastPrice)}</span>
            <span className={`th-change ${priceChange >= 0 ? 'pos' : 'neg'}`}>
              {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
            </span>
          </div>
          <DistributionBadge distribution={distribution} />
        </div>

        <div className="th-right">
          {!isGM && (
            <div className="th-pnl-block">
              <span className="th-pnl-label">P&amp;L</span>
              <span className={`th-pnl ${pnlClass(myPnL)}`}>{fmtPnL(myPnL)}</span>
            </div>
          )}
          <div className={`th-timer ${timerClass}`}>
            {gameStateVal === 'ACTIVE' ? fmtTime(remaining) : 'SETTLED'}
          </div>
        </div>
      </header>

      {/* Main grid */}
      <div className="trading-grid">
        <div className="tg-left">
          <div className="panel panel-chart">
            <div className="panel-title">Bean Price Chart</div>
            <PriceChart
              priceHistory={priceHistory}
              distribution={distribution}
              quarterEstimates={quarterEstimates}
            />
          </div>
          {!isGM && (
            <div className="panel">
              <Positions
                myPosition={myPosition}
                myOrders={myOrders}
                lastPrice={lastPrice}
                onCancelOrder={onCancelOrder}
              />
            </div>
          )}
          {isGM && (
            <div className="panel panel-recent">
              <div className="panel-title">Recent Trades</div>
              <div className="recent-trades">
                {!(gameState.recentTrades?.length) ? (
                  <div className="rt-empty">No trades yet</div>
                ) : (
                  gameState.recentTrades.slice(0, 15).map(t => (
                    <div key={t.id} className="rt-row">
                      <span className="rt-sec">{t.security === 'BEAN' ? '🫘' : '📋'}</span>
                      <span className="rt-price">{fmt$(t.price)}</span>
                      <span className="rt-qty">×{t.quantity}</span>
                      <span className="rt-time">{new Date(t.timestamp).toLocaleTimeString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="tg-center">
          <div className="panel">
            <div className="panel-title">Bean Order Book</div>
            <OrderBook book={beanBook} lastPrice={lastPrice} onClickLevel={handleBookClick} />
          </div>
          {!isGM && (
            <div className="panel">
              <OrderForm
                strikes={strikes}
                lastPrice={lastPrice}
                onPlaceOrder={onPlaceOrder}
                prefill={prefill}
              />
            </div>
          )}
        </div>

        <div className="tg-right">
          <div className="panel">
            <Leaderboard players={players} playerId={playerId} />
          </div>
          <div className="panel panel-news">
            <NewsFeed news={news} distribution={distribution} quarterEstimates={quarterEstimates} quarter={quarter} />
          </div>
        </div>
      </div>

      {!isGM && (
        <div className="options-strip">
          <OptionsChain
            strikes={strikes}
            optionBooks={optionBooks}
            lastPrice={lastPrice}
            onPrefill={handleOptionPrefill}
          />
        </div>
      )}

      {isGM && (
        <div className="gm-strip">
          <GamemasterPanel
            gameState={gameState}
            onGmUpdateDist={onGmUpdateDist}
            onGmAnnounceSentiment={onGmAnnounceSentiment}
            onGmEntityOrder={onGmEntityOrder}
            onGmSettle={onGmSettle}
          />
        </div>
      )}
    </div>
  );
}
