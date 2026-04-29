import React, { useState, useEffect } from 'react';
import { fmt$ } from '../utils.js';

export default function OrderForm({ strikes, lastPrice, onPlaceOrder, prefill }) {
  const [security, setSecurity] = useState('BEAN');
  const [orderType, setOrderType] = useState('LIMIT');
  const [side, setSide] = useState('BUY');
  const [optionType, setOptionType] = useState('CALL');
  const [strike, setStrike] = useState('');
  const [quantity, setQuantity] = useState('100');
  const [price, setPrice] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (prefill) {
      if (prefill.security) setSecurity(prefill.security);
      if (prefill.optionType) setOptionType(prefill.optionType);
      // Strike must match the <option value> format (toFixed(2))
      if (prefill.strike != null) setStrike(parseFloat(prefill.strike).toFixed(2));
      if (prefill.price != null && prefill.price !== '') setPrice(String(prefill.price));
      if (prefill.side) setSide(prefill.side);
      if (prefill.orderType) setOrderType(prefill.orderType);
    }
  }, [prefill]);

  // Auto-fill price when switching to market
  useEffect(() => {
    if (orderType === 'MARKET') setPrice('');
  }, [orderType]);

  const getSecurityKey = () => {
    if (security === 'BEAN') return 'BEAN';
    if (!strike) return null;
    return `${optionType}_${parseFloat(strike).toFixed(2)}`;
  };

  const handleSubmit = () => {
    const secKey = getSecurityKey();
    if (!secKey) return setStatus('Select a strike');
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) return setStatus('Invalid quantity');
    const params = {
      security: secKey,
      type: orderType,
      side,
      quantity: qty,
      price: orderType === 'LIMIT' ? parseFloat(price) : undefined,
    };
    if (orderType === 'LIMIT' && (isNaN(params.price) || params.price < 0.01 || params.price > 0.99)) {
      return setStatus('Limit price must be $0.01 – $0.99');
    }
    setLoading(true);
    setStatus('');
    onPlaceOrder(params, (res) => {
      setLoading(false);
      if (res.success) {
        setStatus(res.filled ? '✓ Order filled' : '✓ Order placed');
        setTimeout(() => setStatus(''), 3000);
        if (res.filled) setQuantity('100');
      } else {
        setStatus(`✗ ${res.error}`);
      }
    });
  };


  return (
    <div className="order-form">
      <div className="of-title">Place Order</div>

      {/* Security selector */}
      <div className="of-security-tabs">
        <button className={`of-sec-btn ${security === 'BEAN' ? 'active' : ''}`} onClick={() => setSecurity('BEAN')}>
          Bean Stock
        </button>
        <button className={`of-sec-btn ${security === 'OPTION' ? 'active' : ''}`} onClick={() => setSecurity('OPTION')}>
          Option
        </button>
      </div>

      {security === 'OPTION' && (
        <div className="of-option-row">
          <div className="of-group">
            <label>Type</label>
            <div className="of-btn-group">
              <button className={`of-tog ${optionType === 'CALL' ? 'active-bull' : ''}`} onClick={() => setOptionType('CALL')}>CALL</button>
              <button className={`of-tog ${optionType === 'PUT' ? 'active-bear' : ''}`} onClick={() => setOptionType('PUT')}>PUT</button>
            </div>
          </div>
          <div className="of-group">
            <label>Strike</label>
            <select value={strike} onChange={(e) => setStrike(e.target.value)} className="of-select">
              <option value="">Select…</option>
              {(strikes || []).map((s) => (
                <option key={s} value={s.toFixed(2)}>${s.toFixed(2)}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Side */}
      <div className="of-group">
        <label>Side</label>
        <div className="of-btn-group">
          <button className={`of-tog ${side === 'BUY' ? 'active-bull' : ''}`} onClick={() => setSide('BUY')}>BUY</button>
          <button className={`of-tog ${side === 'SELL' ? 'active-bear' : ''}`} onClick={() => setSide('SELL')}>SELL</button>
        </div>
      </div>

      {/* Order Type */}
      <div className="of-group">
        <label>Order Type</label>
        <div className="of-btn-group">
          <button className={`of-tog ${orderType === 'LIMIT' ? 'active' : ''}`} onClick={() => setOrderType('LIMIT')}>LIMIT</button>
          <button className={`of-tog ${orderType === 'MARKET' ? 'active' : ''}`} onClick={() => setOrderType('MARKET')}>MARKET</button>
        </div>
      </div>

      {/* Quantity */}
      <div className="of-group">
        <label>Quantity</label>
        <input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          min={1}
          placeholder="100"
        />
      </div>

      {/* Price */}
      {orderType === 'LIMIT' && (
        <div className="of-group">
          <label>Limit Price ($)  {lastPrice && <span className="of-hint">last: {fmt$(lastPrice)}</span>}</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            step="0.01"
            min={0.01}
            max={0.99}
            placeholder="0.00"
          />
        </div>
      )}

      {status && (
        <div className={`of-status ${status.startsWith('✓') ? 'ok' : 'err'}`}>{status}</div>
      )}

      <button
        className={`btn-order ${side === 'BUY' ? 'btn-buy' : 'btn-sell'}`}
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? '…' : `${side} ${security === 'BEAN' ? 'BEAN' : `${optionType} $${strike || '?'}`}`}
      </button>
    </div>
  );
}
