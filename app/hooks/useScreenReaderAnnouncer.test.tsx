/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useScreenReaderAnnouncer,
  formatPhaseAnnouncement,
  formatVoteResultAnnouncement,
  formatTurnAnnouncement,
  formatGameOverAnnouncement,
  formatScoreAnnouncement,
} from './useScreenReaderAnnouncer';

describe('useScreenReaderAnnouncer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('announce', () => {
    it('should announce polite messages by default', async () => {
      const { result } = renderHook(() => useScreenReaderAnnouncer());

      act(() => {
        result.current.announce('Test message');
        vi.advanceTimersByTime(150);
      });

      expect(result.current.currentAnnouncement).toEqual({
        message: 'Test message',
        politeness: 'polite',
        timestamp: expect.any(Number),
      });
    });

    it('should announce assertive messages when specified', async () => {
      const { result } = renderHook(() => useScreenReaderAnnouncer());

      act(() => {
        result.current.announce('Urgent message', 'assertive');
        vi.advanceTimersByTime(150);
      });

      expect(result.current.currentAnnouncement?.politeness).toBe('assertive');
      expect(result.current.currentAnnouncement?.message).toBe('Urgent message');
    });

    it('should not announce when politeness is off', async () => {
      const { result } = renderHook(() => useScreenReaderAnnouncer());

      act(() => {
        result.current.announce('Silent message', 'off');
        vi.advanceTimersByTime(150);
      });

      expect(result.current.currentAnnouncement).toBeNull();
    });

    it('should not announce empty messages', async () => {
      const { result } = renderHook(() => useScreenReaderAnnouncer());

      act(() => {
        result.current.announce('');
        vi.advanceTimersByTime(150);
      });

      expect(result.current.currentAnnouncement).toBeNull();
    });
  });

  describe('announcePolite', () => {
    it('should announce with polite politeness', async () => {
      const { result } = renderHook(() => useScreenReaderAnnouncer());

      act(() => {
        result.current.announcePolite('Polite message');
        vi.advanceTimersByTime(150);
      });

      expect(result.current.currentAnnouncement?.politeness).toBe('polite');
      expect(result.current.currentAnnouncement?.message).toBe('Polite message');
    });
  });

  describe('announceAssertive', () => {
    it('should announce with assertive politeness', async () => {
      const { result } = renderHook(() => useScreenReaderAnnouncer());

      act(() => {
        result.current.announceAssertive('Assertive message');
        vi.advanceTimersByTime(150);
      });

      expect(result.current.currentAnnouncement?.politeness).toBe('assertive');
      expect(result.current.currentAnnouncement?.message).toBe('Assertive message');
    });
  });

  describe('clear', () => {
    it('should clear current announcement', async () => {
      const { result } = renderHook(() => useScreenReaderAnnouncer());

      act(() => {
        result.current.announcePolite('Message to clear');
        vi.advanceTimersByTime(150);
      });

      expect(result.current.currentAnnouncement).not.toBeNull();

      act(() => {
        result.current.clear();
      });

      expect(result.current.currentAnnouncement).toBeNull();
    });
  });

  describe('deduplication', () => {
    it('should dedupe rapid identical announcements by default', async () => {
      const { result } = renderHook(() => useScreenReaderAnnouncer());

      act(() => {
        result.current.announcePolite('Duplicate message');
        vi.advanceTimersByTime(150);
      });

      const firstTimestamp = result.current.currentAnnouncement?.timestamp;

      act(() => {
        result.current.announcePolite('Duplicate message');
        vi.advanceTimersByTime(150);
      });

      // Timestamp should not change because message was deduped
      expect(result.current.currentAnnouncement?.timestamp).toBe(firstTimestamp);
    });

    it('should allow duplicate after dedupe window', async () => {
      const { result } = renderHook(() => useScreenReaderAnnouncer({ dedupeWindow: 500 }));

      act(() => {
        result.current.announcePolite('Duplicate message');
        vi.advanceTimersByTime(150);
      });

      const firstTimestamp = result.current.currentAnnouncement?.timestamp;

      act(() => {
        vi.advanceTimersByTime(600); // Past dedupe window
        result.current.announcePolite('Duplicate message');
        vi.advanceTimersByTime(150);
      });

      // Timestamp should change because we're past the dedupe window
      expect(result.current.currentAnnouncement?.timestamp).toBeGreaterThan(firstTimestamp!);
    });

    it('should not dedupe when dedupe is disabled', async () => {
      const { result } = renderHook(() => useScreenReaderAnnouncer({ dedupe: false }));

      act(() => {
        result.current.announcePolite('Duplicate message');
        vi.advanceTimersByTime(150);
      });

      const firstTimestamp = result.current.currentAnnouncement?.timestamp;

      act(() => {
        vi.advanceTimersByTime(50); // Small delay
        result.current.announcePolite('Duplicate message');
        vi.advanceTimersByTime(150);
      });

      // Timestamp should change because dedupe is disabled
      expect(result.current.currentAnnouncement?.timestamp).toBeGreaterThan(firstTimestamp!);
    });

    it('should not dedupe different messages', async () => {
      const { result } = renderHook(() => useScreenReaderAnnouncer());

      act(() => {
        result.current.announcePolite('First message');
        vi.advanceTimersByTime(150);
      });

      expect(result.current.currentAnnouncement?.message).toBe('First message');

      act(() => {
        result.current.announcePolite('Second message');
        vi.advanceTimersByTime(150);
      });

      expect(result.current.currentAnnouncement?.message).toBe('Second message');
    });
  });

  describe('clearDelay option', () => {
    it('should respect custom clearDelay', async () => {
      const { result } = renderHook(() => useScreenReaderAnnouncer({ clearDelay: 200 }));

      act(() => {
        result.current.announcePolite('Delayed message');
        vi.advanceTimersByTime(100); // Before delay
      });

      // Should not be set yet
      expect(result.current.currentAnnouncement).toBeNull();

      act(() => {
        vi.advanceTimersByTime(150); // After delay
      });

      expect(result.current.currentAnnouncement?.message).toBe('Delayed message');
    });
  });

  describe('AnnouncerRegion', () => {
    it('should return a component that renders live regions', async () => {
      const { result } = renderHook(() => useScreenReaderAnnouncer());
      
      expect(result.current.AnnouncerRegion).toBeDefined();
      expect(typeof result.current.AnnouncerRegion).toBe('function');
    });
  });
});

// =============================================================================
// Format Functions Tests
// =============================================================================

describe('formatPhaseAnnouncement', () => {
  it('should format lobby phase', () => {
    const announcement = formatPhaseAnnouncement('lobby');
    expect(announcement).toBe('Game is in lobby. Waiting for players to join.');
  });

  it('should format voting_for_leader phase with leader name', () => {
    const announcement = formatPhaseAnnouncement('voting_for_leader', 'Alice', 2);
    expect(announcement).toBe('Round 2. Leader vote phase. Alice is proposed as leader. Vote to approve or reject.');
  });

  it('should format voting_for_leader phase without leader name', () => {
    const announcement = formatPhaseAnnouncement('voting_for_leader');
    expect(announcement).toBe('Leader vote phase. Vote to approve or reject the proposed leader.');
  });

  it('should format selecting_team phase with leader name', () => {
    const announcement = formatPhaseAnnouncement('selecting_team', 'Bob', 3);
    expect(announcement).toBe('Round 3. Team selection phase. Bob is selecting the mission team.');
  });

  it('should format selecting_team phase without leader name', () => {
    const announcement = formatPhaseAnnouncement('selecting_team');
    expect(announcement).toBe('Team selection phase. The leader is selecting the mission team.');
  });

  it('should format mission_voting phase', () => {
    const announcement = formatPhaseAnnouncement('mission_voting', undefined, 4);
    expect(announcement).toBe('Round 4. Mission voting phase. Team members are voting on the mission.');
  });

  it('should format resolution phase', () => {
    const announcement = formatPhaseAnnouncement('resolution', undefined, 5);
    expect(announcement).toBe('Round 5. Resolving mission results.');
  });

  it('should format assassination phase', () => {
    const announcement = formatPhaseAnnouncement('assassination');
    expect(announcement).toBe('Assassination phase. The Assassin is choosing a target.');
  });

  it('should format unknown phase', () => {
    const announcement = formatPhaseAnnouncement('unknown_phase');
    expect(announcement).toBe('Game phase: unknown_phase');
  });
});

describe('formatVoteResultAnnouncement', () => {
  it('should format leader approved with counts', () => {
    const announcement = formatVoteResultAnnouncement('leader', 'approved', 4, 2);
    expect(announcement).toBe('Leader vote complete. Leader approved with 4 approvals and 2 rejections. Proceeding to team selection.');
  });

  it('should format leader rejected with counts', () => {
    const announcement = formatVoteResultAnnouncement('leader', 'rejected', 2, 4);
    expect(announcement).toBe('Leader vote complete. Leader rejected with 2 approvals and 4 rejections. Crown passes to next player.');
  });

  it('should format leader approved without counts', () => {
    const announcement = formatVoteResultAnnouncement('leader', 'approved');
    expect(announcement).toBe('Leader vote complete. Leader approved. Proceeding to team selection.');
  });

  it('should format mission passed with counts', () => {
    const announcement = formatVoteResultAnnouncement('mission', 'passed', 3, 0);
    expect(announcement).toBe('Mission complete. Mission passed with 3 pass votes and 0 fail votes. Good team scores a point.');
  });

  it('should format mission failed with counts', () => {
    const announcement = formatVoteResultAnnouncement('mission', 'failed', 2, 1);
    expect(announcement).toBe('Mission complete. Mission failed with 2 pass votes and 1 fail votes. Evil team scores a point.');
  });

  it('should format mission passed without counts', () => {
    const announcement = formatVoteResultAnnouncement('mission', 'passed');
    expect(announcement).toBe('Mission complete. Mission passed. Good team scores a point.');
  });
});

describe('formatTurnAnnouncement', () => {
  it('should format current player turn', () => {
    const announcement = formatTurnAnnouncement('Alice', true, 'Select the mission team.');
    expect(announcement).toBe("It's your turn. Select the mission team.");
  });

  it('should format other player turn', () => {
    const announcement = formatTurnAnnouncement('Bob', false, 'Selecting the mission team.');
    expect(announcement).toBe("Bob's turn. Selecting the mission team.");
  });
});

describe('formatGameOverAnnouncement', () => {
  it('should format good team victory', () => {
    const announcement = formatGameOverAnnouncement('good', 'The Assassin failed to identify the Seer.');
    expect(announcement).toBe('Game over. Good team wins! The Assassin failed to identify the Seer.');
  });

  it('should format evil team victory', () => {
    const announcement = formatGameOverAnnouncement('evil', 'The Seer has been assassinated.');
    expect(announcement).toBe('Game over. Evil team wins! The Seer has been assassinated.');
  });
});

describe('formatScoreAnnouncement', () => {
  it('should format score announcement', () => {
    const announcement = formatScoreAnnouncement(2, 1, 3);
    expect(announcement).toBe('Round 3 complete. Score: Good 2, Evil 1.');
  });

  it('should format initial score', () => {
    const announcement = formatScoreAnnouncement(0, 0, 1);
    expect(announcement).toBe('Round 1 complete. Score: Good 0, Evil 0.');
  });

  it('should format winning score', () => {
    const announcement = formatScoreAnnouncement(3, 2, 5);
    expect(announcement).toBe('Round 5 complete. Score: Good 3, Evil 2.');
  });
});
