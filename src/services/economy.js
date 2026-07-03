import { db } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { checkRateLimit } from '../utils/rateLimiter.js';

// ─── Per-user async mutex ────────────────────────────────────────────────────
// Prevents concurrent Discord interactions from causing lost-update / cooldown-
// bypass bugs. Works per-process (single Node process = sufficient).
const _locks = new Map();

async function withLock(key, fn) {
  // Chain promises so concurrent calls queue behind each other
  const prev = _locks.get(key) || Promise.resolve();
  let release;
  const next = new Promise(resolve => { release = resolve; });
  _locks.set(key, prev.then(() => next));

  await prev; // wait for any in-flight operation on this key
  try {
    return await fn();
  } finally {
    release();
    // GC: clean up resolved chain entry if nothing else is waiting
    if (_locks.get(key) === next) _locks.delete(key);
  }
}

function lockKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

// For two-party ops: always acquire locks in lexicographic order to avoid deadlock
async function withTwoLocks(keyA, keyB, fn) {
  const [first, second] = [keyA, keyB].sort();
  return withLock(first, () => withLock(second, fn));
}

// ─── Key helpers ─────────────────────────────────────────────────────────────
function economyConfigKey(guildId)        { return `economy:${guildId}:config`; }
function userBalanceKey(guildId, userId)  { return `economy:${guildId}:user:${userId}`; }
function userInventoryKey(guildId, userId){ return `economy:${guildId}:inventory:${userId}`; }
function participantsKey(guildId)         { return `economy:${guildId}:participants`; }

// ─── Participant tracking (for leaderboard) ───────────────────────────────────
async function trackParticipant(guildId, userId) {
  try {
    const data = await db.get(participantsKey(guildId));
    const ids = data?.ids || [];
    if (!ids.includes(userId)) {
      ids.push(userId);
      await db.set(participantsKey(guildId), { ids });
    }
  } catch (err) {
    logger.warn(`[Economy] Failed to track participant ${userId}:`, err);
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  enabled: true,
  currencyName: 'Coins',
  currencyEmoji: '🪙',
  dailyAmount: 100,
  dailyStreakBonus: 10,
  workMin: 50,
  workMax: 250,
  workCooldown: 4 * 60 * 60 * 1000, // 4 hours in ms
  robCooldown: 30 * 60 * 1000,       // 30 minutes in ms
  robSuccessRate: 45,                 // % chance success
  // Message coins
  messageCoinsEnabled: true,
  coinsPerMessage: 5,
  messageCoinsRateLimit: 60 * 1000,  // 1 minute between awards per user
  // Admin notification role (pinged when bot can't auto-deliver a shop item)
  adminNotifyRoleId: null,
  // Jackpot / big-win announcements
  jackpotChannelId: null,
  jackpotMinBet: 100,                // Only announce jackpots if bet >= this amount
  // Role shop appearance
  shopTitle: 'Server Shop',
  shopColor: '#5865F2',
  shopFooter: '',
  // Role shop items: { id, name, description, emoji, price, type ('role'|'custom'), roleId, deliveryNote }
  shopItems: [],
  packs: [
    {
      id: 'starter',
      name: 'Starter Pack',
      emoji: '📦',
      description: 'A basic pack with common rewards',
      price: 200,
      rewards: [
        { type: 'coins', amount: 50,  chance: 60, label: '50 coins' },
        { type: 'coins', amount: 150, chance: 30, label: '150 coins' },
        { type: 'coins', amount: 300, chance: 10, label: '300 coins' },
      ],
    },
    {
      id: 'premium',
      name: 'Premium Pack',
      emoji: '💎',
      description: 'A rare pack with better rewards',
      price: 500,
      rewards: [
        { type: 'coins', amount: 200,  chance: 50, label: '200 coins' },
        { type: 'coins', amount: 500,  chance: 35, label: '500 coins' },
        { type: 'coins', amount: 1000, chance: 15, label: '1,000 coins' },
      ],
    },
  ],
};

export async function getEconomyConfig(guildId) {
  try {
    const stored = await db.get(economyConfigKey(guildId));
    if (!stored) return { ...DEFAULT_CONFIG, packs: DEFAULT_CONFIG.packs.map(p => ({ ...p })) };
    return {
      ...DEFAULT_CONFIG,
      ...stored,
      packs: stored.packs?.length ? stored.packs : DEFAULT_CONFIG.packs,
    };
  } catch (err) {
    logger.error(`[Economy] Failed to get config for ${guildId}:`, err);
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveEconomyConfig(guildId, patch) {
  try {
    const current = await getEconomyConfig(guildId);
    const updated = { ...current, ...patch };
    await db.set(economyConfigKey(guildId), updated);
    return updated;
  } catch (err) {
    logger.error(`[Economy] Failed to save config for ${guildId}:`, err);
    throw err;
  }
}

// ─── Raw balance (no lock — callers must hold lock) ───────────────────────────
async function _readBalance(guildId, userId) {
  const data = await db.get(userBalanceKey(guildId, userId));
  return data || { coins: 0, bankCoins: 0, lastDaily: null, dailyStreak: 0, lastWork: null, lastRob: null };
}

async function _writeBalance(guildId, userId, data) {
  await db.set(userBalanceKey(guildId, userId), data);
  await trackParticipant(guildId, userId);
  return data;
}

// ─── Public read (safe without lock for display only) ────────────────────────
export async function getUserBalance(guildId, userId) {
  try {
    const data = await _readBalance(guildId, userId);
    return { bankCoins: 0, ...data }; // ensure bankCoins always present
  } catch (err) {
    logger.error(`[Economy] Failed to get balance for ${userId}:`, err);
    return { coins: 0, bankCoins: 0, lastDaily: null, dailyStreak: 0, lastWork: null, lastRob: null };
  }
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────
export async function getEconomyLeaderboard(guildId, limit = 10) {
  try {
    const data = await db.get(participantsKey(guildId));
    const ids = data?.ids || [];
    if (ids.length === 0) return [];

    const entries = await Promise.all(
      ids.map(async userId => {
        const bal = await _readBalance(guildId, userId);
        return { userId, coins: bal.coins || 0 };
      })
    );

    return entries
      .filter(e => e.coins > 0)
      .sort((a, b) => b.coins - a.coins)
      .slice(0, limit);
  } catch (err) {
    logger.error(`[Economy] Failed to get leaderboard for ${guildId}:`, err);
    return [];
  }
}

// ─── Daily (atomic) ──────────────────────────────────────────────────────────
export async function claimDaily(guildId, userId) {
  return withLock(lockKey(guildId, userId), async () => {
    const config = await getEconomyConfig(guildId);
    const current = await _readBalance(guildId, userId);
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;

    if (current.lastDaily && now - current.lastDaily < cooldown) {
      return { success: false, nextDaily: current.lastDaily + cooldown };
    }

    const isStreak = current.lastDaily && now - current.lastDaily < cooldown * 2;
    const streak = isStreak ? (current.dailyStreak || 0) + 1 : 1;
    const streakBonus = Math.min(streak - 1, 30) * (config.dailyStreakBonus || 10);
    const earned = (config.dailyAmount || 100) + streakBonus;
    const newCoins = (current.coins || 0) + earned;

    await _writeBalance(guildId, userId, { ...current, coins: newCoins, lastDaily: now, dailyStreak: streak });
    return { success: true, earned, streakBonus, streak, newTotal: newCoins };
  });
}

// ─── Work (atomic) ───────────────────────────────────────────────────────────
const WORK_JOBS = [
  { job: 'pizza delivery driver',    emoji: '🍕' },
  { job: 'street musician',          emoji: '🎸' },
  { job: 'dog walker',               emoji: '🐕' },
  { job: 'barista',                  emoji: '☕' },
  { job: 'Uber driver',              emoji: '🚗' },
  { job: 'freelance programmer',     emoji: '💻' },
  { job: 'personal trainer',         emoji: '🏋️' },
  { job: 'house cleaner',            emoji: '🧹' },
  { job: 'security guard',           emoji: '🛡️' },
  { job: 'food truck vendor',        emoji: '🌮' },
  { job: 'gardener',                 emoji: '🌱' },
  { job: 'photographer',             emoji: '📷' },
  { job: 'tutor',                    emoji: '📚' },
  { job: 'waiter',                   emoji: '🍽️' },
  { job: 'construction worker',      emoji: '🏗️' },
  { job: 'fisherman',                emoji: '🎣' },
  { job: 'librarian',                emoji: '📖' },
  { job: 'electrician',              emoji: '⚡' },
  { job: 'nurse',                    emoji: '🏥' },
  { job: 'mechanic',                 emoji: '🔧' },
];

export async function claimWork(guildId, userId) {
  return withLock(lockKey(guildId, userId), async () => {
    const config = await getEconomyConfig(guildId);
    const current = await _readBalance(guildId, userId);
    const now = Date.now();
    const cooldown = config.workCooldown || 4 * 60 * 60 * 1000;

    if (current.lastWork && now - current.lastWork < cooldown) {
      return { success: false, nextWork: current.lastWork + cooldown };
    }

    const min = config.workMin || 50;
    const max = config.workMax || 250;
    const earned = Math.floor(Math.random() * (max - min + 1)) + min;
    const jobEntry = WORK_JOBS[Math.floor(Math.random() * WORK_JOBS.length)];
    const newCoins = (current.coins || 0) + earned;

    await _writeBalance(guildId, userId, { ...current, coins: newCoins, lastWork: now });
    return { success: true, earned, job: jobEntry.job, emoji: jobEntry.emoji, newTotal: newCoins };
  });
}

// ─── Transfer / Pay (atomic, two-user lock) ──────────────────────────────────
export async function transferCoins(guildId, fromId, toId, amount) {
  if (fromId === toId) return { success: false, reason: 'self' };
  if (amount < 1)      return { success: false, reason: 'amount' };

  return withTwoLocks(lockKey(guildId, fromId), lockKey(guildId, toId), async () => {
    const from = await _readBalance(guildId, fromId);
    if ((from.coins || 0) < amount) {
      return { success: false, reason: 'funds', have: from.coins || 0 };
    }

    const to = await _readBalance(guildId, toId);
    const fromCoins = from.coins - amount;
    const toCoins = (to.coins || 0) + amount;

    await _writeBalance(guildId, fromId, { ...from, coins: fromCoins });
    await _writeBalance(guildId, toId,   { ...to,   coins: toCoins });

    return { success: true, amount, fromTotal: fromCoins };
  });
}

// ─── Rob (atomic, two-user lock) ─────────────────────────────────────────────
export async function robUser(guildId, robberId, targetId) {
  if (robberId === targetId) return { success: false, reason: 'self' };

  return withTwoLocks(lockKey(guildId, robberId), lockKey(guildId, targetId), async () => {
    const config = await getEconomyConfig(guildId);
    const robber = await _readBalance(guildId, robberId);
    const now = Date.now();
    const cooldown = config.robCooldown || 30 * 60 * 1000;

    if (robber.lastRob && now - robber.lastRob < cooldown) {
      return { success: false, reason: 'cooldown', nextRob: robber.lastRob + cooldown };
    }

    const target = await _readBalance(guildId, targetId);
    if ((target.coins || 0) < 50) {
      return { success: false, reason: 'poor_target' };
    }

    const succeeded = Math.random() * 100 < (config.robSuccessRate ?? 45);

    if (succeeded) {
      const pct = 0.10 + Math.random() * 0.20;
      const stolen = Math.max(1, Math.floor((target.coins || 0) * pct));

      // Verify target still has enough (inside lock, so no race)
      if (stolen > (target.coins || 0)) {
        return { success: false, reason: 'poor_target' };
      }

      await _writeBalance(guildId, robberId, {
        ...robber,
        coins: (robber.coins || 0) + stolen,
        lastRob: now,
      });
      await _writeBalance(guildId, targetId, {
        ...target,
        coins: target.coins - stolen,
      });
      return { success: true, outcome: 'success', stolen };
    } else {
      const fine = Math.max(1, Math.floor((robber.coins || 0) * 0.20));
      const actualFine = Math.min(fine, robber.coins || 0);

      await _writeBalance(guildId, robberId, {
        ...robber,
        coins: Math.max(0, (robber.coins || 0) - actualFine),
        lastRob: now,
      });
      return { success: true, outcome: 'fail', fine: actualFine };
    }
  });
}

// ─── Coinflip (atomic) ───────────────────────────────────────────────────────
export async function playCoinflip(guildId, userId, amount, choice) {
  return withLock(lockKey(guildId, userId), async () => {
    const current = await _readBalance(guildId, userId);
    if ((current.coins || 0) < amount) return { success: false, reason: 'funds' };

    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = result === choice;
    const newCoins = won
      ? (current.coins || 0) + amount
      : Math.max(0, (current.coins || 0) - amount);

    await _writeBalance(guildId, userId, { ...current, coins: newCoins });
    return { success: true, won, result, amount, newTotal: newCoins };
  });
}

// ─── Slots (atomic) ──────────────────────────────────────────────────────────
const SLOT_SYMBOLS = [
  { symbol: '🍒', weight: 35 },
  { symbol: '🍋', weight: 28 },
  { symbol: '🍇', weight: 17 },
  { symbol: '⭐', weight: 10 },
  { symbol: '💎', weight:  7 },
  { symbol: '7️⃣', weight:  3 },
];

const SLOT_PAYOUTS = {
  '🍒': 2,
  '🍋': 2.5,
  '🍇': 3,
  '⭐': 5,
  '💎': 8,
  '7️⃣': 15,
};

function spinReel() {
  const totalWeight = SLOT_SYMBOLS.reduce((s, x) => s + x.weight, 0);
  let rand = Math.random() * totalWeight;
  for (const s of SLOT_SYMBOLS) {
    rand -= s.weight;
    if (rand <= 0) return s.symbol;
  }
  return SLOT_SYMBOLS[0].symbol;
}

export async function playSlots(guildId, userId, bet) {
  return withLock(lockKey(guildId, userId), async () => {
    const current = await _readBalance(guildId, userId);
    if ((current.coins || 0) < bet) return { success: false, reason: 'funds' };

    const reels = [spinReel(), spinReel(), spinReel()];
    const [a, b, c] = reels;

    let multiplier = 0;
    let outcome = 'lose';

    if (a === b && b === c) {
      multiplier = SLOT_PAYOUTS[a] || 2;
      outcome = a === '7️⃣' ? 'jackpot' : 'three_match';
    } else if (a === b || b === c || a === c) {
      multiplier = 0.5;
      outcome = 'two_match';
    }

    const netChange = Math.floor(bet * multiplier) - bet;
    const newCoins = Math.max(0, (current.coins || 0) + netChange);
    await _writeBalance(guildId, userId, { ...current, coins: newCoins });

    return { success: true, reels, outcome, multiplier, bet, netChange, newTotal: newCoins };
  });
}

// ─── Inventory ────────────────────────────────────────────────────────────────
export async function getUserInventory(guildId, userId) {
  try {
    const data = await db.get(userInventoryKey(guildId, userId));
    return data || { packs: [], opened: [] };
  } catch (err) {
    logger.error(`[Economy] Failed to get inventory for ${userId}:`, err);
    return { packs: [], opened: [] };
  }
}

export async function addPackToInventory(guildId, userId, packId) {
  try {
    const inv = await getUserInventory(guildId, userId);
    const packs = [...(inv.packs || []), { packId, obtainedAt: Date.now() }];
    await db.set(userInventoryKey(guildId, userId), { ...inv, packs });
    return packs;
  } catch (err) {
    logger.error(`[Economy] Failed to add pack to inventory for ${userId}:`, err);
    throw err;
  }
}

export async function openPack(guildId, userId, packId) {
  return withLock(lockKey(guildId, userId), async () => {
    const config = await getEconomyConfig(guildId);
    const inv = await getUserInventory(guildId, userId);

    const packIndex = (inv.packs || []).findIndex(p => p.packId === packId);
    if (packIndex === -1) return null;

    const packDef = (config.packs || []).find(p => p.id === packId);
    if (!packDef) return null;

    const roll = Math.random() * 100;
    let cumulative = 0;
    let reward = packDef.rewards[packDef.rewards.length - 1];
    for (const r of packDef.rewards) {
      cumulative += r.chance;
      if (roll < cumulative) { reward = r; break; }
    }

    const updatedPacks = [...inv.packs];
    updatedPacks.splice(packIndex, 1);
    const opened = [...(inv.opened || []), { packId, reward, openedAt: Date.now() }];
    await db.set(userInventoryKey(guildId, userId), { packs: updatedPacks, opened });

    if (reward.type === 'coins') {
      const current = await _readBalance(guildId, userId);
      await _writeBalance(guildId, userId, {
        ...current,
        coins: (current.coins || 0) + reward.amount,
      });
    }

    return reward;
  });
}

// ─── Message coins (rate-limited, in-memory) ─────────────────────────────────
export async function awardMessageCoins(guildId, userId) {
  try {
    const config = await getEconomyConfig(guildId);
    if (!config.enabled || !config.messageCoinsEnabled) return { awarded: false };

    const windowMs = config.messageCoinsRateLimit || 60 * 1000;
    const rateLimitKey = `msg-coins:${guildId}:${userId}`;
    const canAward = await checkRateLimit(rateLimitKey, 1, windowMs);
    if (!canAward) return { awarded: false };

    const coins = Math.max(1, config.coinsPerMessage || 5);
    return withLock(lockKey(guildId, userId), async () => {
      const current = await _readBalance(guildId, userId);
      await _writeBalance(guildId, userId, { ...current, coins: (current.coins || 0) + coins });
      return { awarded: true, coins };
    });
  } catch (err) {
    logger.warn(`[Economy] awardMessageCoins failed for ${userId}:`, err);
    return { awarded: false };
  }
}

// ─── Shop item purchase (atomic) ─────────────────────────────────────────────
export async function purchaseShopItem(guildId, userId, itemId) {
  return withLock(lockKey(guildId, userId), async () => {
    const config = await getEconomyConfig(guildId);
    const item = (config.shopItems || []).find(i => i.id === itemId);
    if (!item) return { success: false, reason: 'not_found' };

    const balance = await _readBalance(guildId, userId);
    if ((balance.coins || 0) < item.price) {
      return { success: false, reason: 'funds', have: balance.coins || 0, need: item.price };
    }

    await _writeBalance(guildId, userId, { ...balance, coins: balance.coins - item.price });
    return { success: true, item, remaining: balance.coins - item.price };
  });
}

// ─── addCoins / removeCoins — kept for dashboard/admin use ───────────────────
export async function addCoins(guildId, userId, amount) {
  return withLock(lockKey(guildId, userId), async () => {
    const current = await _readBalance(guildId, userId);
    return _writeBalance(guildId, userId, { ...current, coins: (current.coins || 0) + amount });
  });
}

export async function removeCoins(guildId, userId, amount) {
  return withLock(lockKey(guildId, userId), async () => {
    const current = await _readBalance(guildId, userId);
    if ((current.coins || 0) < amount) return null;
    return _writeBalance(guildId, userId, { ...current, coins: current.coins - amount });
  });
}

export async function setUserBalance(guildId, userId, data) {
  return withLock(lockKey(guildId, userId), async () => {
    const current = await _readBalance(guildId, userId);
    return _writeBalance(guildId, userId, { ...current, ...data });
  });
}

// ─── Atomic pack purchase (coins deducted + inventory updated in one lock) ────
export async function buyPack(guildId, userId, packId) {
  return withLock(lockKey(guildId, userId), async () => {
    const config = await getEconomyConfig(guildId);
    const pack = (config.packs || []).find(p => p.id === packId);
    if (!pack) return { success: false, reason: 'not_found' };

    const balance = await _readBalance(guildId, userId);
    if ((balance.coins || 0) < pack.price) {
      return { success: false, reason: 'funds', have: balance.coins || 0, need: pack.price };
    }

    // Deduct coins
    const newBalance = { ...balance, coins: balance.coins - pack.price };
    await _writeBalance(guildId, userId, newBalance);

    // Add pack to inventory (inside same lock — no race window)
    const inv = await getUserInventory(guildId, userId);
    const packs = [...(inv.packs || []), { packId, obtainedAt: Date.now() }];
    await db.set(userInventoryKey(guildId, userId), { ...inv, packs });

    return { success: true, pack, remaining: newBalance.coins };
  });
}

// ─── Bank (deposit / withdraw) ────────────────────────────────────────────────
// Bank coins cannot be stolen by /rob — only wallet coins (coins) are at risk.
export async function depositCoins(guildId, userId, amount) {
  if (amount < 1) return { success: false, reason: 'amount' };
  return withLock(lockKey(guildId, userId), async () => {
    const current = await _readBalance(guildId, userId);
    if ((current.coins || 0) < amount) {
      return { success: false, reason: 'funds', have: current.coins || 0 };
    }
    const updated = {
      ...current,
      coins: current.coins - amount,
      bankCoins: (current.bankCoins || 0) + amount,
    };
    await _writeBalance(guildId, userId, updated);
    return { success: true, deposited: amount, wallet: updated.coins, bank: updated.bankCoins };
  });
}

export async function withdrawCoins(guildId, userId, amount) {
  if (amount < 1) return { success: false, reason: 'amount' };
  return withLock(lockKey(guildId, userId), async () => {
    const current = await _readBalance(guildId, userId);
    if ((current.bankCoins || 0) < amount) {
      return { success: false, reason: 'funds', have: current.bankCoins || 0 };
    }
    const updated = {
      ...current,
      coins: (current.coins || 0) + amount,
      bankCoins: current.bankCoins - amount,
    };
    await _writeBalance(guildId, userId, updated);
    return { success: true, withdrawn: amount, wallet: updated.coins, bank: updated.bankCoins };
  });
}
