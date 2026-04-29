import React, { useState, useEffect, useCallback } from 'react';
import { socket } from './socket.js';
import HomeScreen from './components/HomeScreen.jsx';
import LobbyScreen from './components/LobbyScreen.jsx';
import TradingScreen from './components/TradingScreen.jsx';
import SettledScreen from './components/SettledScreen.jsx';

export default function App() {
  const [screen, setScreen] = useState('home');
  const [gameState, setGameState] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [isGM, setIsGM] = useState(false);
  const [myPosition, setMyPosition] = useState({ cash: 0, beanPosition: 0, optionPositions: {}, pnl: 0 });
  const [myOrders, setMyOrders] = useState([]);
  const [settlementData, setSettlementData] = useState(null);
  const [entityOrder, setEntityOrder] = useState(null); // active flash event

  useEffect(() => {
    socket.connect();

    socket.on('game_started', (gs) => { setGameState(gs); setScreen('trading'); });

    socket.on('order_book_update', ({ beanBook, optionBooks }) => {
      setGameState(prev => prev ? { ...prev, beanBook, optionBooks: { ...prev.optionBooks, ...optionBooks } } : prev);
    });

    socket.on('trades', ({ trades, lastPrice, priceHistory }) => {
      setGameState(prev => {
        if (!prev) return prev;
        return { ...prev, lastPrice, priceHistory, recentTrades: [...trades, ...(prev.recentTrades || [])].slice(0, 30) };
      });
    });

    socket.on('price_tick', ({ time, price }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const history = [...(prev.priceHistory || []), { time, price, volume: 0 }].slice(-500);
        return { ...prev, lastPrice: price, priceHistory: history };
      });
    });

    socket.on('leaderboard_update', (players) => {
      setGameState(prev => prev ? { ...prev, players } : prev);
    });

    socket.on('quarter_start', ({ quarter, estimate, newsItem, distribution, quarterEstimates }) => {
      setGameState(prev => prev ? { ...prev, quarter, distribution, quarterEstimates,
        news: [newsItem, ...(prev.news || [])].slice(0, 100) } : prev);
    });

    socket.on('distribution_update', ({ distribution, lo, hi }) => {
      setGameState(prev => prev ? { ...prev, distribution } : prev);
    });

    socket.on('news_item', (item) => {
      setGameState(prev => prev ? { ...prev, news: [item, ...(prev.news || [])].slice(0, 100) } : prev);
    });

    socket.on('player_joined', ({ name, players }) => {
      setGameState(prev => prev ? { ...prev, players } : prev);
    });

    socket.on('position_update', (pos) => setMyPosition(pos));
    socket.on('my_orders_update', (orders) => setMyOrders(orders));

    // Entity order (flash events)
    socket.on('entity_order_start', (eo) => {
      setEntityOrder({ ...eo, accepted: false });
      setGameState(prev => prev ? {
        ...prev,
        news: [eo.newsItem, ...(prev.news || [])].slice(0, 100),
        activeEntityOrder: eo,
      } : prev);
    });

    socket.on('entity_order_update', ({ id, filledQty, remainingQty }) => {
      setEntityOrder(prev => prev?.id === id ? { ...prev, filledQty, remainingQty } : prev);
      setGameState(prev => prev?.activeEntityOrder?.id === id
        ? { ...prev, activeEntityOrder: { ...prev.activeEntityOrder, filledQty } } : prev);
    });

    socket.on('entity_order_end', ({ id, filledQty, totalQty, newsItem, fullyFilled }) => {
      setEntityOrder(null);
      setGameState(prev => {
        if (!prev) return prev;
        const news = newsItem ? [newsItem, ...(prev.news || [])].slice(0, 100) : prev.news;
        return { ...prev, activeEntityOrder: null, news };
      });
    });

    socket.on('game_settled', (data) => {
      setSettlementData(data);
      setGameState(prev => prev ? {
        ...prev, state: 'SETTLED',
        settlementPrice: data.settlementPrice,
        lastPrice: data.settlementPrice,
        priceHistory: data.priceHistory,
      } : prev);
      setScreen('settled');
    });

    return () => {
      ['game_started','order_book_update','trades','price_tick','leaderboard_update',
       'quarter_start','distribution_update','news_item','player_joined',
       'position_update','my_orders_update',
       'entity_order_start','entity_order_update','entity_order_end','game_settled',
      ].forEach(e => socket.off(e));
      socket.disconnect();
    };
  }, []);

  const handleCreated = useCallback(({ code, gameState: gs, playerId: pid }) => {
    setGameState(gs); setPlayerId(pid); setIsGM(true); setScreen('lobby');
  }, []);

  const handleJoined = useCallback(({ gameState: gs, playerId: pid }) => {
    setGameState(gs); setPlayerId(pid); setIsGM(false);
    setScreen(gs.state === 'ACTIVE' ? 'trading' : 'lobby');
  }, []);

  const handleStart        = useCallback(() => socket.emit('start_game', (r) => { if (!r.success) alert(r.error); }), []);
  const placeOrder         = useCallback((p, cb) => socket.emit('place_order', p, cb), []);
  const cancelOrder        = useCallback((id, cb) => socket.emit('cancel_order', { orderId: id }, cb), []);
  const gmUpdateDist       = useCallback((mu, sigma, cb) => socket.emit('gm_update_distribution', { mu, sigma }, cb), []);
  const gmAnnounceSentiment = useCallback((cb) => socket.emit('gm_announce_sentiment', cb), []);
  const gmEntityOrder      = useCallback((p, cb) => socket.emit('gm_entity_order', p, cb), []);
  const gmSettle           = useCallback((price, cb) => socket.emit('gm_settle', { price }, cb), []);
  const acceptEntity   = useCallback((quantity, cb) => {
    socket.emit('accept_entity_order', { quantity }, (res) => {
      if (res.success) setEntityOrder(prev => prev ? { ...prev, accepted: true } : prev);
      cb?.(res);
    });
  }, []);

  if (screen === 'home') return <HomeScreen onCreated={handleCreated} onJoined={handleJoined} />;
  if (screen === 'lobby') return <LobbyScreen gameState={gameState} isGM={isGM} onStart={handleStart} />;

  if (screen === 'settled') {
    return (
      <SettledScreen
        gameState={gameState} settlementData={settlementData}
        playerId={playerId} myPosition={myPosition}
        onHome={() => {
          setScreen('home'); setGameState(null); setPlayerId(null);
          setIsGM(false); setMyPosition({ cash: 0, beanPosition: 0, optionPositions: {}, pnl: 0 });
          setMyOrders([]); setSettlementData(null); setEntityOrder(null);
        }}
      />
    );
  }

  return (
    <TradingScreen
      gameState={gameState} playerId={playerId} isGM={isGM}
      myPosition={myPosition} myPnL={myPosition.pnl}
      myOrders={myOrders} entityOrder={entityOrder}
      onPlaceOrder={placeOrder} onCancelOrder={cancelOrder}
      onAcceptEntity={acceptEntity}
      onGmUpdateDist={gmUpdateDist} onGmAnnounceSentiment={gmAnnounceSentiment}
      onGmEntityOrder={gmEntityOrder} onGmSettle={gmSettle}
    />
  );
}
