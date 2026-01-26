/**
 * API Route: POST /api/games/create
 * Creates a new game and adds the creator as the first player.
 */

import type { ActionFunctionArgs } from 'react-router';
import { createClient } from '~/lib/supabase/server';
import { gameCreationLimiter, checkRateLimit, createRateLimitKey } from '~/utils/rateLimiter';

/**
 * Generate a unique game key (6-8 alphanumeric characters).
 */
function generateGameKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous: I, O, 0, 1
  const length = 6 + Math.floor(Math.random() * 3); // 6, 7, or 8 chars
  let key = '';
  for (let i = 0; i < length; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

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

  // Check rate limit for game creation
  const rateLimitKey = createRateLimitKey(user.id, 'create');
  const rateLimitResponse = checkRateLimit(gameCreationLimiter, rateLimitKey);
  if (rateLimitResponse) {
    return rateLimitResponse;
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

    // Generate a unique game key with retry logic
    let gameKey = generateGameKey();
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      const { data: existingGame } = await supabase
        .from('gambit_games')
        .select('id')
        .eq('game_key', gameKey)
        .single();

      if (!existingGame) {
        break; // Key is unique
      }

      gameKey = generateGameKey();
      attempts++;
    }

    if (attempts >= maxAttempts) {
      return new Response(
        JSON.stringify({ error: 'Failed to generate unique game key' } satisfies ErrorResponse),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create game in Supabase
    const { data: game, error: gameError } = await supabase
      .from('gambit_games')
      .insert({
        game_key: gameKey,
        host_id: user.id,
        status: 'lobby',
        current_round: 1,
        crown_index: 0,
        rejection_count: 0,
        good_victories: 0,
        evil_victories: 0,
      })
      .select()
      .single();

    if (gameError || !game) {
      console.error('Error creating game:', gameError);
      return new Response(
        JSON.stringify({ error: 'Failed to create game' } satisfies ErrorResponse),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Add creator as first player
    const { data: player, error: playerError } = await supabase
      .from('gambit_game_players')
      .insert({
        game_id: game.id,
        user_id: user.id,
        display_name: displayName,
        is_alive: true,
      })
      .select()
      .single();

    if (playerError || !player) {
      console.error('Error creating player:', playerError);
      // Clean up the game if player creation failed
      await supabase.from('gambit_games').delete().eq('id', game.id);
      return new Response(
        JSON.stringify({ error: 'Failed to join game as host' } satisfies ErrorResponse),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

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
