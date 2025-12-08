"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { useUserActivity } from "@/hooks/useUserActivity";
import { useUserStats } from "@/hooks/useUserStats";
import { Activity, TrendingUp, Wallet, Clock } from "lucide-react";
import { Skeleton } from "@repo/ui/components/ui/skeleton";

export function ActivityAnalytics() {
  const { activities, loading: activitiesLoading } = useUserActivity();
  const { stats, loading: statsLoading } = useUserStats();

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-[#1a1a1a] border-gray-800">
          <CardContent className="p-6">
            {statsLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <>
                <div className="flex items-center gap-2 text-gray-400 mb-2">
                  <Wallet className="h-4 w-4" />
                  <span className="text-sm">Total Wallets</span>
                </div>
                <div className="text-2xl font-semibold text-white">{stats?.walletCount || 0}</div>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="bg-[#1a1a1a] border-gray-800">
          <CardContent className="p-6">
            {statsLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <>
                <div className="flex items-center gap-2 text-gray-400 mb-2">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-sm">Transactions</span>
                </div>
                <div className="text-2xl font-semibold text-white">{stats?.transactionCount || 0}</div>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="bg-[#1a1a1a] border-gray-800">
          <CardContent className="p-6">
            {statsLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <>
                <div className="flex items-center gap-2 text-gray-400 mb-2">
                  <Activity className="h-4 w-4" />
                  <span className="text-sm">Active Wallets</span>
                </div>
                <div className="text-2xl font-semibold text-white">{stats?.activeWallets || 0}</div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Timeline */}
      <Card className="bg-[#1a1a1a] border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Clock className="h-5 w-5 text-[#4C856F]" />
            Recent Activity
          </CardTitle>
          <CardDescription className="text-gray-400">
            Your recent account activity timeline
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activitiesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : activities.length === 0 ? (
            <div className="text-gray-400 text-center py-8">No activity yet</div>
          ) : (
            <div className="space-y-3">
              {activities.map((activity, index) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-4 p-4 bg-[#292929] rounded-lg border border-gray-700"
                >
                  <div className="relative">
                    <div className="h-2 w-2 rounded-full bg-[#4C856F] mt-2" />
                    {index < activities.length - 1 && (
                      <div className="absolute top-4 left-1/2 w-px h-full bg-gray-700 -translate-x-1/2" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-medium">{activity.description}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(activity.timestamp).toLocaleString()}
                    </div>
                    {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                      <div className="text-xs text-gray-600 mt-1">
                        {JSON.stringify(activity.metadata)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

