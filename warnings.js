// warnings.js
const warnings = new Map(); // userId -> array of warnings

export function addWarning(userId, guildId, reason, moderatorId) {
  if (!warnings.has(userId)) {
    warnings.set(userId, []);
  }
  
  const userWarnings = warnings.get(userId);
  const newWarn = {
    id: Date.now(),
    guildId,
    reason,
    moderatorId,
    timestamp: Date.now()
  };
  
  userWarnings.push(newWarn);
  return { total: userWarnings.length, warning: newWarn };
}

export function getWarnings(userId, guildId) {
  if (!warnings.has(userId)) return [];
  return warnings.get(userId).filter(w => w.guildId === guildId);
}

export function removeWarning(userId, guildId, warnId) {
  if (!warnings.has(userId)) return false;
  
  const userWarnings = warnings.get(userId);
  const initialLength = userWarnings.length;
  
  warnings.set(userId, userWarnings.filter(w => w.id !== warnId));
  
  return warnings.get(userId).length < initialLength;
}