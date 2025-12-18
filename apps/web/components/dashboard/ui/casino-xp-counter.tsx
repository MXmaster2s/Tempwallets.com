'use client';

import { useEffect, useState, useRef } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@repo/ui/lib/utils';

interface CasinoXPCounterProps {
  xp: number;
  loading?: boolean;
  className?: string;
}

export function CasinoXPCounter({ xp, loading = false, className }: CasinoXPCounterProps) {
  const [displayXP, setDisplayXP] = useState(xp);
  const [isAnimating, setIsAnimating] = useState(false);
  const previousXP = useRef<number>(xp);
  const animationRef = useRef<number | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitialized = useRef(false);

  useEffect(() => {
    // Skip animation logic while loading or on first render
    if (loading || !hasInitialized.current) {
      // Update display immediately while loading or on first render
      setDisplayXP(xp);
      if (!loading) {
        // Loading finished, mark as initialized
        previousXP.current = xp;
        hasInitialized.current = true;
      }
      return;
    }

    // Only animate if XP increased
    if (xp > previousXP.current) {
      const difference = xp - previousXP.current;
      setIsAnimating(true);

      // Ensure we start from the previous value (don't jump ahead)
      const startValue = previousXP.current;
      setDisplayXP(startValue); // Start animation from previous value
      
      const endValue = xp;
      const duration = Math.min(2000, 800 + difference * 50);
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Casino-style easing: fast start, slow end (like a slot machine)
        const easeOut = 1 - Math.pow(1 - progress, 3);
        
        // Add casino-style "rolling" effect with sine wave
        const rollEffect = Math.sin(progress * Math.PI * 8) * (difference * 0.15);
        const currentValue = Math.floor(startValue + (endValue - startValue) * easeOut + rollEffect);
        
        // Ensure we don't exceed the target
        setDisplayXP(Math.min(Math.max(currentValue, startValue), endValue));

        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          // Final snap to exact value
          setDisplayXP(endValue);
          // Keep animation state for a bit longer for visual effect
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          timeoutRef.current = setTimeout(() => {
            setIsAnimating(false);
            timeoutRef.current = null;
          }, 300);
          previousXP.current = xp;
        }
      };

      animationRef.current = requestAnimationFrame(animate);
    } else {
      // Just update immediately if XP decreased or stayed same
      setDisplayXP(xp);
      previousXP.current = xp;
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [xp, loading]);

  // Format number with commas
  const formatXP = (value: number) => {
    return value.toLocaleString('en-US');
  };

  return (
    <div
      className={cn(
        'relative flex items-center gap-1.5 px-3 py-1.5 rounded-full',
        'bg-gradient-to-r from-yellow-500/30 via-yellow-500/25 to-yellow-500/30',
        'border border-yellow-500/50 shadow-lg',
        'backdrop-blur-sm transition-all duration-300',
        isAnimating && 'animate-casino-glow border-yellow-400/80',
        className
      )}
      style={{
        boxShadow: isAnimating
          ? '0 0 20px rgba(234, 179, 8, 0.6), 0 0 40px rgba(234, 179, 8, 0.3), inset 0 0 20px rgba(234, 179, 8, 0.1)'
          : '0 0 10px rgba(234, 179, 8, 0.2)',
      }}
    >
      {/* Glowing star icon with casino spin */}
      <Star
        className={cn(
          'h-3.5 w-3.5 text-yellow-400 fill-yellow-400 transition-all duration-300',
          isAnimating && 'animate-casino-spin'
        )}
        style={{
          filter: isAnimating 
            ? 'drop-shadow(0 0 8px rgba(234, 179, 8, 0.8)) drop-shadow(0 0 4px rgba(234, 179, 8, 0.6))' 
            : 'drop-shadow(0 0 4px rgba(234, 179, 8, 0.3))',
        }}
      />

      {/* XP Number with casino-style animation */}
      <div className="relative overflow-hidden min-w-[2.5rem]">
        <span
          className={cn(
            'text-yellow-400 text-xs font-bold tabular-nums transition-all duration-200 inline-block',
            isAnimating && 'animate-casino-spin'
          )}
          style={{
            textShadow: isAnimating
              ? '0 0 10px rgba(234, 179, 8, 0.8), 0 0 20px rgba(234, 179, 8, 0.4)'
              : '0 0 10px rgba(234, 179, 8, 0.5)',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
            letterSpacing: '0.05em',
            transform: isAnimating ? 'scale(1.1)' : 'scale(1)',
          }}
        >
          {formatXP(displayXP)}
        </span>
        <span 
          className="text-yellow-400/70 text-xs font-semibold ml-1"
          style={{
            textShadow: isAnimating ? '0 0 5px rgba(234, 179, 8, 0.5)' : 'none',
          }}
        >
          XP
        </span>
      </div>

      {/* Animated sparkle effects when animating */}
      {isAnimating && (
        <>
          <div
            className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full animate-casino-sparkle"
            style={{ 
              animationDuration: '0.5s',
              boxShadow: '0 0 8px rgba(234, 179, 8, 0.8)',
            }}
          />
          <div
            className="absolute -bottom-1 -left-1 w-1.5 h-1.5 bg-yellow-400 rounded-full animate-casino-sparkle"
            style={{ 
              animationDuration: '0.7s', 
              animationDelay: '0.2s',
              boxShadow: '0 0 6px rgba(234, 179, 8, 0.8)',
            }}
          />
          <div
            className="absolute top-1/2 -right-2 w-1 h-1 bg-yellow-400 rounded-full animate-casino-sparkle"
            style={{ 
              animationDuration: '0.6s', 
              animationDelay: '0.1s',
              boxShadow: '0 0 4px rgba(234, 179, 8, 0.8)',
            }}
          />
        </>
      )}
    </div>
  );
}
