/**
 * API Route: GET /api/games/lookup?key=XXXX
 * Looks up a game by its shareable game code.
 */

import type { LoaderFunctionArgs } from 'react-router';
import { createClient } from '~/lib/supabase/server';

/**
 * Response schema for successful lookup.
 */
interface LookupGameResponse {
  game: {
    id: string;
    game_key: string;
    status: string;
  };
}

/**
 * Error response schema.
 */
interface ErrorResponse {
  error: string;
}

export async function loader({ request }: LoaderFunctionArgs): Promise<Response> {
  const url = new URL(request.url);
  const gameKey = url.searchParams.get('key');

  if (!gameKey) {
    return new Response(
      JSON.stringify({ error: 'Game code is required' } satisfies ErrorResponse),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate format (6-8 alphanumeric)
  if (!/^[A-Za-z0-9]{6,8}$/.test(gameKey)) {
    return new Response(
      JSON.stringify({ error: 'Invalid game code format' } satisfies ErrorResponse),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Look up game by key in Supabase (case insensitive)
  const { supabase } = createClient(request);
  const { data: game, error: gameError } = await supabase
    .from('gambit_games')
    .select('*')
    .ilike('game_key', gameKey)
    .single();

  if (gameError || !game) {
    return new Response(
      JSON.stringify({ error: 'Game not found' } satisfies ErrorResponse),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const response: LookupGameResponse = {
    game: {
      id: game.id,
      game_key: game.game_key,
      status: game.status,
    },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
