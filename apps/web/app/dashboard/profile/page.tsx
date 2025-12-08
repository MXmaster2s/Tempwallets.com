"use client";

import { useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/ui/tabs";
import { ProfileHeader } from "@/components/profile/profile-header";
import { PersonalInfoSection } from "@/components/profile/personal-info-section";
import { SecuritySettings } from "@/components/profile/security-settings";
import { WalletManagement } from "@/components/profile/wallet-management";
import { PreferencesSection } from "@/components/profile/preferences-section";
import { ActivityAnalytics } from "@/components/profile/activity-analytics";
import { AccountManagement } from "@/components/profile/account-management";
import { User, Shield, Wallet, Settings, Activity, Trash2 } from "lucide-react";

export default function ProfilePage() {
  useEffect(() => {
    console.log("✅ ProfilePage component loaded - VERSION 2.0");
    console.log("Current URL:", window.location.href);
    console.log("Timestamp:", new Date().toISOString());
  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-4 sm:p-6 lg:p-8">
      {/* CRITICAL TEST BANNER - MUST BE VISIBLE */}
      <div className="fixed top-0 left-0 right-0 bg-red-600 text-white p-4 text-center font-bold text-2xl z-[9999] border-4 border-yellow-400 shadow-2xl">
        🚨 NEW PROFILE PAGE V2.0 - LOADED AT {new Date().toLocaleTimeString()} 🚨
        <br />
        <span className="text-base">If you see this after sign-in, the update worked!</span>
      </div>
      
      <div className="pt-24 max-w-6xl mx-auto space-y-6">
        {/* Profile Header */}
        <ProfileHeader />

        {/* Tabs Navigation */}
        <Tabs defaultValue="personal" className="w-full">
          <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 bg-[#1a1a1a] border border-gray-800 rounded-lg p-1">
            <TabsTrigger
              value="personal"
              className="data-[state=active]:bg-[#4C856F] data-[state=active]:text-white text-gray-400"
            >
              <User className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Personal</span>
            </TabsTrigger>
            <TabsTrigger
              value="security"
              className="data-[state=active]:bg-[#4C856F] data-[state=active]:text-white text-gray-400"
            >
              <Shield className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
            <TabsTrigger
              value="wallets"
              className="data-[state=active]:bg-[#4C856F] data-[state=active]:text-white text-gray-400"
            >
              <Wallet className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Wallets</span>
            </TabsTrigger>
            <TabsTrigger
              value="preferences"
              className="data-[state=active]:bg-[#4C856F] data-[state=active]:text-white text-gray-400"
            >
              <Settings className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Preferences</span>
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="data-[state=active]:bg-[#4C856F] data-[state=active]:text-white text-gray-400"
            >
              <Activity className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Activity</span>
            </TabsTrigger>
            <TabsTrigger
              value="account"
              className="data-[state=active]:bg-[#4C856F] data-[state=active]:text-white text-gray-400"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Account</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="personal" className="mt-6">
            <PersonalInfoSection />
          </TabsContent>

          <TabsContent value="security" className="mt-6">
            <SecuritySettings />
          </TabsContent>

          <TabsContent value="wallets" className="mt-6">
            <WalletManagement />
          </TabsContent>

          <TabsContent value="preferences" className="mt-6">
            <PreferencesSection />
          </TabsContent>

          <TabsContent value="activity" className="mt-6">
            <ActivityAnalytics />
          </TabsContent>

          <TabsContent value="account" className="mt-6">
            <AccountManagement />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
