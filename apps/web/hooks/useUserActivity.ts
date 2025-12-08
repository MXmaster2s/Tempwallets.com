'use client';

import { useState, useEffect, useCallback } from 'react';
import { userApi } from '@/lib/api';
import type { UserActivity } from '@repo/types';

export function useUserActivity(limit: number = 50) {
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivity = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await userApi.getActivity(limit);
      setActivities(data);
    } catch (err) {
      console.error('Failed to fetch user activity:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch activity');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  const refetch = useCallback(() => {
    return fetchActivity();
  }, [fetchActivity]);

  return {
    activities,
    loading,
    error,
    refetch,
  };
}

