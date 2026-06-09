import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(scriptDir, "data");
const XP_FILE = path.join(DATA_DIR, "xp.json");

const XP_COOLDOWN_MS = 60_000;
const cooldowns = new Map();

function ensureDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function load() {
  ensureDir();
  if (!existsSync(XP_FILE)) return {};
  try {
    return JSON.parse(readFileSync(XP_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function save(data) {
  ensureDir();
  writeFileSync(XP_FILE, JSON.stringify(data, null, 2));
}

function xpRequiredForLevel(level) {
  return 5 * level * level + 50 * level + 100;
}

function computeLevel(totalXp) {
  let level = 0;
  let remaining = totalXp;
  while (remaining >= xpRequiredForLevel(level)) {
    remaining -= xpRequiredForLevel(level);
    level++;
  }
  return level;
}

export function tryGiveXp(userId) {
  const now = Date.now();
  const lastMessage = cooldowns.get(userId) ?? 0;
  if (now - lastMessage < XP_COOLDOWN_MS) {
    return null;
  }
  cooldowns.set(userId, now);

  const data = load();
  const entry = data[userId] ?? { xp: 0, level: 0 };
  const gained = Math.floor(Math.random() * 11) + 15;
  entry.xp += gained;

  const oldLevel = entry.level;
  const newLevel = computeLevel(entry.xp);
  entry.level = newLevel;

  data[userId] = entry;
  save(data);

  return {
    leveledUp: newLevel > oldLevel,
    oldLevel,
    newLevel,
    totalXp: entry.xp,
  };
}

export function getUserXp(userId) {
  const data = load();
  return data[userId] ?? { xp: 0, level: 0 };
}

export function getUserProgress(userId) {
  const data = load();
  const entry = data[userId] ?? { xp: 0, level: 0 };

 import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(scriptDir, "data");
const XP_FILE = path.join(DATA_DIR, "xp.json");

const XP_COOLDOWN_MS = 60_000;
const cooldowns = new Map();

function ensureDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function load() {
  ensureDir();
  if (!existsSync(XP_FILE)) return {};
  try {
    return JSON.parse(readFileSync(XP_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function save(data) {
  ensureDir();
  writeFileSync(XP_FILE, JSON.stringify(data, null, 2));
}

function xpRequiredForLevel(level) {
  return 5 * level * level + 50 * level + 100;
}

function computeLevel(totalXp) {
  let level = 0;
  let remaining = totalXp;
  while (remaining >= xpRequiredForLevel(level)) {
    remaining -= xpRequiredForLevel(level);
    level++;
  }
  return level;
}

export function tryGiveXp(userId) {
  const now = Date.now();
  const lastMessage = cooldowns.get(userId) ?? 0;
  if (now - lastMessage < XP_COOLDOWN_MS) {
    return null;
  }
  cooldowns.set(userId, now);

  const data = load();
  const entry = data[userId] ?? { xp: 0, level: 0 };
  const gained = Math.floor(Math.random() * 11) + 15;
  entry.xp += gained;

  const oldLevel = entry.level;
  const newLevel = computeLevel(entry.xp);
  entry.level = newLevel;

  data[userId] = entry;
  save(data);

  return {
    leveledUp: newLevel > oldLevel,
    oldLevel,
    newLevel,
    totalXp: entry.xp,
  };
}

export function getUserXp(userId) {
  const data = load();
  return data[userId] ?? { xp: 0, level: 0 };
}

export function getUserProgress(userId) {
  const data = load();
  const entry = data[userId] ?? { xp: 0, level: 0 };

  let remaining = entry.xp;
  let level = 0;
  while (remaining >= xpRequiredForLevel(level)) {
    remaining -= xpRequiredForLevel(level);
    level++;
  }

  const xpInLevel = remaining;
  const xpNeeded = xpRequiredForLevel(level);
  const percent = Math.floor((xpInLevel / xpNeeded) * 100);
  const filled = Math.floor(percent / 10);
  const progressBar = "▓".repeat(filled) + "░".repeat(10 - filled);

  return { level, xpInLevel, xpNeeded, totalXp: entry.xp, progressBar, percent };
}

export function getLeaderboard(limit = 10) {
  const data = load();
  return Object.entries(data)
    .map(([userId, d]) => ({ userId, xp: d.xp, level: d.level }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);
}

export function getUserRank(userId) {
  const data = load();
  const sorted = Object.entries(data)
    .map(([id, d]) => ({ id, xp: d.xp }))
    .sort((a, b) => b.xp - a.xp);
  const index = sorted.findIndex((e) => e.id === userId);
  return index === -1 ? sorted.length + 1 : index + 1;
}


