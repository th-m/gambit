/**
 * useVibration - Hook for handling device vibration on beeper activation.
 * Subscribes to a vibration broadcast channel and triggers navigator.vibrate()
 * when the current player is in the vibration targets.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { createClient } from '~/lib/supabase/client';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export interface VibrationEvent {
  /** Type of vibration event */
  type: 'beeper_triggered';
  /** Game ID the event belongs to */
  gameId: string;
  /** Round when the beeper was triggered */
  round: number;
  /** Player IDs that should vibrate */
  targetPlayerIds: string[];
}

export interface UseVibrationResult {
  /** Whether vibration is supported on this device */
  isSupported: boolean;
  /** Whether the hook is currently subscribed to events */
  isSubscribed: boolean;
  /** Number of times vibration has been triggered this session */
  vibrationCount: number;
  /** Last error message, if any */
  error: string | null;
  /** Manually trigger vibration (for testing) */
  triggerVibration: () => void;
}

export interface UseVibrationOptions {
  /** Whether vibration is enabled (default: true) */
  enabled?: boolean;
  /** Vibration pattern in milliseconds (default: [200, 100, 200]) */
  pattern?: number | number[];
  /** Callback when vibration is triggered */
  onVibration?: (event: VibrationEvent) => void;
}

// =============================================================================
// Constants
// =============================================================================

/** Default vibration pattern: vibrate 200ms, pause 100ms, vibrate 200ms */
const DEFAULT_VIBRATION_PATTERN = [200, 100, 200];

/** Channel name prefix for vibration broadcasts */
const VIBRATION_CHANNEL_PREFIX = 'vibration';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Checks if the Vibration API is supported in the current environment.
 */
function checkVibrationSupport(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

/**
 * Safely triggers device vibration with graceful fallback.
 */
function triggerDeviceVibration(pattern: number | number[]): boolean {
  if (!checkVibrationSupport()) {
    return false;
  }

  try {
    return navigator.vibrate(pattern);
  } catch {
    // Some browsers may throw on vibration API call
    return false;
  }
}

// =============================================================================
// Hook
// =============================================================================

export function useVibration(
  gameId: string,
  playerId: string,
  options: UseVibrationOptions = {}
): UseVibrationResult {
  const { enabled = true, pattern = DEFAULT_VIBRATION_PATTERN, onVibration } = options;

  // State
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [vibrationCount, setVibrationCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Check vibration support once on mount
  const isSupported = checkVibrationSupport();

  // Refs for subscription management
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Manual trigger function for testing
  const triggerVibration = useCallback(() => {
    const success = triggerDeviceVibration(pattern);
    if (success) {
      setVibrationCount((prev) => prev + 1);
    }
  }, [pattern]);

  // Handle vibration event
  const handleVibrationEvent = useCallback(
    (event: VibrationEvent) => {
      // Only process events for this game
      if (event.gameId !== gameId) return;

      // Check if this player is in the targets
      if (!event.targetPlayerIds.includes(playerId)) return;

      // Trigger vibration
      const success = triggerDeviceVibration(pattern);
      if (success) {
        setVibrationCount((prev) => prev + 1);
      }

      // Call optional callback
      onVibration?.(event);
    },
    [gameId, playerId, pattern, onVibration]
  );

  // =============================================================================
  // Subscription Effect
  // =============================================================================

  useEffect(() => {
    // Skip if disabled or no IDs provided
    if (!enabled || !gameId || !playerId) {
      setIsSubscribed(false);
      return;
    }

    // Initialize Supabase client
    const supabase = createClient();
    supabaseRef.current = supabase;

    // Create channel name unique to this game
    const channelName = `${VIBRATION_CHANNEL_PREFIX}-${gameId}`;

    // Subscribe to broadcast channel
    const channel = supabase
      .channel(channelName)
      .on('broadcast', { event: 'vibration' }, (payload) => {
        try {
          const event = payload.payload as VibrationEvent;
          handleVibrationEvent(event);
        } catch (err) {
          setError(`Failed to process vibration event: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsSubscribed(true);
          setError(null);
        } else if (status === 'CHANNEL_ERROR') {
          setError('Failed to subscribe to vibration channel');
          setIsSubscribed(false);
        }
      });

    channelRef.current = channel;

    // Cleanup on unmount or when dependencies change
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setIsSubscribed(false);
    };
  }, [enabled, gameId, playerId, handleVibrationEvent]);

  return {
    isSupported,
    isSubscribed,
    vibrationCount,
    error,
    triggerVibration,
  };
}

// =============================================================================
// Server-side helper for triggering vibration broadcasts
// =============================================================================

/**
 * Sends a vibration broadcast to all clients subscribed to a game's vibration channel.
 * This should be called server-side (e.g., in VoteProcessor) when beeper triggers.
 *
 * @param supabase - Supabase client instance
 * @param gameId - Game ID to broadcast to
 * @param round - Current round number
 * @param targetPlayerIds - Player IDs that should vibrate
 */
export async function broadcastVibration(
  supabase: SupabaseClient,
  gameId: string,
  round: number,
  targetPlayerIds: string[]
): Promise<void> {
  if (targetPlayerIds.length === 0) return;

  const channelName = `${VIBRATION_CHANNEL_PREFIX}-${gameId}`;
  const event: VibrationEvent = {
    type: 'beeper_triggered',
    gameId,
    round,
    targetPlayerIds,
  };

  await supabase.channel(channelName).send({
    type: 'broadcast',
    event: 'vibration',
    payload: event,
  });
}
