/**
 * API Route: POST /api/games/:gameId/join
 * Allows a user to join an existing game.
 */

import type { ActionFunctionArgs } from 'react-router';
import { createClient } from '~/lib/supabase/server';
import { gameService } from '~/services/GameService';
import { stateValidator, MAX_PLAYERS } from '~/services/StateValidator';

/**
 * Request body schema for joining a game.
 */
interface JoinGameRequest {
  displayName: string;
}

/**
 * Response schema for successful join.
 */
interface JoinGameResponse {
  player: {
    id: string;
    game_id: string;
    user_id: string;
    display_name: string;
  };
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
    // Parse request body
    const body = await request.json() as JoinGameRequest;
    const displayName = body.displayName?.trim();

    if (!displayName) {
      return new Response(
        JSON.stringify({ error: 'Display name is required' } satisfies ErrorResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check if game exists
    const game = gameService.getGameById(gameId);
    if (!game) {
      return new Response(
        JSON.stringify({ error: 'Game not found' } satisfies ErrorResponse),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate that user can join
    const validation = stateValidator.validateJoinGame(gameId, user.id);
    if (!validation.valid) {
      // Determine status code based on error type
      let status = 400;
      if (validation.error === 'Game not found') {
        status = 404;
      }
      
      return new Response(
        JSON.stringify({ error: validation.error ?? 'Cannot join game' } satisfies ErrorResponse),
        { status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Add player to game (handles graceful duplicate join)
    const player = gameService.addPlayer(gameId, user.id, displayName);

    // Build response
    const response: JoinGameResponse = {
      player: {
        id: player.id,
        game_id: player.game_id,
        user_id: player.user_id,
        display_name: player.display_name,
      },
    };

    // Merge auth headers with response
    const responseHeaders = new Headers(headers);
    responseHeaders.set('Content-Type', 'application/json');

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Error joining game:', error);
    
    // Handle specific error cases
    const errorMessage = error instanceof Error ? error.message : 'Failed to join game';
    
    // Map error messages to appropriate status codes
    let status = 500;
    if (errorMessage === 'Game not found') {
      status = 404;
    } else if (errorMessage === 'Game has already started' || errorMessage === 'Game is full') {
      status = 400;
    }

    return new Response(
      JSON.stringify({ error: errorMessage } satisfies ErrorResponse),
      { status, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
