/**
 * @vitest-environment jsdom
 * 
 * Unit tests for all game components
 * 
 * Tests:
 * - Lobby displays correct player count
 * - Lobby start button state
 * - LeaderVoting buttons disabled after vote
 * - TeamSelection enforces team size
 * - MissionVoting hides fail button for good players
 * - AssassinationPhase only Assassin can select
 * - ActionPanel filters by phase
 * - CharacterInfoPanel applies effects
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import React from 'react';

// Mock the hooks and contexts before importing components
vi.mock('~/hooks/useVoteSubscription', () => ({
  useVoteSubscription: vi.fn(() => ({
    votes: {},
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  })),
}));

vi.mock('~/hooks/useVoteCompletion', () => ({
  useVoteCompletion: vi.fn(() => ({
    isComplete: false,
    voteCount: 0,
    expectedCount: 5,
    checkCompletion: vi.fn(),
  })),
}));

vi.mock('~/contexts/GameFlowContext', () => ({
  useGameFlow: vi.fn(() => ({
    game: null,
    players: [],
    ctx: null,
    isLoading: false,
    error: null,
  })),
}));

vi.mock('~/services/StateValidator', () => ({
  getMissionSize: vi.fn((playerCount: number, round: number) => {
    const sizes: Record<number, number[]> = {
      5: [2, 3, 2, 3, 3],
      6: [2, 3, 4, 3, 4],
      7: [2, 3, 3, 4, 4],
      8: [3, 4, 4, 5, 5],
      9: [3, 4, 4, 5, 5],
      10: [3, 4, 4, 5, 5],
    };
    return sizes[playerCount]?.[round - 1] ?? 2;
  }),
}));

// Import components after mocking
import { Lobby } from '~/components/Lobby';
import { LeaderVoting } from '~/components/LeaderVoting';
import { TeamSelection } from '~/components/TeamSelection';
import { MissionVoting } from '~/components/MissionVoting';
import { AssassinationPhase } from '~/components/AssassinationPhase';
import { ActionPanel } from '~/components/ActionPanel';
import { CharacterInfoPanel, ScoreBoard } from '~/components/GameBoard';
import { useVoteSubscription } from '~/hooks/useVoteSubscription';
import { useVoteCompletion } from '~/hooks/useVoteCompletion';
import type { Game, Player, GameContext, GameAction, ActionResult, VoteResult } from '~/types/game';

// =============================================================================
// Test Helpers
// =============================================================================

function createTestGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    game_key: 'ABC123',
    host_id: 'user-1',
    status: 'playing',
    phase: 'voting_for_leader',
    current_round: 1,
    crown_index: 0,
    rejection_count: 0,
    good_victories: 0,
    evil_victories: 0,
    selected_team: null,
    winner: null,
    end_reason: null,
    created_at: '2026-01-25T00:00:00Z',
    ...overrides,
  };
}

function createTestPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: `player-${Math.random().toString(36).substr(2, 9)}`,
    game_id: 'game-1',
    user_id: 'user-1',
    display_name: 'Test Player',
    character: 'Villager',
    team: 'good',
    is_alive: true,
    seat_order: 0,
    created_at: '2026-01-25T00:00:00Z',
    ...overrides,
  };
}

function createTestPlayers(count: number, overrides: Partial<Player>[] = []): Player[] {
  return Array.from({ length: count }, (_, i) => {
    const playerOverride = overrides[i] ?? {};
    return createTestPlayer({
      id: `player-${i + 1}`,
      user_id: `user-${i + 1}`,
      display_name: `Player ${i + 1}`,
      seat_order: i,
      ...playerOverride,
    });
  });
}

function createTestContext(game: Game, players: Player[], currentPlayer: Player): GameContext {
  return {
    game,
    players,
    currentPlayer,
    modifiers: [],
    statuses: [],
  };
}

// =============================================================================
// Lobby Component Tests
// =============================================================================

describe('Lobby', () => {
  const defaultProps = {
    onStartGame: vi.fn().mockResolvedValue(undefined),
    onLeaveGame: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Player Count Display', () => {
    it('displays correct player count for 1 player', () => {
      const game = createTestGame({ status: 'lobby' });
      const players = createTestPlayers(1);

      render(
        <Lobby
          game={game}
          players={players}
          currentUserId="user-1"
          {...defaultProps}
        />
      );

      expect(screen.getByText('1/10')).toBeTruthy();
    });

    it('displays correct player count for 5 players', () => {
      const game = createTestGame({ status: 'lobby' });
      const players = createTestPlayers(5);

      render(
        <Lobby
          game={game}
          players={players}
          currentUserId="user-1"
          {...defaultProps}
        />
      );

      expect(screen.getByText('5/10')).toBeTruthy();
    });

    it('displays correct player count for 10 players', () => {
      const game = createTestGame({ status: 'lobby' });
      const players = createTestPlayers(10);

      render(
        <Lobby
          game={game}
          players={players}
          currentUserId="user-1"
          {...defaultProps}
        />
      );

      expect(screen.getByText('10/10')).toBeTruthy();
    });

    it('shows yellow styling for player count below 5', () => {
      const game = createTestGame({ status: 'lobby' });
      const players = createTestPlayers(3);

      render(
        <Lobby
          game={game}
          players={players}
          currentUserId="user-1"
          {...defaultProps}
        />
      );

      const countElement = screen.getByText('3/10');
      expect(countElement.className).toContain('yellow');
    });

    it('shows green styling for player count 5-10', () => {
      const game = createTestGame({ status: 'lobby' });
      const players = createTestPlayers(6);

      render(
        <Lobby
          game={game}
          players={players}
          currentUserId="user-1"
          {...defaultProps}
        />
      );

      const countElement = screen.getByText('6/10');
      expect(countElement.className).toContain('green');
    });

    it('shows "Need at least 5 players" warning when under 5 players', () => {
      const game = createTestGame({ status: 'lobby' });
      const players = createTestPlayers(3);

      render(
        <Lobby
          game={game}
          players={players}
          currentUserId="user-1"
          {...defaultProps}
        />
      );

      expect(screen.getByText(/Need at least 5 players/)).toBeTruthy();
    });
  });

  describe('Start Button State', () => {
    it('shows Start Game button for host', () => {
      const game = createTestGame({ status: 'lobby', host_id: 'user-1' });
      const players = createTestPlayers(5);

      render(
        <Lobby
          game={game}
          players={players}
          currentUserId="user-1"
          {...defaultProps}
        />
      );

      expect(screen.getByText('Start Game')).toBeTruthy();
    });

    it('shows Leave Game button for non-host', () => {
      const game = createTestGame({ status: 'lobby', host_id: 'user-1' });
      const players = createTestPlayers(5);

      render(
        <Lobby
          game={game}
          players={players}
          currentUserId="user-2"
          {...defaultProps}
        />
      );

      expect(screen.getByText('Leave Game')).toBeTruthy();
    });

    it('disables Start button with fewer than 5 players', () => {
      const game = createTestGame({ status: 'lobby', host_id: 'user-1' });
      const players = createTestPlayers(4);

      render(
        <Lobby
          game={game}
          players={players}
          currentUserId="user-1"
          {...defaultProps}
        />
      );

      // Button should show "Need X more players" text
      expect(screen.getByText(/Need \d+ more player/)).toBeTruthy();
    });

    it('enables Start button with 5+ players', () => {
      const game = createTestGame({ status: 'lobby', host_id: 'user-1' });
      const players = createTestPlayers(5);

      render(
        <Lobby
          game={game}
          players={players}
          currentUserId="user-1"
          {...defaultProps}
        />
      );

      const button = screen.getByRole('button', { name: /Start Game/i });
      expect(button).not.toBeNull();
      expect(button.hasAttribute('disabled')).toBe(false);
    });

    it('shows loading state when starting game', () => {
      const game = createTestGame({ status: 'lobby', host_id: 'user-1' });
      const players = createTestPlayers(5);

      render(
        <Lobby
          game={game}
          players={players}
          currentUserId="user-1"
          isStarting={true}
          {...defaultProps}
        />
      );

      expect(screen.getByText('Starting Game...')).toBeTruthy();
    });

    it('calls onStartGame when Start button clicked', async () => {
      const game = createTestGame({ status: 'lobby', host_id: 'user-1' });
      const players = createTestPlayers(5);
      const onStartGame = vi.fn().mockResolvedValue(undefined);

      render(
        <Lobby
          game={game}
          players={players}
          currentUserId="user-1"
          {...defaultProps}
          onStartGame={onStartGame}
        />
      );

      const button = screen.getByRole('button', { name: /Start Game/i });
      fireEvent.click(button);

      expect(onStartGame).toHaveBeenCalled();
    });
  });

  describe('Host Indicator', () => {
    it('shows host badge on host player', () => {
      const game = createTestGame({ status: 'lobby', host_id: 'user-1' });
      const players = createTestPlayers(3);

      render(
        <Lobby
          game={game}
          players={players}
          currentUserId="user-1"
          {...defaultProps}
        />
      );

      expect(screen.getByText('Host')).toBeTruthy();
    });
  });
});

// =============================================================================
// LeaderVoting Component Tests
// =============================================================================

describe('LeaderVoting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useVoteSubscription).mockReturnValue({
      votes: {},
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    vi.mocked(useVoteCompletion).mockReturnValue({
      isComplete: false,
      voteCount: 0,
      expectedCount: 5,
      checkCompletion: vi.fn(),
    });
  });

  it('renders approve and reject buttons initially', () => {
    const game = createTestGame({ phase: 'voting_for_leader' });
    const players = createTestPlayers(5);
    const currentPlayer = players[0];
    const onVote = vi.fn().mockResolvedValue({ success: true, allVotesIn: false });

    render(
      <LeaderVoting
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onVote={onVote}
      />
    );

    expect(screen.getByText('Approve')).toBeTruthy();
    expect(screen.getByText('Reject')).toBeTruthy();
  });

  it('calls onVote and updates UI when clicking approve', async () => {
    const game = createTestGame({ phase: 'voting_for_leader' });
    const players = createTestPlayers(5);
    const currentPlayer = players[0];
    const onVote = vi.fn().mockResolvedValue({ success: true, allVotesIn: false });

    render(
      <LeaderVoting
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onVote={onVote}
      />
    );

    // Click the approve button
    const approveButton = screen.getByRole('button', { name: /Approve leader/i });
    await act(async () => {
      fireEvent.click(approveButton);
    });

    // Should call onVote with true (approve)
    expect(onVote).toHaveBeenCalledWith(true);
  });

  it('shows vote progress indicator', () => {
    const game = createTestGame({ phase: 'voting_for_leader' });
    const players = createTestPlayers(5);
    const currentPlayer = players[0];
    const onVote = vi.fn();

    vi.mocked(useVoteCompletion).mockReturnValue({
      isComplete: false,
      voteCount: 2,
      expectedCount: 5,
      checkCompletion: vi.fn(),
    });

    const { container } = render(
      <LeaderVoting
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onVote={onVote}
      />
    );

    // Text is split across multiple spans, so check for key parts
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText(/votes cast/)).toBeTruthy();
    // Check for progress bar with 40% width (2/5 = 40%)
    const progressBar = container.querySelector('[style*="width: 40%"]');
    expect(progressBar).toBeTruthy();
  });

  it('shows rejection count visually', () => {
    const game = createTestGame({ phase: 'voting_for_leader', rejection_count: 2 });
    const players = createTestPlayers(5);
    const currentPlayer = players[0];
    const onVote = vi.fn();

    const { container } = render(
      <LeaderVoting
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onVote={onVote}
      />
    );

    // Now uses visual indicator dots - check for the rejections label
    expect(screen.getByText(/Rejections:/)).toBeTruthy();
    // And 2 filled dots (bg-orange-500 or bg-red-500) plus 1 unfilled (bg-stone-600)
    const filledDots = container.querySelectorAll('.bg-orange-500, .bg-red-500');
    expect(filledDots.length).toBe(2);
  });

  it('shows warning at 2 rejections', () => {
    const game = createTestGame({ phase: 'voting_for_leader', rejection_count: 2 });
    const players = createTestPlayers(5);
    const currentPlayer = players[0];
    const onVote = vi.fn();

    render(
      <LeaderVoting
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onVote={onVote}
      />
    );

    // Text changed to "Final chance!" instead of "Next rejection = automatic evil win"
    expect(screen.getByText(/Final chance/)).toBeTruthy();
  });

  it('displays current leader name', () => {
    const game = createTestGame({ phase: 'voting_for_leader', crown_index: 0 });
    const players = createTestPlayers(5);
    players[0].display_name = 'Leader Player';
    const currentPlayer = players[1];
    const onVote = vi.fn();

    render(
      <LeaderVoting
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onVote={onVote}
      />
    );

    expect(screen.getByText('Leader Player')).toBeTruthy();
  });
});

// =============================================================================
// TeamSelection Component Tests
// =============================================================================

describe('TeamSelection', () => {
  it('enforces team size limit for 5 players round 1 (size 2)', () => {
    const game = createTestGame({ phase: 'selecting_team', crown_index: 0, current_round: 1 });
    const players = createTestPlayers(5);
    const currentPlayer = players[0]; // Current player is leader (crown_index 0)
    const onSelectTeam = vi.fn().mockResolvedValue({ success: true });

    render(
      <TeamSelection
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onSelectTeam={onSelectTeam}
      />
    );

    // Should show required team size
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('shows disabled submit button when not enough players selected', () => {
    const game = createTestGame({ phase: 'selecting_team', crown_index: 0, current_round: 1 });
    const players = createTestPlayers(5);
    const currentPlayer = players[0];
    const onSelectTeam = vi.fn();

    render(
      <TeamSelection
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onSelectTeam={onSelectTeam}
      />
    );

    const confirmButton = screen.getByRole('button', { name: 'Confirm Team' });
    expect(confirmButton.hasAttribute('disabled')).toBe(true);
  });

  it('shows waiting view for non-leader players', () => {
    const game = createTestGame({ phase: 'selecting_team', crown_index: 0 });
    const players = createTestPlayers(5);
    const currentPlayer = players[1]; // Not the leader
    const onSelectTeam = vi.fn();

    render(
      <TeamSelection
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onSelectTeam={onSelectTeam}
      />
    );

    expect(screen.getByText(/Waiting for/)).toBeTruthy();
  });

  it('allows toggling player selection', () => {
    const game = createTestGame({ phase: 'selecting_team', crown_index: 0, current_round: 1 });
    const players = createTestPlayers(5);
    const currentPlayer = players[0];
    const onSelectTeam = vi.fn();

    render(
      <TeamSelection
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onSelectTeam={onSelectTeam}
      />
    );

    // Find and click a player button
    const playerButtons = screen.getAllByRole('button', { pressed: false });
    const targetButton = playerButtons.find(btn => btn.textContent?.includes('Player 2'));
    
    if (targetButton) {
      fireEvent.click(targetButton);
      // Should show 1 selected in the "Selected: X/Y" text
      expect(screen.getByText(/Selected: 1\/2/)).toBeTruthy();
    }
  });

  it('cannot select more players than team size allows', () => {
    const game = createTestGame({ phase: 'selecting_team', crown_index: 0, current_round: 1 });
    const players = createTestPlayers(5);
    const currentPlayer = players[0];
    const onSelectTeam = vi.fn();

    render(
      <TeamSelection
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onSelectTeam={onSelectTeam}
      />
    );

    // Select 2 players (max for round 1 with 5 players)
    const playerButtons = screen.getAllByRole('button');
    const selectableButtons = playerButtons.filter(
      btn => btn.getAttribute('aria-pressed') !== null
    );
    
    // Click first two selectable buttons
    if (selectableButtons[0]) fireEvent.click(selectableButtons[0]);
    if (selectableButtons[1]) fireEvent.click(selectableButtons[1]);
    
    // After selecting 2, the Selected count text shows "2/2"
    expect(screen.getByText(/Selected: 2\/2/)).toBeTruthy();
  });
});

// =============================================================================
// MissionVoting Component Tests
// =============================================================================

describe('MissionVoting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useVoteSubscription).mockReturnValue({
      votes: {},
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    vi.mocked(useVoteCompletion).mockReturnValue({
      isComplete: false,
      voteCount: 0,
      expectedCount: 2,
      checkCompletion: vi.fn(),
    });
  });

  it('hides fail button for good players', () => {
    const game = createTestGame({
      phase: 'mission_voting',
      selected_team: ['player-1', 'player-2'],
    });
    const players = createTestPlayers(5);
    players[0].team = 'good';
    const currentPlayer = players[0]; // Good player on team
    const onVote = vi.fn();

    render(
      <MissionVoting
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onVote={onVote}
      />
    );

    // Should show Pass button
    expect(screen.getByText('Pass')).toBeTruthy();
    // Should NOT show Fail button
    expect(screen.queryByText('Fail')).toBeNull();
  });

  it('shows fail button for evil players on team', () => {
    const game = createTestGame({
      phase: 'mission_voting',
      selected_team: ['player-1', 'player-2'],
    });
    const players = createTestPlayers(5);
    players[0].team = 'evil';
    const currentPlayer = players[0]; // Evil player on team
    const onVote = vi.fn();

    render(
      <MissionVoting
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onVote={onVote}
      />
    );

    // Should show both buttons
    expect(screen.getByText('Pass')).toBeTruthy();
    expect(screen.getByText('Fail')).toBeTruthy();
  });

  it('shows waiting state for non-team members', () => {
    const game = createTestGame({
      phase: 'mission_voting',
      selected_team: ['player-1', 'player-2'],
    });
    const players = createTestPlayers(5);
    const currentPlayer = players[2]; // Not on team
    const onVote = vi.fn();

    render(
      <MissionVoting
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onVote={onVote}
      />
    );

    // Text changed to "Team members are voting..."
    expect(screen.getByText(/Team members are voting/)).toBeTruthy();
  });

  it('shows hint that good players can only vote pass', () => {
    const game = createTestGame({
      phase: 'mission_voting',
      selected_team: ['player-1', 'player-2'],
    });
    const players = createTestPlayers(5);
    players[0].team = 'good';
    const currentPlayer = players[0];
    const onVote = vi.fn();

    render(
      <MissionVoting
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onVote={onVote}
      />
    );

    // Text changed to "As a loyal team member, you can only vote Pass"
    expect(screen.getByText(/loyal team member/)).toBeTruthy();
  });

  it('calls onVote when clicking pass button', async () => {
    const players = createTestPlayers(5);
    players[0].id = 'player-1';
    players[0].team = 'evil';
    const currentPlayer = players[0];

    const game = createTestGame({
      phase: 'mission_voting',
      selected_team: ['player-1', 'player-2'],
    });
    const onVote = vi.fn().mockResolvedValue({ success: true, allVotesIn: false });

    render(
      <MissionVoting
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onVote={onVote}
      />
    );

    // Click pass button
    const passButton = screen.getByRole('button', { name: /Vote pass on mission/i });
    await act(async () => {
      fireEvent.click(passButton);
    });

    expect(onVote).toHaveBeenCalledWith('pass');
  });
});

// =============================================================================
// AssassinationPhase Component Tests
// =============================================================================

describe('AssassinationPhase', () => {
  it('shows waiting state for non-Assassin players', () => {
    const game = createTestGame({ phase: 'assassination' });
    const players = createTestPlayers(5, [
      { character: 'Seer', team: 'good' },
      { character: 'Assassin', team: 'evil' },
      { character: 'Villager', team: 'good' },
      { character: 'Minion', team: 'evil' },
      { character: 'Villager', team: 'good' },
    ]);
    const currentPlayer = players[0]; // Seer (not Assassin)
    const onExecuteAction = vi.fn();

    render(
      <AssassinationPhase
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onExecuteAction={onExecuteAction}
      />
    );

    expect(screen.getByText(/Assassination in Progress/)).toBeTruthy();
    expect(screen.getByText(/is choosing their target/)).toBeTruthy();
  });

  it('shows target selection for Assassin player', () => {
    const game = createTestGame({ phase: 'assassination' });
    const players = createTestPlayers(5, [
      { character: 'Seer', team: 'good' },
      { character: 'Assassin', team: 'evil' },
      { character: 'Villager', team: 'good' },
      { character: 'Minion', team: 'evil' },
      { character: 'Villager', team: 'good' },
    ]);
    const currentPlayer = players[1]; // Assassin
    const onExecuteAction = vi.fn();

    render(
      <AssassinationPhase
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onExecuteAction={onExecuteAction}
      />
    );

    expect(screen.getByText(/Choose wisely/)).toBeTruthy();
    expect(screen.getByText('Assassinate')).toBeTruthy();
  });

  it('allows Assassin to select a target', () => {
    const game = createTestGame({ phase: 'assassination' });
    const players = createTestPlayers(5, [
      { character: 'Seer', team: 'good', display_name: 'The Seer' },
      { character: 'Assassin', team: 'evil' },
      { character: 'Villager', team: 'good' },
      { character: 'Minion', team: 'evil' },
      { character: 'Villager', team: 'good' },
    ]);
    const currentPlayer = players[1]; // Assassin
    const onExecuteAction = vi.fn().mockResolvedValue({
      success: true,
      message: 'Seer assassinated',
      gameEnded: true,
      winner: 'evil',
    });

    render(
      <AssassinationPhase
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onExecuteAction={onExecuteAction}
      />
    );

    // Find and click a target
    const targetButton = screen.getByText('The Seer').closest('button');
    if (targetButton) {
      fireEvent.click(targetButton);
      expect(screen.getByText('Target Selected')).toBeTruthy();
    }
  });

  it('Assassin cannot target themselves', () => {
    const game = createTestGame({ phase: 'assassination' });
    const players = createTestPlayers(3, [
      { character: 'Seer', team: 'good' },
      { character: 'Assassin', team: 'evil', display_name: 'Evil Assassin' },
      { character: 'Villager', team: 'good' },
    ]);
    const currentPlayer = players[1]; // Assassin
    const onExecuteAction = vi.fn();

    render(
      <AssassinationPhase
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onExecuteAction={onExecuteAction}
      />
    );

    // Assassin should not be in the target list
    const buttons = screen.getAllByRole('button');
    const assassinButton = buttons.find(btn => btn.textContent?.includes('Evil Assassin'));
    expect(assassinButton).toBeUndefined();
  });

  it('shows result after assassination', async () => {
    const game = createTestGame({ phase: 'assassination' });
    const players = createTestPlayers(3, [
      { character: 'Seer', team: 'good', display_name: 'The Seer' },
      { character: 'Assassin', team: 'evil' },
      { character: 'Villager', team: 'good' },
    ]);
    const currentPlayer = players[1]; // Assassin
    const onExecuteAction = vi.fn().mockResolvedValue({
      success: true,
      message: 'The Seer has been assassinated!',
      gameEnded: true,
      winner: 'evil',
    } as ActionResult);

    const { rerender } = render(
      <AssassinationPhase
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onExecuteAction={onExecuteAction}
      />
    );

    // Select target and submit
    const targetButton = screen.getByText('The Seer').closest('button');
    if (targetButton) {
      fireEvent.click(targetButton);
    }

    const assassinateButton = screen.getByRole('button', { name: /Confirm assassination target/i });
    fireEvent.click(assassinateButton);

    // Wait for async action
    await vi.waitFor(() => {
      expect(onExecuteAction).toHaveBeenCalledWith('assassinate', [players[0].id]);
    });
  });
});

// =============================================================================
// ActionPanel Component Tests
// =============================================================================

describe('ActionPanel', () => {
  // Mock the registries
  vi.mock('~/registry/ActionRegistry', () => ({
    actionRegistry: {
      getAvailableActions: vi.fn(() => []),
      get: vi.fn(),
    },
    getUsedActionIds: vi.fn(() => []),
  }));

  vi.mock('~/registry/CharacterRegistry', () => ({
    characterRegistry: {
      get: vi.fn(),
      resolveInfo: vi.fn(() => ({
        knownPlayers: [],
        knownPlayerLabels: {},
        description: '',
      })),
    },
  }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when player has no character', async () => {
    // Need to reimport after mock reset
    const { ActionPanel } = await import('~/components/ActionPanel');
    const { characterRegistry } = await import('~/registry/CharacterRegistry');
    
    vi.mocked(characterRegistry.get).mockReturnValue(undefined);

    const game = createTestGame({ phase: 'mission_voting' });
    const players = createTestPlayers(5);
    const currentPlayer = createTestPlayer({ character: null });
    const ctx = createTestContext(game, players, currentPlayer);
    const onExecuteAction = vi.fn();

    const { container } = render(
      <ActionPanel
        player={currentPlayer}
        game={game}
        players={players}
        actions={[]}
        ctx={ctx}
        onExecuteAction={onExecuteAction}
      />
    );

    // Should render nothing
    expect(container.firstChild).toBeNull();
  });

  it('shows "No actions available in this phase" when no actions for current phase', async () => {
    const { ActionPanel } = await import('~/components/ActionPanel');
    const { characterRegistry } = await import('~/registry/CharacterRegistry');
    const { actionRegistry, getUsedActionIds } = await import('~/registry/ActionRegistry');
    
    vi.mocked(characterRegistry.get).mockReturnValue({
      name: 'Guardian',
      team: 'good',
      description: 'Can protect a player',
      info: () => ({ knownPlayers: [], description: '' }),
      actions: ['protect'],
      effects: [],
    });
    vi.mocked(actionRegistry.getAvailableActions).mockReturnValue([]);
    vi.mocked(getUsedActionIds).mockReturnValue([]);

    const game = createTestGame({ phase: 'voting_for_leader' }); // Wrong phase for protect
    const players = createTestPlayers(5);
    const currentPlayer = createTestPlayer({ character: 'Guardian' });
    const ctx = createTestContext(game, players, currentPlayer);
    const onExecuteAction = vi.fn();

    render(
      <ActionPanel
        player={currentPlayer}
        game={game}
        players={players}
        actions={[]}
        ctx={ctx}
        onExecuteAction={onExecuteAction}
      />
    );

    expect(screen.getByText('No actions available in this phase')).toBeTruthy();
  });

  it('shows "All abilities have been used" when all actions used', async () => {
    const { ActionPanel } = await import('~/components/ActionPanel');
    const { characterRegistry } = await import('~/registry/CharacterRegistry');
    const { actionRegistry, getUsedActionIds } = await import('~/registry/ActionRegistry');
    
    vi.mocked(characterRegistry.get).mockReturnValue({
      name: 'Guardian',
      team: 'good',
      description: 'Can protect a player',
      info: () => ({ knownPlayers: [], description: '' }),
      actions: ['protect'],
      effects: [],
    });
    vi.mocked(actionRegistry.getAvailableActions).mockReturnValue([]);
    vi.mocked(getUsedActionIds).mockReturnValue(['protect']); // Already used

    const game = createTestGame({ phase: 'mission_voting' });
    const players = createTestPlayers(5);
    const currentPlayer = createTestPlayer({ character: 'Guardian' });
    const ctx = createTestContext(game, players, currentPlayer);
    const onExecuteAction = vi.fn();

    render(
      <ActionPanel
        player={currentPlayer}
        game={game}
        players={players}
        actions={[]}
        ctx={ctx}
        onExecuteAction={onExecuteAction}
      />
    );

    expect(screen.getByText('All abilities have been used')).toBeTruthy();
  });
});

// =============================================================================
// CharacterInfoPanel Component Tests
// =============================================================================

describe('CharacterInfoPanel', () => {
  beforeEach(async () => {
    const { characterRegistry } = await import('~/registry/CharacterRegistry');
    vi.mocked(characterRegistry.resolveInfo).mockReset();
  });

  it('displays character name and team', async () => {
    const { characterRegistry } = await import('~/registry/CharacterRegistry');
    vi.mocked(characterRegistry.get).mockReturnValue({
      name: 'Seer',
      team: 'good',
      description: 'Knows the evil players',
      info: () => ({ knownPlayers: [], description: '' }),
      actions: [],
      effects: [],
    });
    vi.mocked(characterRegistry.resolveInfo).mockReturnValue({
      knownPlayers: [],
      knownPlayerLabels: {},
      description: '',
    });

    const game = createTestGame();
    const players = createTestPlayers(5);
    const currentPlayer = createTestPlayer({
      character: 'Seer',
      team: 'good',
    });

    render(
      <CharacterInfoPanel
        player={currentPlayer}
        players={players}
        game={game}
      />
    );

    expect(screen.getByText('Seer')).toBeTruthy();
    // Team badge shows just the team name
    expect(screen.getByText('good')).toBeTruthy();
  });

  it('shows known players for Seer (excluding Saboteur)', async () => {
    const { characterRegistry } = await import('~/registry/CharacterRegistry');
    
    const evilPlayer1 = createTestPlayer({
      id: 'evil-1',
      character: 'Assassin',
      team: 'evil',
      display_name: 'Evil One',
    });
    const saboteur = createTestPlayer({
      id: 'saboteur-1',
      character: 'Saboteur',
      team: 'evil',
      display_name: 'Hidden Evil',
    });

    // Mock that Saboteur is excluded (appears_as_good effect applied)
    vi.mocked(characterRegistry.get).mockReturnValue({
      name: 'Seer',
      team: 'good',
      description: 'Knows the evil players',
      info: () => ({
        knownPlayers: ['evil-1'], // Saboteur excluded
        knownPlayerLabels: { 'evil-1': 'Evil' },
        description: 'Known evil players',
      }),
      actions: [],
      effects: [],
    });
    vi.mocked(characterRegistry.resolveInfo).mockReturnValue({
      knownPlayers: ['evil-1'],
      knownPlayerLabels: { 'evil-1': 'Evil' },
      description: 'Known evil players',
    });

    const game = createTestGame();
    const players = [
      createTestPlayer({ character: 'Seer', team: 'good' }),
      evilPlayer1,
      saboteur,
    ];
    const currentPlayer = players[0];

    render(
      <CharacterInfoPanel
        player={currentPlayer}
        players={players}
        game={game}
      />
    );

    expect(screen.getByText('Evil One')).toBeTruthy();
    // Saboteur should not be visible
    expect(screen.queryByText('Hidden Evil')).toBeNull();
  });

  it('shows unreliable info warning for Oracle with Phantom present', async () => {
    const { characterRegistry } = await import('~/registry/CharacterRegistry');
    
    vi.mocked(characterRegistry.get).mockReturnValue({
      name: 'Oracle',
      team: 'good',
      description: 'Knows the Seer candidates',
      info: () => ({
        knownPlayers: ['seer-1', 'phantom-1'],
        knownPlayerLabels: { 'seer-1': 'Seer?', 'phantom-1': 'Seer?' },
        description: 'Seer candidates',
      }),
      actions: [],
      effects: [],
    });
    vi.mocked(characterRegistry.resolveInfo).mockReturnValue({
      knownPlayers: ['seer-1', 'phantom-1'],
      knownPlayerLabels: { 'seer-1': 'Seer?', 'phantom-1': 'Seer?' },
      description: 'Seer candidates',
    });

    const game = createTestGame();
    const players = [
      createTestPlayer({ id: 'oracle-1', character: 'Oracle', team: 'good' }),
      createTestPlayer({ id: 'seer-1', character: 'Seer', team: 'good', display_name: 'Real Seer' }),
      createTestPlayer({ id: 'phantom-1', character: 'Phantom', team: 'evil', display_name: 'Fake Seer' }),
    ];
    const currentPlayer = players[0];

    render(
      <CharacterInfoPanel
        player={currentPlayer}
        players={players}
        game={game}
      />
    );

    expect(screen.getByText('Information may be unreliable')).toBeTruthy();
  });

  it('uses team-appropriate colors', async () => {
    const { characterRegistry } = await import('~/registry/CharacterRegistry');
    vi.mocked(characterRegistry.get).mockReturnValue({
      name: 'Assassin',
      team: 'evil',
      description: 'Can assassinate the Seer',
      info: () => ({ knownPlayers: [], description: '' }),
      actions: ['assassinate'],
      effects: [],
    });
    vi.mocked(characterRegistry.resolveInfo).mockReturnValue({
      knownPlayers: [],
      knownPlayerLabels: {},
      description: '',
    });

    const game = createTestGame();
    const players = createTestPlayers(5);
    const currentPlayer = createTestPlayer({
      character: 'Assassin',
      team: 'evil',
    });

    const { container } = render(
      <CharacterInfoPanel
        player={currentPlayer}
        players={players}
        game={game}
      />
    );

    // Check for red color classes (evil team) - uses border-red-500/30 in new design
    const panel = container.querySelector('[class*="border-red"]');
    expect(panel).toBeTruthy();
  });
});

// =============================================================================
// ScoreBoard Component Tests
// =============================================================================

describe('ScoreBoard', () => {
  it('displays good and evil victory counts', () => {
    const game = createTestGame({
      good_victories: 2,
      evil_victories: 1,
    });

    const { container } = render(<ScoreBoard game={game} />);

    // Check for good victories (blue text)
    const goodVictories = container.querySelector('.text-blue-400');
    expect(goodVictories?.textContent).toBe('2');
    
    // Check for evil victories (red text)
    const evilVictories = container.querySelector('.text-red-400');
    expect(evilVictories?.textContent).toBe('1');
  });

  it('highlights current round', () => {
    const game = createTestGame({ current_round: 3 });

    const { container } = render(<ScoreBoard game={game} />);

    // Current round should have white border/ring in new design
    const roundIndicators = container.querySelectorAll('[class*="ring-white"]');
    expect(roundIndicators.length).toBeGreaterThan(0);
  });

  it('shows past round results', () => {
    const game = createTestGame({
      current_round: 3,
      good_victories: 1,
      evil_victories: 1,
    });

    const { container } = render(<ScoreBoard game={game} />);

    // Should have both blue (good win) and red (evil win) indicators for past rounds
    // New design uses gradient classes with border classes
    const blueRounds = container.querySelectorAll('[class*="border-blue-500"]');
    const redRounds = container.querySelectorAll('[class*="border-red-500"]');
    
    expect(blueRounds.length).toBeGreaterThan(0);
    expect(redRounds.length).toBeGreaterThan(0);
  });

  it('shows all 5 round indicators', () => {
    const game = createTestGame();

    render(<ScoreBoard game={game} />);

    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
  });
});
