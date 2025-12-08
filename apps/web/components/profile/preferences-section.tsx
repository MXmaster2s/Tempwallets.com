"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { Label } from "@repo/ui/components/ui/label";
import { Switch } from "@repo/ui/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/components/ui/select";
import { Settings, Bell, Eye, Globe, Lock } from "lucide-react";
import { toast } from "sonner";

export function PreferencesSection() {
  // TODO: Implement preferences API integration
  const handlePreferenceChange = (key: string, value: any) => {
    // Placeholder for future implementation
    toast.info("Preferences will be saved automatically when implemented");
  };

  return (
    <div className="space-y-6">
      {/* Notification Preferences */}
      <Card className="bg-[#1a1a1a] border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Bell className="h-5 w-5 text-[#4C856F]" />
            Notification Preferences
          </CardTitle>
          <CardDescription className="text-gray-400">
            Control how you receive notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-[#292929] rounded-lg border border-gray-700">
            <div className="space-y-0.5">
              <Label htmlFor="email-notifications" className="text-white">
                Email Notifications
              </Label>
              <div className="text-sm text-gray-400">Receive notifications via email</div>
            </div>
            <Switch
              id="email-notifications"
              defaultChecked={true}
              onCheckedChange={(checked) => handlePreferenceChange("emailNotifications", checked)}
            />
          </div>
          <div className="flex items-center justify-between p-4 bg-[#292929] rounded-lg border border-gray-700">
            <div className="space-y-0.5">
              <Label htmlFor="push-notifications" className="text-white">
                Push Notifications
              </Label>
              <div className="text-sm text-gray-400">Receive browser push notifications</div>
            </div>
            <Switch
              id="push-notifications"
              defaultChecked={true}
              onCheckedChange={(checked) => handlePreferenceChange("pushNotifications", checked)}
            />
          </div>
          <div className="flex items-center justify-between p-4 bg-[#292929] rounded-lg border border-gray-700">
            <div className="space-y-0.5">
              <Label htmlFor="transaction-alerts" className="text-white">
                Transaction Alerts
              </Label>
              <div className="text-sm text-gray-400">Get notified about transaction updates</div>
            </div>
            <Switch
              id="transaction-alerts"
              defaultChecked={true}
              onCheckedChange={(checked) => handlePreferenceChange("transactionAlerts", checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Display Preferences */}
      <Card className="bg-[#1a1a1a] border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Eye className="h-5 w-5 text-[#4C856F]" />
            Display Preferences
          </CardTitle>
          <CardDescription className="text-gray-400">
            Customize your display settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-white">Currency</Label>
            <Select defaultValue="USD" onValueChange={(value) => handlePreferenceChange("currency", value)}>
              <SelectTrigger className="bg-[#292929] border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#292929] border-gray-700">
                <SelectItem value="USD">USD ($)</SelectItem>
                <SelectItem value="EUR">EUR (€)</SelectItem>
                <SelectItem value="GBP">GBP (£)</SelectItem>
                <SelectItem value="JPY">JPY (¥)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-white">Date Format</Label>
            <Select defaultValue="MM/DD/YYYY" onValueChange={(value) => handlePreferenceChange("dateFormat", value)}>
              <SelectTrigger className="bg-[#292929] border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#292929] border-gray-700">
                <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-white">Theme</Label>
            <Select defaultValue="dark" onValueChange={(value) => handlePreferenceChange("theme", value)}>
              <SelectTrigger className="bg-[#292929] border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#292929] border-gray-700">
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="auto">Auto</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Privacy Settings */}
      <Card className="bg-[#1a1a1a] border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Lock className="h-5 w-5 text-[#4C856F]" />
            Privacy Settings
          </CardTitle>
          <CardDescription className="text-gray-400">
            Control your privacy and data sharing preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-[#292929] rounded-lg border border-gray-700">
            <div className="space-y-0.5">
              <Label htmlFor="analytics" className="text-white">
                Analytics
              </Label>
              <div className="text-sm text-gray-400">Help improve the app by sharing usage data</div>
            </div>
            <Switch
              id="analytics"
              defaultChecked={true}
              onCheckedChange={(checked) => handlePreferenceChange("analyticsEnabled", checked)}
            />
          </div>
          <div className="flex items-center justify-between p-4 bg-[#292929] rounded-lg border border-gray-700">
            <div className="space-y-0.5">
              <Label htmlFor="data-sharing" className="text-white">
                Data Sharing
              </Label>
              <div className="text-sm text-gray-400">Allow sharing anonymized data with partners</div>
            </div>
            <Switch
              id="data-sharing"
              defaultChecked={false}
              onCheckedChange={(checked) => handlePreferenceChange("dataSharing", checked)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

