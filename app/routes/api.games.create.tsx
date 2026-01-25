/**
 * API Route: POST /api/games/create
 * Creates a new game and adds the creator as the first player.
 */

import type { ActionFunctionArgs } from 'react-router';
import { createClient } from '~/lib/supabase/server';
import { gameService } from '~/services/GameService';

/**
 * Request body schema for creating a game.
 */
interface CreateGameRequest {
  displayName: string;
}

/**
 * Response schema for successful game creation.
 */
interface CreateGameResponse {
  game: {
    id: string;
    game_key: string;
    host_id: string;
    status: string;
  };
  gameKey: string;
  player: {
    id: string;
    display_name: string;
  };
}

/**
 * Error response schema.
 */
interface ErrorResponse {
  error: string;
}

export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  // Only accept POST requests
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' } satisfies ErrorResponse),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
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
    const body = await request.json() as CreateGameRequest;
    const displayName = body.displayName?.trim();

    if (!displayName) {
      return new Response(
        JSON.stringify({ error: 'Display name is required' } satisfies ErrorResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create game via GameService
    const game = gameService.createGame(user.id);

    // Add creator as first player
    const player = gameService.addPlayer(game.id, user.id, displayName);

    // Build response
    const response: CreateGameResponse = {
      game: {
        id: game.id,
        game_key: game.game_key,
        host_id: game.host_id,
        status: game.status,
      },
      gameKey: game.game_key,
      player: {
        id: player.id,
        display_name: player.display_name,
      },
    };

    // Merge auth headers with response
    const responseHeaders = new Headers(headers);
    responseHeaders.set('Content-Type', 'application/json');

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Error creating game:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to create game' 
      } satisfies ErrorResponse),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
