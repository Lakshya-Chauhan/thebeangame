import React from 'react';
import { fmt$, fmtPnL, pnlClass } from '../utils.js';

export default function Positions({ myPosition, myOrders, lastPrice, onCancelOrder }) {
  const { cash = 0, beanPosition = 0, optionPositions = {}, pnl = 0 } = myPosition;

  const beanValue = beanPosition * lastPrice;
  const optionEntries = Object.entries(optionPositions).filter(([, v]) => v.qty !== 0);

  return (
    <div className="positions">
      <div className="pos-title">My Positions</div>

      <div className="pos-summary">
        <div className="pos-row">
          <span className="pos-label">Total P&amp;L</span>
          <span className={`pos-val pnl-big ${pnlClass(pnl)}`}>{fmtPnL(pnl)}</span>
        </div>
        <div className="pos-row">
          <span className="pos-label">Cash</span>
          <span className={`pos-val ${pnlClass(cash)}`}>{fmt$(cash)}</span>
        </div>
      </div>

      {beanPosition !== 0 && (
        <div className="pos-section">
          <div className="pos-section-title">Bean Stock</div>
          <div className="pos-holding">
            <span className={`pos-qty ${beanPosition > 0 ? 'pos' : 'neg'}`}>
              {beanPosition > 0 ? '+' : ''}{beanPosition} shares
            </span>
            <span className="pos-val">{fmt$(beanValue)}</span>
          </div>
        </div>
      )}

      {optionEntries.length > 0 && (
        <div className="pos-section">
          <div className="pos-section-title">Options</div>
          {optionEntries.map(([key, info]) => {
            const optVal = info.qty * info.currentValue;
            return (
              <div key={key} className="pos-holding">
                <span className={`pos-qty ${info.qty > 0 ? 'pos' : 'neg'}`}>
                  {info.qty > 0 ? '+' : ''}{info.qty} {info.type} ${info.strike?.toFixed(2)}
                </span>
                <span className={`pos-val ${pnlClass(optVal)}`}>{fmt$(optVal)}</span>
              </div>
            );
          })}
        </div>
      )}

      {myOrders && myOrders.length > 0 && (
        <div className="pos-section">
          <div className="pos-section-title">Open Orders</div>
          {myOrders.map((o) => (
            <div key={o.id} className="pos-order">
              <span className={`pos-order-side ${o.side === 'BUY' ? 'pos' : 'neg'}`}>{o.side}</span>
              <span className="pos-order-detail">
                {o.quantity - o.filledQty} {o.security === 'BEAN' ? 'BEAN' : o.security}
                {o.type === 'LIMIT' ? ` @ ${fmt$(o.price)}` : ' MKT'}
              </span>
              <button className="pos-cancel-btn" onClick={() => onCancelOrder(o.id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {beanPosition === 0 && optionEntries.length === 0 && (!myOrders || myOrders.length === 0) && (
        <div className="pos-empty">No open positions</div>
      )}
    </div>
  );
}
