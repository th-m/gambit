/**
 * useScreenReaderAnnouncer Hook
 *
 * Provides ARIA live region announcements for screen reader users.
 * This hook manages a visually-hidden live region that announces
 * important game state changes without visual interruption.
 *
 * Features:
 * - Game phase changes announced
 * - Vote results announced
 * - Player turn announced
 * - Error messages announced
 * - Polite and assertive announcement modes
 *
 * Usage:
 * const { announce, announcePolite, announceAssertive, AnnouncerRegion } = useScreenReaderAnnouncer();
 *
 * // Announce politely (won't interrupt current announcements)
 * announcePolite('Leader approved! Proceeding to team selection.');
 *
 * // Announce assertively (interrupts current announcements)
 * announceAssertive('Mission failed! Evil scores a point.');
 *
 * // Render the invisible live region
 * return <AnnouncerRegion />;
 */

import { useCallback, useRef, useState, useEffect } from 'react';

// =============================================================================
// Types
// =============================================================================

export type AnnouncementPoliteness = 'polite' | 'assertive' | 'off';

export interface Announcement {
  message: string;
  politeness: AnnouncementPoliteness;
  timestamp: number;
}

export interface UseScreenReaderAnnouncerOptions {
  /** Delay between clearing and setting new message (ms) for screen reader detection */
  clearDelay?: number;
  /** Whether to dedupe rapid identical announcements (default: true) */
  dedupe?: boolean;
  /** Dedupe window in ms (default: 1000) */
  dedupeWindow?: number;
}

export interface UseScreenReaderAnnouncerReturn {
  /** General announce function */
  announce: (message: string, politeness?: AnnouncementPoliteness) => void;
  /** Polite announcement (won't interrupt) */
  announcePolite: (message: string) => void;
  /** Assertive announcement (interrupts) */
  announceAssertive: (message: string) => void;
  /** Clear the current announcement */
  clear: () => void;
  /** Current announcement state */
  currentAnnouncement: Announcement | null;
  /** The live region component to render */
  AnnouncerRegion: React.FC;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CLEAR_DELAY = 100;
const DEFAULT_DEDUPE_WINDOW = 1000;

// =============================================================================
// Hook Implementation
// =============================================================================

export function useScreenReaderAnnouncer(
  options: UseScreenReaderAnnouncerOptions = {}
): UseScreenReaderAnnouncerReturn {
  const {
    clearDelay = DEFAULT_CLEAR_DELAY,
    dedupe = true,
    dedupeWindow = DEFAULT_DEDUPE_WINDOW,
  } = options;

  // State for current announcement
  const [politeMessage, setPoliteMessage] = useState('');
  const [assertiveMessage, setAssertiveMessage] = useState('');
  const [currentAnnouncement, setCurrentAnnouncement] = useState<Announcement | null>(null);

  // Track last announcement for deduplication
  const lastAnnouncementRef = useRef<{ message: string; timestamp: number } | null>(null);

  // Clear pending timers on unmount
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
      }
    };
  }, []);

  const announce = useCallback(
    (message: string, politeness: AnnouncementPoliteness = 'polite') => {
      if (!message || politeness === 'off') return;

      // Dedupe check
      if (dedupe && lastAnnouncementRef.current) {
        const { message: lastMessage, timestamp: lastTime } = lastAnnouncementRef.current;
        if (lastMessage === message && Date.now() - lastTime < dedupeWindow) {
          return; // Skip duplicate
        }
      }

      // Update last announcement
      lastAnnouncementRef.current = { message, timestamp: Date.now() };

      // Clear any pending timer
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
      }

      // Clear message first (helps screen readers detect the change)
      const setMessage = politeness === 'assertive' ? setAssertiveMessage : setPoliteMessage;
      const clearMessage = politeness === 'assertive'
        ? () => setAssertiveMessage('')
        : () => setPoliteMessage('');

      clearMessage();

      // Set new message after short delay
      clearTimerRef.current = setTimeout(() => {
        setMessage(message);
        setCurrentAnnouncement({
          message,
          politeness,
          timestamp: Date.now(),
        });
      }, clearDelay);
    },
    [clearDelay, dedupe, dedupeWindow]
  );

  const announcePolite = useCallback(
    (message: string) => announce(message, 'polite'),
    [announce]
  );

  const announceAssertive = useCallback(
    (message: string) => announce(message, 'assertive'),
    [announce]
  );

  const clear = useCallback(() => {
    setPoliteMessage('');
    setAssertiveMessage('');
    setCurrentAnnouncement(null);
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
    }
  }, []);

  // The live region component
  const AnnouncerRegion: React.FC = useCallback(
    () => (
      <>
        {/* Polite live region - won't interrupt current speech */}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {politeMessage}
        </div>
        {/* Assertive live region - interrupts current speech */}
        <div
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="sr-only"
        >
          {assertiveMessage}
        </div>
      </>
    ),
    [politeMessage, assertiveMessage]
  );

  return {
    announce,
    announcePolite,
    announceAssertive,
    clear,
    currentAnnouncement,
    AnnouncerRegion,
  };
}

// =============================================================================
// Helper Functions for Common Announcements
// =============================================================================

/**
 * Format a game phase change announcement
 */
export function formatPhaseAnnouncement(
  phase: string,
  leaderName?: string,
  round?: number
): string {
  const roundPrefix = round ? `Round ${round}. ` : '';
  
  switch (phase) {
    case 'lobby':
      return 'Game is in lobby. Waiting for players to join.';
    case 'voting_for_leader':
      return leaderName
        ? `${roundPrefix}Leader vote phase. ${leaderName} is proposed as leader. Vote to approve or reject.`
        : `${roundPrefix}Leader vote phase. Vote to approve or reject the proposed leader.`;
    case 'selecting_team':
      return leaderName
        ? `${roundPrefix}Team selection phase. ${leaderName} is selecting the mission team.`
        : `${roundPrefix}Team selection phase. The leader is selecting the mission team.`;
    case 'mission_voting':
      return `${roundPrefix}Mission voting phase. Team members are voting on the mission.`;
    case 'resolution':
      return `${roundPrefix}Resolving mission results.`;
    case 'assassination':
      return 'Assassination phase. The Assassin is choosing a target.';
    default:
      return `Game phase: ${phase}`;
  }
}

/**
 * Format a vote result announcement
 */
export function formatVoteResultAnnouncement(
  type: 'leader' | 'mission',
  result: 'approved' | 'rejected' | 'passed' | 'failed',
  yesCount?: number,
  noCount?: number
): string {
  if (type === 'leader') {
    const voteInfo = yesCount !== undefined && noCount !== undefined
      ? ` with ${yesCount} approvals and ${noCount} rejections`
      : '';
    return result === 'approved'
      ? `Leader vote complete. Leader approved${voteInfo}. Proceeding to team selection.`
      : `Leader vote complete. Leader rejected${voteInfo}. Crown passes to next player.`;
  } else {
    const voteInfo = yesCount !== undefined && noCount !== undefined
      ? ` with ${yesCount} pass votes and ${noCount} fail votes`
      : '';
    return result === 'passed'
      ? `Mission complete. Mission passed${voteInfo}. Good team scores a point.`
      : `Mission complete. Mission failed${voteInfo}. Evil team scores a point.`;
  }
}

/**
 * Format a player turn announcement
 */
export function formatTurnAnnouncement(
  playerName: string,
  isCurrentPlayer: boolean,
  action: string
): string {
  if (isCurrentPlayer) {
    return `It's your turn. ${action}`;
  }
  return `${playerName}'s turn. ${action}`;
}

/**
 * Format a game over announcement
 */
export function formatGameOverAnnouncement(
  winner: 'good' | 'evil',
  endReason: string
): string {
  const winnerText = winner === 'good' ? 'Good team' : 'Evil team';
  return `Game over. ${winnerText} wins! ${endReason}`;
}

/**
 * Format a score update announcement
 */
export function formatScoreAnnouncement(
  goodVictories: number,
  evilVictories: number,
  round: number
): string {
  return `Round ${round} complete. Score: Good ${goodVictories}, Evil ${evilVictories}.`;
}

export default useScreenReaderAnnouncer;
