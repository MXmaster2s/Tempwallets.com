"use client";

import { useState } from "react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Edit2, Save, X, Mail, User as UserIcon, Calendar } from "lucide-react";
import { userApi } from "@/lib/api";
import { toast } from "sonner";

export function PersonalInfoSection() {
  const { profile, loading, refetch } = useUserProfile();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");
  const [picture, setPicture] = useState("");
  const [saving, setSaving] = useState(false);

  const handleEdit = () => {
    if (profile) {
      setName(profile.name || "");
      setPicture(profile.picture || "");
      setIsEditing(true);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (profile) {
      setName(profile.name || "");
      setPicture(profile.picture || "");
    }
  };

  const handleSave = async () => {
    if (!profile) return;

    setSaving(true);
    try {
      await userApi.updateProfile({
        name: name || undefined,
        picture: picture || undefined,
      });
      await refetch();
      setIsEditing(false);
      toast.success("Profile updated successfully");
    } catch (error) {
      console.error("Failed to update profile:", error);
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-[#1a1a1a] border-gray-800">
        <CardContent className="p-6">
          <Skeleton className="h-8 w-full mb-4" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[#1a1a1a] border-gray-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white">Personal Information</CardTitle>
            <CardDescription className="text-gray-400">
              Manage your personal details and account information
            </CardDescription>
          </div>
          {!isEditing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleEdit}
              className="text-[#4C856F] hover:text-[#4C856F] hover:bg-[#4C856F]/10"
            >
              <Edit2 className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isEditing ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="name" className="text-gray-300">
                Name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-[#292929] border-gray-700 text-white"
                placeholder="Enter your name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="picture" className="text-gray-300">
                Profile Picture URL
              </Label>
              <Input
                id="picture"
                value={picture}
                onChange={(e) => setPicture(e.target.value)}
                className="bg-[#292929] border-gray-700 text-white"
                placeholder="https://example.com/avatar.jpg"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-[#4C856F] hover:bg-[#4C856F]/90 text-white"
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                variant="ghost"
                onClick={handleCancel}
                disabled={saving}
                className="text-gray-400 hover:text-white"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-[#292929] rounded-lg border border-gray-700">
              <UserIcon className="h-5 w-5 text-gray-400" />
              <div className="flex-1">
                <div className="text-sm text-gray-400">Name</div>
                <div className="text-white font-medium">{profile?.name || "Not set"}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-[#292929] rounded-lg border border-gray-700">
              <Mail className="h-5 w-5 text-gray-400" />
              <div className="flex-1">
                <div className="text-sm text-gray-400">Email</div>
                <div className="text-white font-medium">{profile?.email || "Not set"}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-[#292929] rounded-lg border border-gray-700">
              <Calendar className="h-5 w-5 text-gray-400" />
              <div className="flex-1">
                <div className="text-sm text-gray-400">Account Created</div>
                <div className="text-white font-medium">
                  {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "N/A"}
                </div>
              </div>
            </div>
            {profile?.googleId && (
              <div className="flex items-center gap-3 p-4 bg-[#292929] rounded-lg border border-gray-700">
                <div className="flex-1">
                  <div className="text-sm text-gray-400">Linked Account</div>
                  <div className="text-white font-medium">Google Account</div>
                </div>
                <span className="text-xs bg-[#4C856F] text-white px-2 py-1 rounded-full">Connected</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

