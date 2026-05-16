import type { Role } from "./db.js";

const roleWeight: Record<Role, number> = {
  viewer: 1,
  editor: 2,
  owner: 3
};

export function hasMinimumRole(actual: Role, required: Role): boolean {
  return roleWeight[actual] >= roleWeight[required];
}
