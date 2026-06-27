import { db } from '../utils/database.js';
import { logger } from '../utils/logger.js';

const DEFAULT_CONFIG = {
  enabled: true,
  currencyName: 'Coins',
  currencyEmoji: '🪙',
  dailyAmount: 100,
  dailyStreakBonus: 10,
  packs: [
    {
      id: 'starter',
      name: 'Starter Pack',
      emoji: '📦',
      description: 'A basic pack with common rewards',
      price: 200,
      rewards: [
        { type: 'coins', amount: 50, chance: 60, label: '50 coins' },
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
        { type: 'coins', amount: 200, chance: 50, label: '200 coins' },
        { type: 'coins', amount: 500, chance: 35, label: '500 coins' },
        { type: 'coins', amount: 1000, chance: 15, label: '1,000 coins' },
      ],
    },
  ],
};

function economyConfigKey(guildId) {
  return `economy:${guildId}:config`;
}

function userBalanceKey(guildId, userId) {
  return `economy:${guildId}:user:${userId}`;
}

function userInventoryKey(guildId, userId) {
  return `economy:${guildId}:inventory:${userId}`;
}

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

export async function getUserBalance(guildId, userId) {
  try {
    const data = await db.get(userBalanceKey(guildId, userId));
    return data || { coins: 0, lastDaily: null, dailyStreak: 0 };
  } catch (err) {
    logger.error(`[Economy] Failed to get balance for ${userId}:`, err);
    return { coins: 0, lastDaily: null, dailyStreak: 0 };
  }
}

export async function setUserBalance(guildId, userId, data) {
  try {
    const current = await getUserBalance(guildId, userId);
    const updated = { ...current, ...data };
    await db.set(userBalanceKey(guildId, userId), updated);
    return updated;
  } catch (err) {
    logger.error(`[Economy] Failed to set balance for ${userId}:`, err);
    throw err;
  }
}

export async function addCoins(guildId, userId, amount) {
  const current = await getUserBalance(guildId, userId);
  const coins = (current.coins || 0) + amount;
  return setUserBalance(guildId, userId, { coins });
}

export async function removeCoins(guildId, userId, amount) {
  const current = await getUserBalance(guildId, userId);
  if ((current.coins || 0) < amount) return null;
  const coins = current.coins - amount;
  return setUserBalance(guildId, userId, { coins });
}

export async function claimDaily(guildId, userId) {
  const config = await getEconomyConfig(guildId);
  const current = await getUserBalance(guildId, userId);
  const now = Date.now();
  const cooldown = 24 * 60 * 60 * 1000;

  if (current.lastDaily && now - current.lastDaily < cooldown) {
    const nextDaily = current.lastDaily + cooldown;
    return { success: false, nextDaily };
  }

  const isStreak = current.lastDaily && now - current.lastDaily < cooldown * 2;
  const streak = isStreak ? (current.dailyStreak || 0) + 1 : 1;
  const streakBonus = Math.min(streak - 1, 30) * (config.dailyStreakBonus || 10);
  const earned = (config.dailyAmount || 100) + streakBonus;
  const newCoins = (current.coins || 0) + earned;

  await setUserBalance(guildId, userId, { coins: newCoins, lastDaily: now, dailyStreak: streak });

  return { success: true, earned, streakBonus, streak, newTotal: newCoins };
}

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
    if (roll < cumulative) {
      reward = r;
      break;
    }
  }

  const updatedPacks = [...inv.packs];
  updatedPacks.splice(packIndex, 1);
  const opened = [...(inv.opened || []), { packId, reward, openedAt: Date.now() }];
  await db.set(userInventoryKey(guildId, userId), { packs: updatedPacks, opened });

  if (reward.type === 'coins') {
    await addCoins(guildId, userId, reward.amount);
  }

  return reward;
}
