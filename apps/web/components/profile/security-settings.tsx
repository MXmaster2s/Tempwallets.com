"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";
import { Shield, Lock, Activity, AlertTriangle } from "lucide-react";
import { useUserActivity } from "@/hooks/useUserActivity";

export function SecuritySettings() {
  const { activities, loading } = useUserActivity();

  return (
    <div className="space-y-6">
      {/* Active Sessions */}
      <Card className="bg-[#1a1a1a] border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#4C856F]" />
            Active Sessions
          </CardTitle>
          <CardDescription className="text-gray-400">
            Manage your active sessions and devices
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-[#292929] rounded-lg border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white font-medium">Current Session</div>
                <div className="text-sm text-gray-400 mt-1">
                  {typeof window !== "undefined" ? navigator.userAgent : "Unknown device"}
                </div>
              </div>
              <span className="text-xs bg-[#4C856F] text-white px-2 py-1 rounded-full">Active</span>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-4">
            Session management will be available in a future update.
          </p>
        </CardContent>
      </Card>

      {/* Security Activity */}
      <Card className="bg-[#1a1a1a] border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#4C856F]" />
            Security Activity
          </CardTitle>
          <CardDescription className="text-gray-400">
            Recent security-related activities
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-gray-400 text-center py-8">Loading activity...</div>
          ) : activities.length === 0 ? (
            <div className="text-gray-400 text-center py-8">No activity yet</div>
          ) : (
            <div className="space-y-3">
              {activities.slice(0, 10).map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center gap-3 p-4 bg-[#292929] rounded-lg border border-gray-700"
                >
                  <div className="h-2 w-2 rounded-full bg-[#4C856F]" />
                  <div className="flex-1">
                    <div className="text-white text-sm">{activity.description}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(activity.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recovery Phrase */}
      <Card className="bg-[#1a1a1a] border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Lock className="h-5 w-5 text-[#4C856F]" />
            Recovery Phrase
          </CardTitle>
          <CardDescription className="text-gray-400">
            Manage your wallet recovery phrase
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-yellow-200 font-medium mb-1">Important</div>
                <div className="text-sm text-yellow-200/80">
                  Recovery phrase management will be available in a future update. Never share your recovery phrase with anyone.
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Two-Factor Authentication */}
      <Card className="bg-[#1a1a1a] border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#4C856F]" />
            Two-Factor Authentication
          </CardTitle>
          <CardDescription className="text-gray-400">
            Add an extra layer of security to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-[#292929] rounded-lg border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white font-medium">2FA Status</div>
                <div className="text-sm text-gray-400 mt-1">Not enabled</div>
              </div>
              <Button
                variant="outline"
                disabled
                className="border-gray-700 text-gray-500"
              >
                Coming Soon
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

