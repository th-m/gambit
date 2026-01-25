/**
 * API Route: POST /api/games/:gameId/action
 * Handles character special ability execution.
 */

import type { ActionFunctionArgs } from 'react-router';
import { createClient } from '~/lib/supabase/server';
import { gameService } from '~/services/GameService';
import { actionProcessor } from '~/services/ActionProcessor';
import type { ActionId, ActionResult } from '~/types/game';
import { isActionId } from '~/types/game';

/**
 * Request body schema for action execution.
 */
interface ActionRequest {
  actionId: ActionId;
  targetIds: string[];
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
    const body = await request.json() as ActionRequest;
    const { actionId, targetIds } = body;

    // Validate actionId
    if (!actionId || !isActionId(actionId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid action ID' } satisfies ErrorResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate targetIds is an array
    if (!Array.isArray(targetIds)) {
      return new Response(
        JSON.stringify({ error: 'targetIds must be an array' } satisfies ErrorResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate all targetIds are strings
    if (targetIds.some((id) => typeof id !== 'string')) {
      return new Response(
        JSON.stringify({ error: 'All target IDs must be strings' } satisfies ErrorResponse),
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

    // Find the player for this user in this game
    const player = gameService.getPlayer(gameId, user.id);
    if (!player) {
      return new Response(
        JSON.stringify({ error: 'Player not in game' } satisfies ErrorResponse),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Execute the action via ActionProcessor
    const result: ActionResult = await actionProcessor.executeAction(
      gameId,
      player.id,
      actionId,
      targetIds
    );

    // Check for errors from action processor
    if (!result.success) {
      // Determine status code based on error type
      const statusCode = result.error?.includes('not in game') ? 403 : 400;
      
      return new Response(
        JSON.stringify({ 
          success: false,
          message: result.message,
          error: result.error 
        } satisfies ActionResult),
        { status: statusCode, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Merge auth headers with response
    const responseHeaders = new Headers(headers);
    responseHeaders.set('Content-Type', 'application/json');

    return new Response(JSON.stringify(result satisfies ActionResult), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Error executing action:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Failed to execute action';
    
    return new Response(
      JSON.stringify({ error: errorMessage } satisfies ErrorResponse),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
