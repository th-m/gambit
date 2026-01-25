/**
 * API Route: POST /api/games/:gameId/team
 * Allows the current leader to select the mission team.
 */

import type { ActionFunctionArgs } from 'react-router';
import { createClient } from '~/lib/supabase/server';
import { gameService } from '~/services/GameService';
import { stateValidator } from '~/services/StateValidator';

/**
 * Request body schema for team selection.
 */
interface TeamRequest {
  teamIds: string[];
}

/**
 * Success response schema.
 */
interface TeamResponse {
  success: true;
  game: {
    id: string;
    phase: string | null;
    selected_team: string[] | null;
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
    const body = await request.json() as TeamRequest;
    const { teamIds } = body;

    // Validate teamIds is an array
    if (!Array.isArray(teamIds)) {
      return new Response(
        JSON.stringify({ error: 'teamIds must be an array' } satisfies ErrorResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate all items are strings
    if (!teamIds.every(id => typeof id === 'string')) {
      return new Response(
        JSON.stringify({ error: 'All teamIds must be strings' } satisfies ErrorResponse),
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

    // Validate team selection using StateValidator
    const validation = stateValidator.validateTeamSelection(gameId, user.id, teamIds);
    
    if (!validation.valid) {
      // Determine appropriate status code based on error type
      const statusCode = validation.error?.includes('Only the current leader') ? 403 : 400;
      
      return new Response(
        JSON.stringify({ error: validation.error ?? 'Invalid team selection' } satisfies ErrorResponse),
        { status: statusCode, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Update game with selected team and advance phase
    const updatedGame = gameService.updateGame(gameId, {
      selected_team: teamIds,
      phase: 'mission_voting',
    });

    if (!updatedGame) {
      return new Response(
        JSON.stringify({ error: 'Failed to update game' } satisfies ErrorResponse),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Merge auth headers with response
    const responseHeaders = new Headers(headers);
    responseHeaders.set('Content-Type', 'application/json');

    const response: TeamResponse = {
      success: true,
      game: {
        id: updatedGame.id,
        phase: updatedGame.phase,
        selected_team: updatedGame.selected_team,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Error selecting team:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Failed to select team';
    
    return new Response(
      JSON.stringify({ error: errorMessage } satisfies ErrorResponse),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
