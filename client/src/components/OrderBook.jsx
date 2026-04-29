import React, { useMemo } from 'react';
import { fmt$ } from '../utils.js';

export default function OrderBook({ book, lastPrice, onClickLevel }) {
  const bids = book?.bids || [];
  const asks = book?.asks || [];

  const maxSize = useMemo(() => {
    const all = [...bids, ...asks].map((l) => l.size);
    return Math.max(...all, 1);
  }, [bids, asks]);

  const spread = useMemo(() => {
    if (bids.length && asks.length) return Math.round((asks[0].price - bids[0].price) * 100) / 100;
    return null;
  }, [bids, asks]);

  const Row = ({ level, side }) => {
    const pct = Math.round((level.size / maxSize) * 100);
    return (
      <div
        className={`ob-row ob-${side}`}
        onClick={() => onClickLevel?.(level.price, side)}
        title={`Click to ${side === 'bid' ? 'sell at' : 'buy at'} $${level.price.toFixed(2)}`}
      >
        <div
          className="ob-bar"
          style={{ width: `${pct}%`, background: side === 'bid' ? 'rgba(63,185,80,0.12)' : 'rgba(248,81,73,0.12)' }}
        />
        <span className={`ob-price ${side === 'bid' ? 'pos' : 'neg'}`}>{fmt$(level.price)}</span>
        <span className="ob-size">{level.size.toLocaleString()}</span>
      </div>
    );
  };

  return (
    <div className="order-book">
      <div className="ob-header">
        <span>Price</span>
        <span>Size</span>
      </div>

      <div className="ob-asks">
        {[...asks].reverse().map((lvl, i) => <Row key={i} level={lvl} side="ask" />)}
      </div>

      <div className="ob-spread">
        <span className="ob-last-price">{fmt$(lastPrice)}</span>
        {spread != null && <span className="ob-spread-val">spread {fmt$(spread)}</span>}
      </div>

      <div className="ob-bids">
        {bids.map((lvl, i) => <Row key={i} level={lvl} side="bid" />)}
      </div>
    </div>
  );
}
