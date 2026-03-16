import type { Role } from '@/types';

export const ROLE_HIERARCHY: Record<Role, number> = {
  admin:      4,
  supervisor: 3,
  agent:      2,
  qa:         1,
};

export function hasRole(userRole: Role, required: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[required];
}

export function canAccessAdmin(role: Role): boolean {
  return role === 'admin';
}

export function canAccessSupervisor(role: Role): boolean {
  return hasRole(role, 'supervisor');
}

export function canAccessReports(role: Role): boolean {
  return hasRole(role, 'supervisor');
}

export function canManageUsers(role: Role): boolean {
  return role === 'admin';
}
