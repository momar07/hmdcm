'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import type { Role } from '@/types';

export function useAuth(requiredRole?: Role) {
  const { user, isAuthenticated, hydrate } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, router]);

  const hasRequiredRole = requiredRole
    ? user?.role === requiredRole ||
      (requiredRole === 'agent' && !!user) ||
      (requiredRole === 'supervisor' && ['admin', 'supervisor'].includes(user?.role ?? ''))
    : true;

  return { user, isAuthenticated, hasRequiredRole };
}
