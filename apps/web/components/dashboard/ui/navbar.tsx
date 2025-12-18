"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@repo/ui/lib/utils";
import { Wallet } from "lucide-react";
// Temporarily hidden for MVP: TrendingUp, BarChart3, User

export default function DashboardNavbar() {
  const pathname = usePathname();

  const navItems = [
    {
      name: "Wallets",
      href: "/dashboard",
      icon: Wallet,
      id: "wallets",
    },
    // Temporarily hidden for MVP - will be re-enabled later
    // {
    //   name: "Transactions",
    //   href: "/transactions",
    //   icon: TrendingUp,
    //   id: "transactions",
    // },
    // {
    //   name: "Analytics",
    //   href: "/dashboard/analytics",
    //   icon: BarChart3,
    //   id: "analytics",
    // },
    // {
    //   name: "Profile",
    //   href: "/dashboard/profile",
    //   icon: User,
    //   id: "profile",
    // },
  ];

  return (
    <nav
      className={cn(
        "fixed z-50 animate-slide-up",
        // Mobile: bottom center with padding
        "bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-md",
        // Desktop: top center with padding
        "lg:top-6 lg:bottom-auto lg:w-auto lg:max-w-none"
      )}
    >
      <div
        className={cn(
          "bg-black/60 text-white",
          "rounded-full",
          "shadow-lg hover:shadow-xl",
          "px-6 py-2 lg:px-12 lg:py-3",
          "flex items-center justify-around lg:justify-center gap-2 lg:gap-12",
          "border border-white/20",
          "backdrop-blur-md",
          "transition-all duration-500 ease-out",
          "relative",
          // Gradient border effect
          "before:absolute before:inset-0 before:rounded-full before:p-[1px]",
          "before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent",
          "before:-z-10 before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-500"
        )}
      >
        {navItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "relative group transition-all duration-300 ease-out",
                "flex items-center justify-center lg:justify-start gap-2 lg:gap-3",
                "px-4 py-2.5 lg:px-6 lg:py-2.5 rounded-full",
                "transform hover:scale-105 active:scale-95",
                isActive
                  ? "bg-white/20 text-white shadow-lg scale-105"
                  : "hover:bg-white/10 text-white hover:text-white"
              )}
              style={{
                animationDelay: `${index * 0.1}s`,
              }}
              aria-label={item.name}
            >
              {/* Active indicator */}
              {isActive && (
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-white/30 via-white/20 to-white/30 animate-pulse" />
              )}
              
              <Icon
                className={cn(
                  "relative z-10 transition-all duration-300",
                  "w-5 h-5 lg:w-5 lg:h-5",
                  "group-hover:rotate-12 group-active:rotate-0"
                )}
                strokeWidth={isActive ? 2.5 : 2}
              />
              
              {/* Label visible on desktop */}
              <span className={cn(
                "relative z-10 hidden lg:block text-sm font-medium whitespace-nowrap transition-all",
                isActive && "font-semibold tracking-wide"
              )}>
                {item.name}
              </span>
              
              {/* Hover glow effect */}
              <div className={cn(
                "absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300",
                "bg-gradient-to-r from-transparent via-white/5 to-transparent"
              )} />
            </Link>
          );
        })}
      </div>

    </nav>
  );
}

