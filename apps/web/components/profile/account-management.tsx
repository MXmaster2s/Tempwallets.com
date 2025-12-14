"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/ui/alert-dialog";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Trash2, Download, AlertTriangle } from "lucide-react";
import { userApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function AccountManagement() {
  const { logout } = useAuth();
  const router = useRouter();
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "DELETE") {
      toast.error("Please type DELETE to confirm");
      return;
    }

    setDeleting(true);
    try {
      await userApi.deleteAccount();
      toast.success("Account deleted successfully");
      await logout();
      router.push("/");
    } catch (error) {
      console.error("Failed to delete account:", error);
      toast.error("Failed to delete account");
    } finally {
      setDeleting(false);
    }
  };

  const handleExportData = () => {
    // TODO: Implement data export
    toast.info("Data export will be available in a future update");
  };

  return (
    <div className="space-y-6">
      {/* Data Export */}
      <Card className="bg-[#1a1a1a] border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Download className="h-5 w-5 text-[#4C856F]" />
            Data Export
          </CardTitle>
          <CardDescription className="text-gray-400">
            Download a copy of your account data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-[#292929] rounded-lg border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white font-medium">Export Account Data</div>
                <div className="text-sm text-gray-400 mt-1">
                  Download all your account data in JSON format
                </div>
              </div>
              <Button
                onClick={handleExportData}
                variant="outline"
                className="border-gray-700 text-white hover:bg-[#4C856F] hover:border-[#4C856F]"
              >
                <Download className="h-4 w-4 mr-2" />
                Export Data
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Deletion */}
      <Card className="bg-[#1a1a1a] border-gray-800 border-red-900/50">
        <CardHeader>
          <CardTitle className="text-red-400 flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Delete Account
          </CardTitle>
          <CardDescription className="text-gray-400">
            Permanently delete your account and all associated data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg mb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-red-200 font-medium mb-1">Warning</div>
                <div className="text-sm text-red-200/80">
                  This action cannot be undone. All your wallets, transactions, and account data will be permanently deleted.
                </div>
              </div>
            </div>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                className="w-full bg-red-600 hover:bg-red-700 text-white"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-[#1a1a1a] border-gray-800">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-red-400">Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription className="text-gray-400">
                  This will permanently delete your account and all associated data. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="delete-confirm" className="text-gray-300">
                    Type <span className="font-mono text-red-400">DELETE</span> to confirm
                  </Label>
                  <Input
                    id="delete-confirm"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    className="bg-[#292929] border-gray-700 text-white"
                    placeholder="DELETE"
                  />
                </div>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-gray-700 text-gray-400 hover:text-white">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirm !== "DELETE" || deleting}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {deleting ? "Deleting..." : "Delete Account"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

