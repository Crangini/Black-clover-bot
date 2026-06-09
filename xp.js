import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const XP_FILE = "./xp_data.json";

let xpData = {};

if (existsSync(XP_FILE)) {
  try {
    xpData = JSON.parse(readFileSync(XP_FILE, "utf8"));
  } catch (e) {
    xpData = {};
  }
}

export function tryGiveXp(userId) {
  if (!xpData[userId]) xpData[userId] = { xp: 0, level: 1 };

  xpData[userId].xp += Math.floor(Math.random() * 5) + 5;

  const xpNeeded = xpData[userId].level * 100;
  let leveledUp = false;
  let newLevel = xpData[userId].level;

  while (xpData[userId].xp >= xpNeeded) {
    xpData[userId].xp -= xpNeeded;
    newLevel++;
    leveledUp = true;
  }

  if (leveledUp) {
    xpData[userId].level = newLevel;
  }

  saveXpData();
  return { leveledUp, newLevel: xpData[userId].level };
}

export function getUserProgress(userId) {
  if (!xpData[userId]) {
    return { level: 1, totalXp: 0, xpInLevel: 0, xpNeeded: 100, percent: 0, progressBar: "░░░░░░░░░░" };
  }

  const level = xpData[userId].level;
  const xpInLevel = xpData[userId].xp;
  const xpNeeded = level * 100;
  const percent = Math.floor((xpInLevel / xpNeeded) * 100);

  return {
    level,
    totalXp: xpInLevel + (level - 1) * 100,
    xpInLevel,
    xpNeeded,
    percent,
    progressBar: "█".repeat(Math.floor(percent / 10)) + "░".repeat(10 - Math.floor(percent / 10))
  };
}

export function getLeaderboard(limit = 10) {
  return Object.entries(xpData)
    .sort((a, b) => (b[1].level * 100 + b[1].xp) - (a[1].level * 100 + a[1].xp))
    .slice(0, limit)
    .map(([userId, data]) => ({ userId, level: data.level, xp: data.xp + (data.level - 1) * 100 }));
}

export function getUserRank(userId) {
  const sorted = Object.entries(xpData)
    .sort((a, b) => (b[1].level * 100 + b[1].xp) - (a[1].level * 100 + a[1].xp));
  return sorted.findIndex(([id]) => id === userId) + 1 || 999;
}

function saveXpData() {
  try {
    writeFileSync(XP_FILE, JSON.stringify(xpData, null, 2));
  } catch (e) {}
}