import React from 'react';
import { sentimentClass, sentimentIcon } from '../utils.js';

export default function NewsFeed({ news, fairValue, fairValueRange }) {
  return (
    <div className="news-feed">
      <div className="nf-title">Market Intelligence</div>

      {(fairValue != null || fairValueRange != null) && (
        <div className="nf-guidance">
          <div className="nf-guidance-label">🏛️ GM Guidance</div>
          {fairValue != null && (
            <div className="nf-guidance-val">Fair Value: <strong>${fairValue.toFixed(2)}</strong></div>
          )}
          {fairValueRange != null && (
            <div className="nf-guidance-val">
              Range: <strong>${fairValueRange.low.toFixed(2)}</strong> – <strong>${fairValueRange.high.toFixed(2)}</strong>
            </div>
          )}
        </div>
      )}

      <div className="nf-items">
        {(!news || news.length === 0) ? (
          <div className="nf-empty">Awaiting market intelligence…</div>
        ) : (
          news.map((item) => (
            <div key={item.id} className={`nf-item ${sentimentClass(item.sentiment)}`}>
              <div className="nf-item-header">
                <span className="nf-icon">{sentimentIcon(item.sentiment)}</span>
                <span className="nf-time">{new Date(item.timestamp).toLocaleTimeString()}</span>
              </div>
              <div className="nf-message">{item.message}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
