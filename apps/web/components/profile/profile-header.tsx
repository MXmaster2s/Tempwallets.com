"use client";

import { useUserProfile } from "@/hooks/useUserProfile";
import { useUserStats } from "@/hooks/useUserStats";
import { Avatar, AvatarImage, AvatarFallback } from "@repo/ui/components/ui/avatar";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Wallet, TrendingUp, Calendar } from "lucide-react";

export function ProfileHeader() {
  const { profile, loading: profileLoading } = useUserProfile();
  const { stats, loading: statsLoading } = useUserStats();

  const getInitials = (name: string | null) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Card className="bg-[#1a1a1a] border-gray-800">
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          {/* Avatar */}
          <Avatar className="h-20 w-20 border-2 border-[#4C856F]">
            {profileLoading ? (
              <Skeleton className="h-full w-full rounded-full" />
            ) : (
              <>
                <AvatarImage src={profile?.picture || undefined} alt={profile?.name || "User"} />
                <AvatarFallback className="bg-[#4C856F] text-white text-2xl">
                  {getInitials(profile?.name || null)}
                </AvatarFallback>
              </>
            )}
          </Avatar>

          {/* User Info */}
          <div className="flex-1">
            {profileLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
            ) : (
              <div>
                <h1 className="text-2xl font-semibold text-white">
                  {profile?.name || "User"}
                </h1>
                <p className="text-gray-400 mt-1">{profile?.email || "No email"}</p>
                <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>Joined {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "N/A"}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 w-full sm:w-auto">
            {statsLoading ? (
              <>
                <Skeleton className="h-16 w-20" />
                <Skeleton className="h-16 w-20" />
                <Skeleton className="h-16 w-20" />
              </>
            ) : (
              <>
                <div className="text-center p-3 bg-[#292929] rounded-lg border border-gray-700">
                  <div className="flex items-center justify-center gap-1 text-[#4C856F] mb-1">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div className="text-xl font-semibold text-white">{stats?.walletCount || 0}</div>
                  <div className="text-xs text-gray-400">Wallets</div>
                </div>
                <div className="text-center p-3 bg-[#292929] rounded-lg border border-gray-700">
                  <div className="flex items-center justify-center gap-1 text-[#4C856F] mb-1">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <div className="text-xl font-semibold text-white">{stats?.transactionCount || 0}</div>
                  <div className="text-xs text-gray-400">Transactions</div>
                </div>
                <div className="text-center p-3 bg-[#292929] rounded-lg border border-gray-700">
                  <div className="text-xl font-semibold text-white">{stats?.activeWallets || 0}</div>
                  <div className="text-xs text-gray-400">Active</div>
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

