/**
 * API Route: POST /api/games/:gameId/start
 * Allows the host to start a game.
 */

import type { ActionFunctionArgs } from 'react-router';
import { createClient } from '~/lib/supabase/server';
import { gameService } from '~/services/GameService';
import { stateValidator, MIN_PLAYERS, MAX_PLAYERS } from '~/services/StateValidator';
import { assignCharacters } from '~/utils/characterAssignment';

/**
 * Response schema for successful game start.
 */
interface StartGameResponse {
  game: {
    id: string;
    status: string;
    phase: string;
    current_round: number;
    crown_index: number;
  };
  message: string;
}

/**
 * Error response schema.
 */
interface ErrorResponse {
  error: string;
}

export async function action({ request, params }: ActionFunctionArgs): Promise<Response> {
  // Only accept POST requests
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' } satisfies ErrorResponse),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { gameId } = params;
  if (!gameId) {
    return new Response(
      JSON.stringify({ error: 'Game ID is required' } satisfies ErrorResponse),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check authentication
  const { supabase, headers } = createClient(request);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' } satisfies ErrorResponse),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Check if game exists
    const game = gameService.getGameById(gameId);
    if (!game) {
      return new Response(
        JSON.stringify({ error: 'Game not found' } satisfies ErrorResponse),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate user is the host
    const validation = stateValidator.validateGameStart(gameId, user.id);
    if (!validation.valid) {
      // Determine status code based on error type
      let status = 400;
      if (validation.error?.includes('Only the host')) {
        status = 403;
      }
      
      return new Response(
        JSON.stringify({ error: validation.error ?? 'Cannot start game' } satisfies ErrorResponse),
        { status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get players and validate count
    const players = gameService.getPlayers(gameId);
    const playerCount = players.length;

    if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
      return new Response(
        JSON.stringify({ 
          error: `Invalid player count: ${playerCount}. Need ${MIN_PLAYERS}-${MAX_PLAYERS} players.` 
        } satisfies ErrorResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Assign characters to players
    const { playerUpdates, crownIndex } = assignCharacters(players);

    // Apply player updates
    for (const { playerId, update } of playerUpdates) {
      gameService.updatePlayer(playerId, update);
    }

    // Update game state
    const updatedGame = gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'voting_for_leader',
      current_round: 1,
      crown_index: crownIndex,
      rejection_count: 0,
    });

    if (!updatedGame) {
      return new Response(
        JSON.stringify({ error: 'Failed to update game state' } satisfies ErrorResponse),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Build response
    const response: StartGameResponse = {
      game: {
        id: updatedGame.id,
        status: updatedGame.status,
        phase: updatedGame.phase!,
        current_round: updatedGame.current_round,
        crown_index: updatedGame.crown_index,
      },
      message: 'Game started successfully',
    };

    // Merge auth headers with response
    const responseHeaders = new Headers(headers);
    responseHeaders.set('Content-Type', 'application/json');

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Error starting game:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Failed to start game';
    
    return new Response(
      JSON.stringify({ error: errorMessage } satisfies ErrorResponse),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
