const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use(express.json());
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/dist')));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'client/dist/index.html')));
}

// ── Constants ─────────────────────────────────────────────────────────────────
const QUARTER_SIGMAS = [0.22, 0.14, 0.07, 0.025]; // Q1→Q4 defaults
// Per-quarter [min, max] sigma the GM is allowed to set
const QUARTER_SIGMA_RANGES = [
  { min: 0.10, max: 0.30 }, // Q1
  { min: 0.06, max: 0.20 }, // Q2
  { min: 0.03, max: 0.10 }, // Q3
  { min: 0.01, max: 0.05 }, // Q4
];
const STRIKES = [0.05,0.10,0.15,0.20,0.25,0.30,0.35,0.40,0.45,0.50,0.55,0.60,0.65,0.70,0.75,0.80,0.85,0.90,0.95];

const games = new Map();
const socketToGame = new Map();

// ── Math helpers ──────────────────────────────────────────────────────────────
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Box-Muller normal sample clamped to [0.01, 0.99]
function sampleNormal(mu, sigma) {
  const u1 = Math.random(), u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
  return Math.round(Math.min(0.99, Math.max(0.01, mu + sigma * z)) * 100) / 100;
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function r2(v) { return Math.round(v * 100) / 100; }

// ── Game factory ──────────────────────────────────────────────────────────────
function createGame({ gamemasterId, gamemasterName, duration, initialMu }) {
  let code;
  do { code = generateCode(); } while (games.has(code));

  const optionBooks = new Map();
  for (const s of STRIKES) {
    optionBooks.set(`CALL_${s.toFixed(2)}`, { bids: [], asks: [] });
    optionBooks.set(`PUT_${s.toFixed(2)}`,  { bids: [], asks: [] });
  }

  const mu = clamp(r2(initialMu || 0.50), 0.05, 0.95);

  const game = {
    id: uuidv4(), code,
    state: 'LOBBY',
    gamemasterId, gamemasterName,
    duration,
    startTime: null, endTime: null,
    settlementPrice: null,
    distribution: { mu, sigma: QUARTER_SIGMAS[0] },
    quarter: 0,
    quarterEstimates: [],
    quarterDuration: 0,
    players: new Map(),
    news: [],
    priceHistory: [],
    lastPrice: null,
    fairValue: null, fairValueRange: null,
    beanBook: { bids: [], asks: [] },
    optionBooks,
    trades: [],
    strikes: STRIKES,
    activeEntityOrder: null,
  };

  games.set(code, game);
  return game;
}

function createPlayer(name, socketId, isGM) {
  return { id: uuidv4(), name, socketId, isGM, cash: 0, beanPosition: 0, optionPositions: new Map(), orders: new Map() };
}

games._store = games; // just for clarity

// ── Order matching ────────────────────────────────────────────────────────────
function matchOrder(game, incoming, book) {
  const trades = [];
  const opposite = incoming.side === 'BUY' ? book.asks : book.bids;

  while (incoming.filledQty < incoming.quantity && opposite.length > 0) {
    const passive = opposite[0];
    if (incoming.type === 'LIMIT') {
      if (incoming.side === 'BUY'  && passive.price > incoming.price) break;
      if (incoming.side === 'SELL' && passive.price < incoming.price) break;
    }
    const fillQty = Math.min(incoming.quantity - incoming.filledQty, passive.quantity - passive.filledQty);
    const trade = {
      id: uuidv4(), security: incoming.security,
      buyOrderId:  incoming.side === 'BUY'  ? incoming.id : passive.id,
      sellOrderId: incoming.side === 'SELL' ? incoming.id : passive.id,
      buyerId:  incoming.side === 'BUY'  ? incoming.playerId : passive.playerId,
      sellerId: incoming.side === 'SELL' ? incoming.playerId : passive.playerId,
      price: passive.price, quantity: fillQty, timestamp: Date.now(),
    };
    trades.push(trade);
    incoming.filledQty += fillQty;
    passive.filledQty  += fillQty;
    if (passive.filledQty >= passive.quantity) { passive.status = 'FILLED'; opposite.shift(); }
    else passive.status = 'PARTIAL';
    applyTrade(game, trade);
  }

  if (incoming.filledQty >= incoming.quantity) incoming.status = 'FILLED';
  else if (incoming.filledQty > 0) incoming.status = 'PARTIAL';

  if (incoming.type === 'LIMIT' && incoming.filledQty < incoming.quantity) {
    const list = incoming.side === 'BUY' ? book.bids : book.asks;
    list.push(incoming);
    if (incoming.side === 'BUY') list.sort((a,b) => b.price - a.price || a.timestamp - b.timestamp);
    else                         list.sort((a,b) => a.price - b.price || a.timestamp - b.timestamp);
  }
  return trades;
}

function applyTrade(game, trade) {
  const buyer  = findById(game, trade.buyerId);
  const seller = findById(game, trade.sellerId);
  const cost = r2(trade.price * trade.quantity);

  if (buyer) {
    buyer.cash = r2(buyer.cash - cost);
    if (trade.security === 'BEAN') buyer.beanPosition += trade.quantity;
    else { const p = buyer.optionPositions.get(trade.security) || 0; buyer.optionPositions.set(trade.security, p + trade.quantity); }
  }
  if (seller) {
    seller.cash = r2(seller.cash + cost);
    if (trade.security === 'BEAN') seller.beanPosition -= trade.quantity;
    else { const p = seller.optionPositions.get(trade.security) || 0; seller.optionPositions.set(trade.security, p - trade.quantity); }
  }

  if (trade.security === 'BEAN') {
    game.lastPrice = trade.price;
    game.priceHistory.push({ time: trade.timestamp, price: trade.price, volume: trade.quantity });
    if (game.priceHistory.length > 2000) game.priceHistory = game.priceHistory.slice(-2000);
  }
  game.trades.push(trade);
  if (game.trades.length > 2000) game.trades = game.trades.slice(-2000);
}

function findById(game, id) {
  for (const p of game.players.values()) if (p.id === id) return p;
  return null;
}

// ── PnL ───────────────────────────────────────────────────────────────────────
function optionPayoff(key, price) {
  const idx = key.indexOf('_');
  const type = key.slice(0, idx);
  const strike = parseFloat(key.slice(idx + 1));
  return type === 'CALL' ? Math.max(0, price - strike) : Math.max(0, strike - price);
}

function getPlayerPnL(player, game) {
  const price = game.state === 'SETTLED' ? game.settlementPrice : game.lastPrice;
  if (price == null) return r2(player.cash);
  let total = player.cash + player.beanPosition * price;
  for (const [key, qty] of player.optionPositions) {
    if (qty !== 0) total += qty * optionPayoff(key, price);
  }
  return r2(total);
}

// ── Serialization ─────────────────────────────────────────────────────────────
function serializeBook(book, depth = 12) {
  const agg = (orders) => {
    const m = new Map();
    for (const o of orders) {
      const rem = o.quantity - o.filledQty;
      if (rem > 0) m.set(o.price, (m.get(o.price) || 0) + rem);
    }
    return [...m.entries()].map(([price, size]) => ({ price, size }));
  };
  return {
    bids: agg(book.bids).sort((a,b) => b.price - a.price).slice(0, depth),
    asks: agg(book.asks).sort((a,b) => a.price - b.price).slice(0, depth),
  };
}

function serializeGame(game) {
  const players = [];
  for (const p of game.players.values()) {
    players.push({ id: p.id, name: p.name, isGM: p.isGM, pnl: getPlayerPnL(p, game) });
  }
  players.sort((a,b) => b.pnl - a.pnl);

  const optionBooks = {};
  for (const [key, book] of game.optionBooks) {
    const s = serializeBook(book, 5);
    if (s.bids.length || s.asks.length) optionBooks[key] = s;
  }

  return {
    id: game.id, code: game.code, state: game.state,
    gamemasterName: game.gamemasterName,
    duration: game.duration, startTime: game.startTime, endTime: game.endTime,
    settlementPrice: game.settlementPrice,
    lastPrice: game.lastPrice,
    distribution: game.distribution,
    quarter: game.quarter,
    quarterEstimates: game.quarterEstimates,
    quarterDuration: game.quarterDuration,
    fairValue: game.fairValue, fairValueRange: game.fairValueRange,
    players,
    news: game.news.slice(-100),
    priceHistory: game.priceHistory.slice(-500),
    beanBook: serializeBook(game.beanBook),
    optionBooks,
    strikes: game.strikes,
    recentTrades: game.trades.slice(-30).reverse(),
    sigmaRanges: QUARTER_SIGMA_RANGES,
    activeEntityOrder: game.activeEntityOrder ? {
      id: game.activeEntityOrder.id,
      entity: game.activeEntityOrder.entity,
      side: game.activeEntityOrder.side,
      quantity: game.activeEntityOrder.quantity,
      price: game.activeEntityOrder.price,
      filledQty: game.activeEntityOrder.filledQty,
      expiresAt: game.activeEntityOrder.expiresAt,
    } : null,
  };
}

function serializeMyPosition(player, game) {
  const optPos = {};
  for (const [key, qty] of player.optionPositions) {
    if (qty !== 0) {
      const idx = key.indexOf('_');
      const price = game.state === 'SETTLED' ? game.settlementPrice : game.lastPrice;
      optPos[key] = { qty, type: key.slice(0, idx), strike: parseFloat(key.slice(idx + 1)), currentValue: price != null ? optionPayoff(key, price) : 0 };
    }
  }
  return { cash: player.cash, beanPosition: player.beanPosition, optionPositions: optPos, pnl: getPlayerPnL(player, game) };
}

// ── Quarter management ────────────────────────────────────────────────────────
function startQuarter(game, quarter) {
  game.quarter = quarter;
  game.distribution.sigma = QUARTER_SIGMAS[quarter - 1];

  const estimate = sampleNormal(game.distribution.mu, game.distribution.sigma);
  game.quarterEstimates[quarter - 1] = estimate;

  const sigmaLabel = ['Very High', 'High', 'Moderate', 'Low'][quarter - 1];
  const lo = r2(clamp(game.distribution.mu - 2 * game.distribution.sigma, 0.01, 0.99));
  const hi = r2(clamp(game.distribution.mu + 2 * game.distribution.sigma, 0.01, 0.99));

  const newsItem = {
    id: uuidv4(),
    message: `📣 QUARTER ${quarter} — Estimated consumer price: $${estimate.toFixed(2)}  |  95% range: $${lo.toFixed(2)}–$${hi.toFixed(2)}  |  Uncertainty: ${sigmaLabel}`,
    sentiment: 'ANNOUNCEMENT',
    timestamp: Date.now(),
  };
  game.news.push(newsItem);

  io.to(game.code).emit('quarter_start', {
    quarter, estimate, newsItem,
    distribution: game.distribution,
    quarterEstimates: game.quarterEstimates,
  });
}

function scheduleQuarters(game) {
  const qDur = game.quarterDuration;
  // Q1 fires immediately (called from start_game)
  // Q2, Q3, Q4 scheduled
  for (let q = 2; q <= 4; q++) {
    const delay = qDur * (q - 1);
    setTimeout(() => { if (game.state === 'ACTIVE') startQuarter(game, q); }, delay);
  }
}

// ── Settlement ────────────────────────────────────────────────────────────────
function settleGame(game, overridePrice) {
  game.state = 'SETTLED';
  // Final price: sample from final distribution (unless GM overrides)
  const price = overridePrice != null
    ? r2(clamp(overridePrice, 0.01, 0.99))
    : sampleNormal(game.distribution.mu, game.distribution.sigma);
  game.settlementPrice = price;
  game.lastPrice = price;
  game.priceHistory.push({ time: Date.now(), price, volume: 0 });

  const results = [];
  for (const p of game.players.values()) {
    if (p.isGM) continue;
    results.push({ id: p.id, name: p.name, pnl: getPlayerPnL(p, game) });
  }
  results.sort((a,b) => b.pnl - a.pnl);

  const newsItem = {
    id: uuidv4(),
    message: `🔔 FINAL SETTLEMENT: Consumers paid $${price.toFixed(2)} for beans. Trading halted.`,
    sentiment: 'ANNOUNCEMENT', timestamp: Date.now(),
  };
  game.news.push(newsItem);

  io.to(game.code).emit('game_settled', {
    settlementPrice: price, results, newsItem, priceHistory: game.priceHistory,
  });

  // Push final position state to every player so client has correct settled P&L
  for (const p of game.players.values()) {
    if (!p.isGM) sendPosition(game, p);
  }
}

// ── Broadcast helpers ─────────────────────────────────────────────────────────
function broadcastBooks(game) {
  const optionBooks = {};
  for (const [key, book] of game.optionBooks) {
    const s = serializeBook(book, 5);
    if (s.bids.length || s.asks.length) optionBooks[key] = s;
  }
  io.to(game.code).emit('order_book_update', { beanBook: serializeBook(game.beanBook), optionBooks });
}

function broadcastLeaderboard(game) {
  const lb = [];
  for (const p of game.players.values()) {
    if (!p.isGM) lb.push({ id: p.id, name: p.name, pnl: getPlayerPnL(p, game) });
  }
  lb.sort((a,b) => b.pnl - a.pnl);
  io.to(game.code).emit('leaderboard_update', lb);
}

function sendPosition(game, player) {
  const sock = io.sockets.sockets.get(player.socketId);
  if (sock) sock.emit('position_update', serializeMyPosition(player, game));
}

function getMarketMid(game) {
  const { bids, asks } = game.beanBook;
  const bestBid = bids.find(o => o.quantity - o.filledQty > 0);
  const bestAsk = asks.find(o => o.quantity - o.filledQty > 0);
  if (bestBid && bestAsk) return r2((bestBid.price + bestAsk.price) / 2);
  if (bestBid) return bestBid.price;
  if (bestAsk) return bestAsk.price;
  return game.lastPrice;
}

// ── Periodic ticks ────────────────────────────────────────────────────────────
setInterval(() => {
  for (const game of games.values()) {
    if (game.state !== 'ACTIVE') continue;

    const mid = getMarketMid(game);
    if (mid == null) continue;

    game.priceHistory.push({ time: Date.now(), price: mid, volume: 0 });
    if (game.priceHistory.length > 2000) game.priceHistory = game.priceHistory.slice(-2000);

    io.to(game.code).emit('price_tick', { time: Date.now(), price: mid });

    broadcastLeaderboard(game);
  }
}, 3000);

// ── Socket handlers ───────────────────────────────────────────────────────────
io.on('connection', (socket) => {

  socket.on('create_game', ({ name, duration, initialMu }, cb) => {
    const game = createGame({
      gamemasterId: socket.id,
      gamemasterName: name || 'Gamemaster',
      duration: Math.max(8, Math.min(180, parseInt(duration) || 32)),
      initialMu: parseFloat(initialMu) || 0.50,
    });
    const player = createPlayer(name || 'Gamemaster', socket.id, true);
    game.players.set(socket.id, player);
    socketToGame.set(socket.id, { gameCode: game.code, playerId: player.id });
    socket.join(game.code);
    console.log(`[CREATE] code=${game.code} games.size=${games.size} stored=${games.has(game.code)}`);
    cb({ success: true, code: game.code, gameState: serializeGame(game), playerId: player.id, isGM: true });
  });

  socket.on('join_game', ({ name, code }, cb) => {
    const normalized = (code || '').toUpperCase().trim();
    console.log(`[JOIN]  requested="${code}" normalized="${normalized}" games.size=${games.size} keys=[${[...games.keys()].join(',')}]`);
    const game = games.get(normalized);
    if (!game) return cb({ success: false, error: 'Game not found. Check the code.' });
    if (game.state === 'SETTLED') return cb({ success: false, error: 'This game has already ended.' });

    const player = createPlayer(name || 'Anonymous', socket.id, false);
    game.players.set(socket.id, player);
    socketToGame.set(socket.id, { gameCode: game.code, playerId: player.id });
    socket.join(game.code);

    io.to(game.code).emit('player_joined', { name: player.name, players: serializeGame(game).players });
    cb({ success: true, gameState: serializeGame(game), playerId: player.id, isGM: false });
  });

  socket.on('start_game', (cb) => {
    const info = socketToGame.get(socket.id);
    if (!info) return cb?.({ success: false });
    const game = games.get(info.gameCode);
    if (!game || game.gamemasterId !== socket.id) return cb?.({ success: false });
    if (game.state !== 'LOBBY') return cb?.({ success: false, error: 'Already started' });

    game.state = 'ACTIVE';
    game.startTime = Date.now();
    game.endTime = game.startTime + game.duration * 60 * 1000;
    game.quarterDuration = (game.endTime - game.startTime) / 4;

    // Grace period auto-settle
    setTimeout(() => { if (game.state === 'ACTIVE') settleGame(game); }, game.duration * 60 * 1000 + 30000);

    io.to(game.code).emit('game_started', serializeGame(game));

    // Start Q1 immediately, schedule Q2-Q4
    startQuarter(game, 1);
    scheduleQuarters(game);

    cb?.({ success: true });
  });

  socket.on('place_order', ({ security, type, side, quantity, price: limitPrice }, cb) => {
    const info = socketToGame.get(socket.id);
    if (!info) return cb?.({ success: false, error: 'Not in a game' });
    const game = games.get(info.gameCode);
    if (!game || game.state !== 'ACTIVE') return cb?.({ success: false, error: 'Game not active' });
    const player = game.players.get(socket.id);
    if (!player || player.isGM) return cb?.({ success: false, error: 'GMs cannot trade' });

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0 || qty > 100000) return cb?.({ success: false, error: 'Invalid quantity (1–100000)' });

    const orderType = (type || '').toUpperCase();
    const orderSide = (side || '').toUpperCase();
    if (!['MARKET','LIMIT'].includes(orderType)) return cb?.({ success: false, error: 'Invalid order type' });
    if (!['BUY','SELL'].includes(orderSide))     return cb?.({ success: false, error: 'Invalid side' });

    let lp = null;
    if (orderType === 'LIMIT') {
      lp = r2(parseFloat(limitPrice));
      if (isNaN(lp) || lp < 0.01 || lp > 0.99) return cb?.({ success: false, error: 'Limit price must be between $0.01 and $0.99' });
    }

    let book;
    if (security === 'BEAN') book = game.beanBook;
    else { book = game.optionBooks.get(security); if (!book) return cb?.({ success: false, error: 'Unknown security' }); }

    if (orderType === 'MARKET' && (orderSide === 'BUY' ? book.asks : book.bids).length === 0)
      return cb?.({ success: false, error: 'No liquidity for market order' });

    const order = {
      id: uuidv4(), playerId: player.id, playerName: player.name,
      security, type: orderType, side: orderSide,
      quantity: qty, price: lp, filledQty: 0, status: 'OPEN', timestamp: Date.now(),
    };
    player.orders.set(order.id, order);

    const newTrades = matchOrder(game, order, book);

    if (newTrades.length > 0) {
      io.to(game.code).emit('trades', { trades: newTrades, lastPrice: game.lastPrice, priceHistory: game.priceHistory.slice(-200) });
      const seen = new Set();
      for (const t of newTrades) {
        if (!seen.has(t.buyerId))  { seen.add(t.buyerId);  const p = findById(game, t.buyerId);  if (p) sendPosition(game, p); }
        if (!seen.has(t.sellerId)) { seen.add(t.sellerId); const p = findById(game, t.sellerId); if (p) sendPosition(game, p); }
      }
      broadcastLeaderboard(game);
    }
    broadcastBooks(game);

    const myOrders = [...player.orders.values()].filter(o => o.status === 'OPEN' || o.status === 'PARTIAL');
    socket.emit('my_orders_update', myOrders);

    cb?.({ success: true, orderId: order.id, filled: newTrades.length > 0 });
  });

  socket.on('cancel_order', ({ orderId }, cb) => {
    const info = socketToGame.get(socket.id);
    if (!info) return cb?.({ success: false });
    const game = games.get(info.gameCode);
    const player = game?.players.get(socket.id);
    if (!player) return cb?.({ success: false });

    let removed = false;
    const tryRemove = (book) => {
      for (const side of ['bids','asks']) {
        const idx = book[side].findIndex(o => o.id === orderId && o.playerId === player.id);
        if (idx !== -1) { book[side].splice(idx, 1); removed = true; }
      }
    };
    tryRemove(game.beanBook);
    for (const book of game.optionBooks.values()) tryRemove(book);

    if (removed) {
      const o = player.orders.get(orderId); if (o) o.status = 'CANCELLED';
      broadcastBooks(game);
      const myOrders = [...player.orders.values()].filter(o => o.status === 'OPEN' || o.status === 'PARTIAL');
      socket.emit('my_orders_update', myOrders);
    }
    cb?.({ success: removed });
  });

  // ── Entity order (flash event) ────────────────────────────────────────────
  socket.on('gm_entity_order', ({ entity, side, quantity, price, duration }, cb) => {
    const info = socketToGame.get(socket.id);
    if (!info) return cb?.({ success: false });
    const game = games.get(info.gameCode);
    if (!game || game.gamemasterId !== socket.id || game.state !== 'ACTIVE')
      return cb?.({ success: false, error: 'Cannot trigger now' });
    if (game.activeEntityOrder) return cb?.({ success: false, error: 'An entity order is already active' });

    const qty = parseInt(quantity);
    const pr  = r2(parseFloat(price));
    const dur = [10, 20, 30].includes(parseInt(duration)) ? parseInt(duration) : 20;
    if (isNaN(qty) || qty <= 0 || isNaN(pr) || pr < 0.01 || pr > 0.99) return cb?.({ success: false, error: 'Price must be between $0.01 and $0.99' });

    const eo = {
      id: uuidv4(),
      entity: String(entity).substring(0, 40),
      side: side.toUpperCase(), // entity's side: BUY means entity buys, players can SELL to them
      quantity: qty, price: pr,
      filledQty: 0,
      duration: dur,
      expiresAt: Date.now() + dur * 1000,
      acceptedBy: new Map(), // playerId -> qty
    };
    game.activeEntityOrder = eo;

    const newsItem = {
      id: uuidv4(),
      message: `⚡ FLASH EVENT: ${eo.entity} wants to ${eo.side} ${qty.toLocaleString()} beans at $${pr.toFixed(2)} — ${dur}s to accept!`,
      sentiment: eo.side === 'BUY' ? 'BULLISH' : 'BEARISH',
      timestamp: Date.now(),
    };
    game.news.push(newsItem);

    io.to(game.code).emit('entity_order_start', {
      id: eo.id, entity: eo.entity, side: eo.side,
      quantity: qty, price: pr, duration: dur,
      expiresAt: eo.expiresAt, newsItem,
    });

    // Auto-expire
    setTimeout(() => {
      if (game.activeEntityOrder?.id === eo.id) {
        const filled = eo.filledQty;
        game.activeEntityOrder = null;
        const expireNews = {
          id: uuidv4(),
          message: `⚡ FLASH EVENT expired: ${eo.entity}'s ${eo.side} order — ${filled.toLocaleString()} / ${qty.toLocaleString()} filled`,
          sentiment: 'NEUTRAL', timestamp: Date.now(),
        };
        game.news.push(expireNews);
        io.to(game.code).emit('entity_order_end', { id: eo.id, filledQty: filled, totalQty: qty, newsItem: expireNews });
      }
    }, dur * 1000);

    cb?.({ success: true });
  });

  socket.on('accept_entity_order', ({ quantity }, cb) => {
    const info = socketToGame.get(socket.id);
    if (!info) return cb?.({ success: false });
    const game = games.get(info.gameCode);
    if (!game || game.state !== 'ACTIVE') return cb?.({ success: false });
    const player = game.players.get(socket.id);
    if (!player || player.isGM) return cb?.({ success: false });

    const eo = game.activeEntityOrder;
    if (!eo || Date.now() >= eo.expiresAt) return cb?.({ success: false, error: 'No active flash event' });
    if (eo.acceptedBy.has(player.id)) return cb?.({ success: false, error: 'Already accepted' });

    const remaining = eo.quantity - eo.filledQty;
    if (remaining <= 0) return cb?.({ success: false, error: 'Already fully filled' });

    const qty = Math.min(parseInt(quantity) || remaining, remaining);

    // Entity BUY → player SELLS to entity at eo.price
    // Entity SELL → player BUYS from entity at eo.price
    const cost = r2(eo.price * qty);
    if (eo.side === 'BUY') {
      // Player sells qty beans at eo.price
      player.cash = r2(player.cash + cost);
      player.beanPosition -= qty;
    } else {
      // Player buys qty beans at eo.price
      player.cash = r2(player.cash - cost);
      player.beanPosition += qty;
    }

    eo.filledQty += qty;
    eo.acceptedBy.set(player.id, qty);

    const trade = {
      id: uuidv4(), security: 'BEAN',
      buyerId:  eo.side === 'SELL' ? player.id : 'ENTITY',
      sellerId: eo.side === 'BUY'  ? player.id : 'ENTITY',
      price: eo.price, quantity: qty, timestamp: Date.now(),
    };
    if (trade.security === 'BEAN') {
      game.lastPrice = eo.price;
      game.priceHistory.push({ time: Date.now(), price: eo.price, volume: qty });
    }
    game.trades.push(trade);

    sendPosition(game, player);
    broadcastLeaderboard(game);

    io.to(game.code).emit('entity_order_update', {
      id: eo.id, filledQty: eo.filledQty, remainingQty: eo.quantity - eo.filledQty,
    });

    if (eo.filledQty >= eo.quantity) {
      game.activeEntityOrder = null;
      io.to(game.code).emit('entity_order_end', { id: eo.id, filledQty: eo.filledQty, totalQty: eo.quantity, fullyFilled: true });
    }

    cb?.({ success: true, qty, price: eo.price });
  });

  // ── GM controls ───────────────────────────────────────────────────────────
  socket.on('gm_update_distribution', ({ mu, sigma }, cb) => {
    const info = socketToGame.get(socket.id);
    if (!info) return;
    const game = games.get(info.gameCode);
    if (!game || game.gamemasterId !== socket.id) return;

    if (mu != null) {
      const newMu = r2(clamp(parseFloat(mu), 0.01, 0.99));
      if (isNaN(newMu)) return cb?.({ success: false, error: 'Invalid mu' });
      game.distribution.mu = newMu;
    }

    if (sigma != null) {
      const qIdx = Math.max(0, (game.quarter || 1) - 1);
      const range = QUARTER_SIGMA_RANGES[qIdx];
      const newSigma = Math.round(clamp(parseFloat(sigma), range.min, range.max) * 1000) / 1000;
      if (isNaN(newSigma)) return cb?.({ success: false, error: 'Invalid sigma' });
      game.distribution.sigma = newSigma;
    }

    const qIdx = Math.max(0, (game.quarter || 1) - 1);
    io.to(game.code).emit('distribution_update', { distribution: game.distribution, sigmaRange: QUARTER_SIGMA_RANGES[qIdx] });
    cb?.({ success: true, distribution: game.distribution });
  });

  // Random consumer sentiment announcement
  socket.on('gm_announce_sentiment', (cb) => {
    const info = socketToGame.get(socket.id);
    if (!info) return cb?.({ success: false });
    const game = games.get(info.gameCode);
    if (!game || game.gamemasterId !== socket.id) return cb?.({ success: false });

    const sample = sampleNormal(game.distribution.mu, game.distribution.sigma);
    const { mu } = game.distribution;

    const TEMPLATES = [
      `📊 Consumer Survey: Average willingness to pay estimated at $${sample.toFixed(2)}`,
      `🛒 Retail Intelligence: Consumer demand peaks near $${sample.toFixed(2)}`,
      `👥 Focus Group Results: Most consumers comfortable paying around $${sample.toFixed(2)}`,
      `📋 Market Research: Median consumer bid recorded at $${sample.toFixed(2)}`,
      `🔍 Analyst Note: Consumer price sensitivity suggests fair value near $${sample.toFixed(2)}`,
    ];
    const message = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];

    // Sentiment relative to last price
    const diff = game.lastPrice != null ? sample - game.lastPrice : 0;
    const sentiment = diff > 0.05 ? 'BULLISH' : diff < -0.05 ? 'BEARISH' : 'NEUTRAL';

    const item = { id: uuidv4(), message, sentiment, timestamp: Date.now() };
    game.news.push(item);
    io.to(game.code).emit('news_item', item);
    cb?.({ success: true, sample });
  });

  socket.on('gm_settle', ({ price }, cb) => {
    const info = socketToGame.get(socket.id);
    if (!info) return cb?.({ success: false });
    const game = games.get(info.gameCode);
    if (!game || game.gamemasterId !== socket.id) return cb?.({ success: false });
    if (game.state !== 'ACTIVE') return cb?.({ success: false, error: 'Game not active' });
    const sp = price != null ? parseFloat(price) : null;
    settleGame(game, sp);
    cb?.({ success: true });
  });

  socket.on('disconnect', () => {
    const info = socketToGame.get(socket.id);
    if (info) {
      const game = games.get(info.gameCode);
      if (game) {
        const player = game.players.get(socket.id);
        if (player) io.to(game.code).emit('player_left', { name: player.name });
      }
      socketToGame.delete(socket.id);
    }
  });

  socket.on('get_my_orders', () => {
    const info = socketToGame.get(socket.id);
    if (!info) return;
    const game = games.get(info.gameCode);
    const player = game?.players.get(socket.id);
    if (!player) return;
    const myOrders = [...player.orders.values()].filter(o => o.status === 'OPEN' || o.status === 'PARTIAL');
    socket.emit('my_orders_update', myOrders);
    socket.emit('position_update', serializeMyPosition(player, game));
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`\n🫘 The Bean Game server running on http://localhost:${PORT}\n`));
