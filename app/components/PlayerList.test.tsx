/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlayerList } from './PlayerList';
import type { Player } from '~/types/game';

// =============================================================================
// Test Helpers
// =============================================================================

function createTestPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: `player-${Math.random().toString(36).substring(7)}`,
    game_id: 'game-1',
    user_id: `user-${Math.random().toString(36).substring(7)}`,
    display_name: 'Test Player',
    character: 'Villager',
    team: 'good',
    is_alive: true,
    seat_order: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function createPlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) =>
    createTestPlayer({
      id: `player-${i}`,
      user_id: `user-${i}`,
      display_name: `Player ${i + 1}`,
      seat_order: i,
    })
  );
}

// =============================================================================
// Basic Display Tests
// =============================================================================

describe('PlayerList', () => {
  describe('displays player names', () => {
    it('renders all player names', () => {
      const players = createPlayers(5);

      render(
        <PlayerList
          players={players}
          currentPlayerId={players[0].id}
        />
      );

      players.forEach((player) => {
        expect(screen.getByText(player.display_name)).toBeTruthy();
      });
    });

    it('sorts players by seat order', () => {
      const players = [
        createTestPlayer({ id: 'p3', display_name: 'Player 3', seat_order: 2 }),
        createTestPlayer({ id: 'p1', display_name: 'Player 1', seat_order: 0 }),
        createTestPlayer({ id: 'p2', display_name: 'Player 2', seat_order: 1 }),
      ];

      render(
        <PlayerList
          players={players}
          currentPlayerId="p1"
        />
      );

      const names = screen.getAllByText(/Player \d/);
      expect(names[0].textContent).toBe('Player 1');
      expect(names[1].textContent).toBe('Player 2');
      expect(names[2].textContent).toBe('Player 3');
    });

    it('shows (you) indicator for current player', () => {
      const players = createPlayers(3);

      render(
        <PlayerList
          players={players}
          currentPlayerId={players[1].id}
        />
      );

      expect(screen.getByText('(you)')).toBeTruthy();
    });
  });

  describe('shows crown icon for leader', () => {
    it('displays crown icon next to leader', () => {
      const players = createPlayers(3);

      render(
        <PlayerList
          players={players}
          currentPlayerId={players[0].id}
          leaderId={players[1].id}
        />
      );

      // Crown icon should be rendered (check for SVG with aria-hidden)
      const svg = document.querySelector('svg[aria-hidden="true"]');
      expect(svg).toBeTruthy();
    });

    it('does not show crown when no leader specified', () => {
      const players = createPlayers(3);

      render(
        <PlayerList
          players={players}
          currentPlayerId={players[0].id}
        />
      );

      // Should only have the title SVG if any
      const svgs = document.querySelectorAll('svg');
      // Filter to just crown icons (star path)
      const crowns = Array.from(svgs).filter((svg) =>
        svg.innerHTML.includes('12 1l3.22')
      );
      expect(crowns.length).toBe(0);
    });
  });

  describe('indicates team selection state', () => {
    it('shows Team badge for players on selected team', () => {
      const players = createPlayers(5);

      render(
        <PlayerList
          players={players}
          currentPlayerId={players[0].id}
          selectedTeam={[players[1].id, players[2].id]}
        />
      );

      const teamBadges = screen.getAllByText('Team');
      expect(teamBadges).toHaveLength(2);
    });

    it('does not show Team badge when no team selected', () => {
      const players = createPlayers(3);

      render(
        <PlayerList
          players={players}
          currentPlayerId={players[0].id}
        />
      );

      expect(screen.queryByText('Team')).toBeNull();
    });
  });

  describe('shows eliminated status', () => {
    it('displays Eliminated badge for eliminated players', () => {
      const players = [
        createTestPlayer({ id: 'p1', display_name: 'Player 1', is_alive: true }),
        createTestPlayer({ id: 'p2', display_name: 'Player 2', is_alive: false }),
      ];

      render(
        <PlayerList
          players={players}
          currentPlayerId="p1"
        />
      );

      expect(screen.getByText('Eliminated')).toBeTruthy();
    });

    it('shows Eliminated badge in selectable mode for eliminated players', () => {
      const players = [
        createTestPlayer({ id: 'p1', display_name: 'Player 1', is_alive: true }),
        createTestPlayer({ id: 'p2', display_name: 'Player 2', is_alive: false }),
      ];

      render(
        <PlayerList
          players={players}
          currentPlayerId="p1"
          selectable
          selectedIds={[]}
          onSelectPlayer={() => {}}
        />
      );

      // In selectable mode, eliminated players show "Eliminated" badge
      expect(screen.getByText('Eliminated')).toBeTruthy();
    });
  });

  describe('shows alive/dead status', () => {
    it('shows Alive badge in selectable mode for alive players', () => {
      const players = [
        createTestPlayer({ id: 'p1', display_name: 'Player 1', is_alive: true }),
        createTestPlayer({ id: 'p2', display_name: 'Player 2', is_alive: true }),
      ];

      render(
        <PlayerList
          players={players}
          currentPlayerId="p1"
          selectable
          selectedIds={[]}
          onSelectPlayer={() => {}}
        />
      );

      const aliveBadges = screen.getAllByText('Alive');
      expect(aliveBadges).toHaveLength(2);
    });

    it('does not show Alive badge in non-selectable mode', () => {
      const players = createPlayers(3);

      render(
        <PlayerList
          players={players}
          currentPlayerId={players[0].id}
        />
      );

      expect(screen.queryByText('Alive')).toBeNull();
    });
  });
});

// =============================================================================
// Selectable Mode Tests
// =============================================================================

describe('PlayerList selectable mode', () => {
  let mockOnSelect: (playerId: string, selected: boolean) => void;

  beforeEach(() => {
    mockOnSelect = vi.fn();
  });

  describe('supports selectable mode', () => {
    it('renders as buttons when selectable is true', () => {
      const players = createPlayers(3);

      render(
        <PlayerList
          players={players}
          currentPlayerId={players[0].id}
          selectable
          selectedIds={[]}
          onSelectPlayer={mockOnSelect}
        />
      );

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(3);
    });

    it('renders as divs when selectable is false', () => {
      const players = createPlayers(3);

      render(
        <PlayerList
          players={players}
          currentPlayerId={players[0].id}
        />
      );

      const buttons = screen.queryAllByRole('button');
      expect(buttons).toHaveLength(0);
    });

    it('calls onSelectPlayer when clicking player', () => {
      const players = createPlayers(3);

      render(
        <PlayerList
          players={players}
          currentPlayerId={players[0].id}
          selectable
          selectedIds={[]}
          onSelectPlayer={mockOnSelect}
        />
      );

      fireEvent.click(screen.getByText('Player 2'));
      expect(mockOnSelect).toHaveBeenCalledWith(players[1].id, true);
    });

    it('calls onSelectPlayer with false when deselecting', () => {
      const players = createPlayers(3);

      render(
        <PlayerList
          players={players}
          currentPlayerId={players[0].id}
          selectable
          selectedIds={[players[1].id]}
          onSelectPlayer={mockOnSelect}
        />
      );

      fireEvent.click(screen.getByText('Player 2'));
      expect(mockOnSelect).toHaveBeenCalledWith(players[1].id, false);
    });

    it('shows selection indicators for selected players', () => {
      const players = createPlayers(3);

      render(
        <PlayerList
          players={players}
          currentPlayerId={players[0].id}
          selectable
          selectedIds={[players[1].id]}
          onSelectPlayer={mockOnSelect}
        />
      );

      // Check for check icon SVG in selected player
      const checkIcons = document.querySelectorAll('svg path[fill-rule="evenodd"]');
      expect(checkIcons.length).toBeGreaterThan(0);
    });

    it('shows selection counter when maxSelections specified', () => {
      const players = createPlayers(3);

      render(
        <PlayerList
          players={players}
          currentPlayerId={players[0].id}
          selectable
          selectedIds={[players[1].id]}
          onSelectPlayer={mockOnSelect}
          maxSelections={2}
        />
      );

      // The selection counter displays "Selected: X / Y" split across elements
      // Check that the text content includes the selection info
      const container = screen.getByText(/Selected/).closest('span');
      expect(container?.textContent).toContain('1');
      expect(container?.textContent).toContain('2');
    });
  });

  describe('respects maxSelections limit', () => {
    it('disables unselected players when at max', () => {
      const players = createPlayers(5);

      render(
        <PlayerList
          players={players}
          currentPlayerId={players[0].id}
          selectable
          selectedIds={[players[1].id, players[2].id]}
          onSelectPlayer={mockOnSelect}
          maxSelections={2}
        />
      );

      // Try to click an unselected player
      fireEvent.click(screen.getByText('Player 4'));
      expect(mockOnSelect).not.toHaveBeenCalled();
    });

    it('allows deselecting when at max', () => {
      const players = createPlayers(5);

      render(
        <PlayerList
          players={players}
          currentPlayerId={players[0].id}
          selectable
          selectedIds={[players[1].id, players[2].id]}
          onSelectPlayer={mockOnSelect}
          maxSelections={2}
        />
      );

      fireEvent.click(screen.getByText('Player 2'));
      expect(mockOnSelect).toHaveBeenCalledWith(players[1].id, false);
    });
  });

  describe('uses canSelect filter', () => {
    it('disables players that fail canSelect check', () => {
      const players = [
        createTestPlayer({ id: 'p1', display_name: 'Player 1', team: 'good' }),
        createTestPlayer({ id: 'p2', display_name: 'Player 2', team: 'evil' }),
        createTestPlayer({ id: 'p3', display_name: 'Player 3', team: 'good' }),
      ];

      render(
        <PlayerList
          players={players}
          currentPlayerId="p1"
          selectable
          selectedIds={[]}
          onSelectPlayer={mockOnSelect}
          canSelect={(p) => p.team === 'good'}
        />
      );

      // Click evil player - should not trigger
      fireEvent.click(screen.getByText('Player 2'));
      expect(mockOnSelect).not.toHaveBeenCalled();

      // Click good player - should trigger
      fireEvent.click(screen.getByText('Player 3'));
      expect(mockOnSelect).toHaveBeenCalledWith('p3', true);
    });

    it('defaults canSelect to is_alive check', () => {
      const players = [
        createTestPlayer({ id: 'p1', display_name: 'Player 1', is_alive: true }),
        createTestPlayer({ id: 'p2', display_name: 'Player 2', is_alive: false }),
      ];

      render(
        <PlayerList
          players={players}
          currentPlayerId="p1"
          selectable
          selectedIds={[]}
          onSelectPlayer={mockOnSelect}
        />
      );

      // Click dead player - should not trigger
      fireEvent.click(screen.getByText('Player 2'));
      expect(mockOnSelect).not.toHaveBeenCalled();

      // Click alive player - should trigger
      fireEvent.click(screen.getByText('Player 1'));
      expect(mockOnSelect).toHaveBeenCalledWith('p1', true);
    });
  });

  describe('keyboard navigation', () => {
    it('supports Enter key to select', () => {
      const players = createPlayers(3);

      render(
        <PlayerList
          players={players}
          currentPlayerId={players[0].id}
          selectable
          selectedIds={[]}
          onSelectPlayer={mockOnSelect}
        />
      );

      const buttons = screen.getAllByRole('button');
      fireEvent.keyDown(buttons[1], { key: 'Enter' });
      expect(mockOnSelect).toHaveBeenCalledWith(players[1].id, true);
    });

    it('supports Space key to select', () => {
      const players = createPlayers(3);

      render(
        <PlayerList
          players={players}
          currentPlayerId={players[0].id}
          selectable
          selectedIds={[]}
          onSelectPlayer={mockOnSelect}
        />
      );

      const buttons = screen.getAllByRole('button');
      fireEvent.keyDown(buttons[1], { key: ' ' });
      expect(mockOnSelect).toHaveBeenCalledWith(players[1].id, true);
    });

    it('has aria-pressed attribute on buttons', () => {
      const players = createPlayers(3);

      render(
        <PlayerList
          players={players}
          currentPlayerId={players[0].id}
          selectable
          selectedIds={[players[1].id]}
          onSelectPlayer={mockOnSelect}
        />
      );

      const buttons = screen.getAllByRole('button');
      expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
      expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    });
  });
});

// =============================================================================
// Compact Mode Tests
// =============================================================================

describe('PlayerList compact mode', () => {
  it('hides badges in compact mode', () => {
    const players = [
      createTestPlayer({ id: 'p1', display_name: 'Player 1', is_alive: false }),
    ];

    render(
      <PlayerList
        players={players}
        currentPlayerId="p1"
        compact
      />
    );

    expect(screen.queryByText('Eliminated')).toBeNull();
  });

  it('hides title in compact mode', () => {
    const players = createPlayers(3);

    render(
      <PlayerList
        players={players}
        currentPlayerId={players[0].id}
        compact
      />
    );

    expect(screen.queryByText('Players')).toBeNull();
  });
});

// =============================================================================
// Accessibility Tests
// =============================================================================

describe('PlayerList accessibility', () => {
  it('has role="group" with aria-label in selectable mode', () => {
    const players = createPlayers(3);

    const { container } = render(
      <PlayerList
        players={players}
        currentPlayerId={players[0].id}
        selectable
        selectedIds={[]}
        onSelectPlayer={() => {}}
      />
    );

    const group = container.querySelector('[role="group"]');
    expect(group).toBeTruthy();
    expect(group?.getAttribute('aria-label')).toBe('Select players');
  });

  it('has aria-label on player buttons', () => {
    const players = createPlayers(2);

    render(
      <PlayerList
        players={players}
        currentPlayerId={players[0].id}
        selectable
        selectedIds={[players[0].id]}
        onSelectPlayer={() => {}}
      />
    );

    const buttons = screen.getAllByRole('button');
    const label0 = buttons[0].getAttribute('aria-label') || '';
    expect(label0).toContain('Player 1');
    expect(label0).toContain('(selected)');
  });
});
