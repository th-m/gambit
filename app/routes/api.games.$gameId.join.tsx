/**
 * API Route: POST /api/games/:gameId/join
 * Allows a user to join an existing game.
 */

import type { ActionFunctionArgs } from 'react-router';
import { createClient } from '~/lib/supabase/server';

const MAX_PLAYERS = 10;

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

    // Check if game exists in Supabase
    const { data: game, error: gameError } = await supabase
      .from('gambit_games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (gameError || !game) {
      return new Response(
        JSON.stringify({ error: 'Game not found' } satisfies ErrorResponse),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check if game is in lobby status
    if (game.status !== 'lobby') {
      return new Response(
        JSON.stringify({ error: 'Game has already started' } satisfies ErrorResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is already in the game
    const { data: existingPlayer } = await supabase
      .from('gambit_game_players')
      .select('*')
      .eq('game_id', gameId)
      .eq('user_id', user.id)
      .single();

    if (existingPlayer) {
      // Return existing player instead of error (graceful handling)
      const response: JoinGameResponse = {
        player: {
          id: existingPlayer.id,
          game_id: existingPlayer.game_id,
          user_id: existingPlayer.user_id,
          display_name: existingPlayer.display_name,
        },
      };

      const responseHeaders = new Headers(headers);
      responseHeaders.set('Content-Type', 'application/json');

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: responseHeaders,
      });
    }

    // Check player count
    const { count: playerCount } = await supabase
      .from('gambit_game_players')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', gameId);

    if ((playerCount ?? 0) >= MAX_PLAYERS) {
      return new Response(
        JSON.stringify({ error: 'Game is full' } satisfies ErrorResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Insert new player into Supabase
    const { data: newPlayer, error: insertError } = await supabase
      .from('gambit_game_players')
      .insert({
        game_id: gameId,
        user_id: user.id,
        display_name: displayName,
        is_alive: true,
      })
      .select()
      .single();

    if (insertError || !newPlayer) {
      console.error('Error inserting player:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to join game' } satisfies ErrorResponse),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Build response
    const response: JoinGameResponse = {
      player: {
        id: newPlayer.id,
        game_id: newPlayer.game_id,
        user_id: newPlayer.user_id,
        display_name: newPlayer.display_name,
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
    
    return new Response(
      JSON.stringify({ error: errorMessage } satisfies ErrorResponse),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
