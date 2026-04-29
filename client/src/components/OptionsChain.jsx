import React, { useState } from 'react';
import { fmt$ } from '../utils.js';

export default function OptionsChain({ strikes, optionBooks, lastPrice, onPrefill }) {
  const [collapsed, setCollapsed] = useState(false);

  const getBBO = (key) => {
    const book = optionBooks?.[key];
    return {
      bid: book?.bids?.[0]?.price ?? null,
      ask: book?.asks?.[0]?.price ?? null,
    };
  };

  const handleClick = (optionType, strike, side, existingPrice) => {
    onPrefill({
      security: 'OPTION',
      optionType,
      strike,
      // pre-fill price if there's an existing level, otherwise leave blank so user types one
      price: existingPrice != null ? existingPrice : '',
      side,
      orderType: 'LIMIT',
    });
  };

  return (
    <div className="options-chain">
      <div className="oc-header" onClick={() => setCollapsed(c => !c)}>
        <span className="oc-title">Options Chain</span>
        <span className="oc-toggle">{collapsed ? '▶' : '▼'}</span>
        {lastPrice != null && <span className="oc-underlying">BEAN @ {fmt$(lastPrice)}</span>}
        <span className="oc-hint">Click any cell to pre-fill order form</span>
      </div>

      {!collapsed && (
        <div className="oc-table-wrap">
          <table className="oc-table">
            <thead>
              <tr>
                <th colSpan={2} className="oc-calls-header">CALLS</th>
                <th className="oc-strike-header">STRIKE</th>
                <th colSpan={2} className="oc-puts-header">PUTS</th>
              </tr>
              <tr>
                <th>Bid</th>
                <th>Ask</th>
                <th></th>
                <th>Bid</th>
                <th>Ask</th>
              </tr>
            </thead>
            <tbody>
              {(strikes || []).map((strike) => {
                const callKey = `CALL_${strike.toFixed(2)}`;
                const putKey  = `PUT_${strike.toFixed(2)}`;
                const { bid: cBid, ask: cAsk } = getBBO(callKey);
                const { bid: pBid, ask: pAsk } = getBBO(putKey);
                const isATM = lastPrice != null &&
                  strike === (strikes || []).reduce((best, s) =>
                    Math.abs(s - lastPrice) < Math.abs(best - lastPrice) ? s : best, strikes[0]);
                const itmCall = lastPrice != null && strike < lastPrice;
                const itmPut  = lastPrice != null && strike > lastPrice;

                return (
                  <tr key={strike} className={isATM ? 'oc-atm' : ''}>
                    {/* Call Bid — clicking here means player wants to SELL a call (hit the bid) */}
                    <td
                      className={`oc-cell oc-call-cell oc-bid-cell ${itmCall ? 'oc-itm' : ''}`}
                      onClick={() => handleClick('CALL', strike, 'SELL', cBid)}
                    >
                      {cBid != null ? <span className="oc-price-bid">{fmt$(cBid)}</span> : <span className="oc-empty">—</span>}
                    </td>
                    {/* Call Ask — clicking means player wants to BUY a call (lift the ask) */}
                    <td
                      className={`oc-cell oc-call-cell oc-ask-cell ${itmCall ? 'oc-itm' : ''}`}
                      onClick={() => handleClick('CALL', strike, 'BUY', cAsk)}
                    >
                      {cAsk != null ? <span className="oc-price-ask">{fmt$(cAsk)}</span> : <span className="oc-empty">—</span>}
                    </td>

                    <td className={`oc-strike ${isATM ? 'oc-atm-strike' : ''}`}>{fmt$(strike)}</td>

                    {/* Put Bid */}
                    <td
                      className={`oc-cell oc-put-cell oc-bid-cell ${itmPut ? 'oc-itm' : ''}`}
                      onClick={() => handleClick('PUT', strike, 'SELL', pBid)}
                    >
                      {pBid != null ? <span className="oc-price-bid">{fmt$(pBid)}</span> : <span className="oc-empty">—</span>}
                    </td>
                    {/* Put Ask */}
                    <td
                      className={`oc-cell oc-put-cell oc-ask-cell ${itmPut ? 'oc-itm' : ''}`}
                      onClick={() => handleClick('PUT', strike, 'BUY', pAsk)}
                    >
                      {pAsk != null ? <span className="oc-price-ask">{fmt$(pAsk)}</span> : <span className="oc-empty">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="oc-legend">
            <span className="oc-itm-swatch" /> ITM &nbsp;
            <span className="oc-atm-swatch" /> ATM &nbsp;
            Bid = sell · Ask = buy
          </div>
        </div>
      )}
    </div>
  );
}
