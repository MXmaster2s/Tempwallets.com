'use client';

import { Home, User, LogIn, LogOut } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import Image from "next/image";

const UpperBar = () => {
  const { user, isAuthenticated, login, logout } = useAuth();

  return (
    <div className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-b from-black/60 via-black/50 to-black/40 backdrop-blur-md">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 lg:px-8 pt-8 lg:pt-6 pb-2">
        {/* Left Side - Profile Circle */}
        <div className="flex justify-start">
          {isAuthenticated && user ? (
            <div className="flex items-center gap-2 lg:gap-3">
              {user.picture ? (
                <Image
                  src={user.picture}
                  alt={user.name || 'User'}
                  width={40}
                  height={40}
                  className="rounded-full lg:w-12 lg:h-12"
                />
              ) : (
                <div className="flex items-center justify-center w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-gray-500/20 hover:bg-gray-500/30 transition-colors">
                  <User className="h-5 w-5 lg:h-6 lg:w-6 text-white" />
                </div>
              )}
              <button
                onClick={logout}
                className="flex items-center justify-center w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-gray-500/20 hover:bg-gray-500/30 transition-colors"
                title="Logout"
              >
                <LogOut className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              title="Login with Google"
            >
              <LogIn className="h-5 w-5 text-white" />
              <span className="hidden lg:inline text-white text-sm">Sign in with Google</span>
            </button>
          )}
        </div>

        {/* Center - Text Content */}
        <div className="text-center px-4">
          <h1 className="text-white text-lg lg:text-xl whitespace-nowrap">
            {isAuthenticated && user ? `Hello, ${user.name || user.email || 'User'}!` : 'Hello, User!'}
          </h1>
          <p className="text-gray-500 text-xs lg:text-sm font-light -mt-1">
            {isAuthenticated ? 'Welcome back' : 'Sign in to sync your wallets'}
          </p>
        </div>

        {/* Right Side - Home Icon */}
        <div className="flex justify-end">
          <Link href="/about" className="flex items-center justify-center w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-gray-500/20 hover:bg-gray-500/30 transition-colors">
            <Home className="h-5 w-5 lg:h-6 lg:w-6 text-white" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default UpperBar;