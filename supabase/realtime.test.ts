/**
 * @vitest-environment node
 * 
 * Tests for Supabase real-time configuration.
 * 
 * These tests verify that:
 * 1. The real-time migration SQL is valid
 * 2. The hooks are configured to use the correct tables
 * 3. Documentation exists for manual verification
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// Constants
// =============================================================================

/**
 * Tables that should have real-time replication enabled.
 * These are specified in the db-realtime-config acceptance criteria.
 */
const REALTIME_TABLES = ['games', 'players', 'game_actions', 'player_statuses'];

/**
 * SQL command pattern for adding tables to real-time publication.
 */
const ADD_TABLE_PATTERN = /ALTER PUBLICATION supabase_realtime ADD TABLE (\w+);/g;

// =============================================================================
// Tests
// =============================================================================

describe('Supabase Real-time Configuration', () => {
  describe('Migration file', () => {
    it('should exist at correct path', () => {
      const migrationPath = path.resolve(
        __dirname,
        'migrations/20260125000001_enable_realtime.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it('should contain ALTER PUBLICATION commands for all required tables', () => {
      const migrationPath = path.resolve(
        __dirname,
        'migrations/20260125000001_enable_realtime.sql'
      );
      const content = fs.readFileSync(migrationPath, 'utf-8');

      // Extract all table names from ALTER PUBLICATION commands
      const matches = [...content.matchAll(ADD_TABLE_PATTERN)];
      const enabledTables = matches.map((m) => m[1]);

      // Verify all required tables are included
      for (const table of REALTIME_TABLES) {
        expect(enabledTables).toContain(table);
      }
    });

    it('should enable replication for games table', () => {
      const migrationPath = path.resolve(
        __dirname,
        'migrations/20260125000001_enable_realtime.sql'
      );
      const content = fs.readFileSync(migrationPath, 'utf-8');

      expect(content).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE games;');
    });

    it('should enable replication for players table', () => {
      const migrationPath = path.resolve(
        __dirname,
        'migrations/20260125000001_enable_realtime.sql'
      );
      const content = fs.readFileSync(migrationPath, 'utf-8');

      expect(content).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE players;');
    });

    it('should enable replication for game_actions table', () => {
      const migrationPath = path.resolve(
        __dirname,
        'migrations/20260125000001_enable_realtime.sql'
      );
      const content = fs.readFileSync(migrationPath, 'utf-8');

      expect(content).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE game_actions;');
    });

    it('should enable replication for player_statuses table', () => {
      const migrationPath = path.resolve(
        __dirname,
        'migrations/20260125000001_enable_realtime.sql'
      );
      const content = fs.readFileSync(migrationPath, 'utf-8');

      expect(content).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE player_statuses;');
    });

    it('should include verification query in comments', () => {
      const migrationPath = path.resolve(
        __dirname,
        'migrations/20260125000001_enable_realtime.sql'
      );
      const content = fs.readFileSync(migrationPath, 'utf-8');

      // Verify documentation for manual verification is included
      expect(content).toContain('pg_publication_tables');
      expect(content).toContain('supabase_realtime');
    });
  });

  describe('Hook configuration', () => {
    it('useGameSubscription should subscribe to games table', async () => {
      const hookPath = path.resolve(__dirname, '../app/hooks/useGameSubscription.ts');
      const content = fs.readFileSync(hookPath, 'utf-8');

      expect(content).toContain("table: 'games'");
    });

    it('useGameSubscription should subscribe to players table', async () => {
      const hookPath = path.resolve(__dirname, '../app/hooks/useGameSubscription.ts');
      const content = fs.readFileSync(hookPath, 'utf-8');

      expect(content).toContain("table: 'players'");
    });

    it('useGameSubscription should subscribe to game_actions table', async () => {
      const hookPath = path.resolve(__dirname, '../app/hooks/useGameSubscription.ts');
      const content = fs.readFileSync(hookPath, 'utf-8');

      expect(content).toContain("table: 'game_actions'");
    });
  });

  describe('Documentation', () => {
    it('should document that game_modifiers is not included (server-side only)', () => {
      const migrationPath = path.resolve(
        __dirname,
        'migrations/20260125000001_enable_realtime.sql'
      );
      const content = fs.readFileSync(migrationPath, 'utf-8');

      expect(content).toContain('game_modifiers');
      expect(content).toContain('NOT included');
    });

    it('should document that game_logs is not included', () => {
      const migrationPath = path.resolve(
        __dirname,
        'migrations/20260125000001_enable_realtime.sql'
      );
      const content = fs.readFileSync(migrationPath, 'utf-8');

      expect(content).toContain('game_logs');
      expect(content).toContain('NOT included');
    });

    it('should document RLS policy interaction', () => {
      const migrationPath = path.resolve(
        __dirname,
        'migrations/20260125000001_enable_realtime.sql'
      );
      const content = fs.readFileSync(migrationPath, 'utf-8');

      expect(content).toContain('RLS policies');
    });
  });
});

// =============================================================================
// Manual Verification Instructions
// =============================================================================

/**
 * MANUAL VERIFICATION STEPS
 * 
 * After running migrations, verify real-time is properly configured:
 * 
 * 1. Connect to your Supabase database (via psql or Supabase dashboard SQL editor)
 * 
 * 2. Run the following query to check publication tables:
 *    ```sql
 *    SELECT tablename 
 *    FROM pg_publication_tables 
 *    WHERE pubname = 'supabase_realtime';
 *    ```
 * 
 * 3. Expected output:
 *    tablename
 *    ---------------
 *    games
 *    players
 *    game_actions
 *    player_statuses
 * 
 * 4. Test in browser console with a real game:
 *    ```javascript
 *    const { data: { user } } = await supabase.auth.getUser();
 *    
 *    const channel = supabase
 *      .channel('test-realtime')
 *      .on('postgres_changes', {
 *        event: '*',
 *        schema: 'public',
 *        table: 'games'
 *      }, (payload) => {
 *        console.log('Received:', payload);
 *      })
 *      .subscribe((status) => {
 *        console.log('Subscription status:', status);
 *      });
 *    
 *    // Make a change to a game and watch for the console log
 *    ```
 * 
 * 5. Verify each table:
 *    - games: Update a game's status or phase
 *    - players: Add/remove a player from a game
 *    - game_actions: Submit a vote
 *    - player_statuses: Add a protection status
 */
