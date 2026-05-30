export const GIVEAWAY_ROLES = [
  "1510238686959108177",
  "1510238688674713753",
  "1510238688133644371",
  "1510238684790915214",
];

export const MOD_ROLES = [
  ...GIVEAWAY_ROLES,
  "1510238690692173824",
];

export function hasRole(member, allowedRoles) {
  return allowedRoles.some((roleId) => member.roles.cache.has(roleId));
}

