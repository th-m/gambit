/**
 * API Route: POST /api/games/:gameId/vote
 * Handles both leader approval votes and mission votes.
 */

import type { ActionFunctionArgs } from 'react-router';
import { createClient } from '~/lib/supabase/server';
import { gameService } from '~/services/GameService';
import { voteProcessor } from '~/services/VoteProcessor';
import type { LeaderVote, MissionVote, VoteResult } from '~/types/game';
import { voteSubmissionLimiter, checkRateLimit, createRateLimitKey } from '~/utils/rateLimiter';

/**
 * Request body schema for vote submission.
 */
interface VoteRequest {
  voteType: 'leader' | 'mission';
  vote: LeaderVote | MissionVote;
}

/**
 * Error response schema.
 */
interface ErrorResponse {
  error: string;
}

/**
 * Validates that a vote value is valid for the given vote type.
 */
function isValidVote(voteType: 'leader' | 'mission', vote: unknown): vote is LeaderVote | MissionVote {
  if (voteType === 'leader') {
    return vote === 'yes' || vote === 'no';
  } else if (voteType === 'mission') {
    return vote === 'pass' || vote === 'fail';
  }
  return false;
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

  // Check rate limit for vote submission
  const rateLimitKey = createRateLimitKey(user.id, 'vote');
  const rateLimitResponse = checkRateLimit(voteSubmissionLimiter, rateLimitKey);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // Parse request body
    const body = await request.json() as VoteRequest;
    const { voteType, vote } = body;

    // Validate voteType
    if (voteType !== 'leader' && voteType !== 'mission') {
      return new Response(
        JSON.stringify({ error: 'Invalid vote type. Must be "leader" or "mission"' } satisfies ErrorResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate vote value for the given type
    if (!isValidVote(voteType, vote)) {
      const expectedValues = voteType === 'leader' ? '"yes" or "no"' : '"pass" or "fail"';
      return new Response(
        JSON.stringify({ error: `Invalid vote. Must be ${expectedValues}` } satisfies ErrorResponse),
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

    // Submit the vote via VoteProcessor
    let result: VoteResult;
    if (voteType === 'leader') {
      result = voteProcessor.submitLeaderVote(gameId, player.id, vote as LeaderVote);
    } else {
      result = voteProcessor.submitMissionVote(gameId, player.id, vote as MissionVote);
    }

    // Check for errors from vote processor
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error ?? 'Vote failed' } satisfies ErrorResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Merge auth headers with response
    const responseHeaders = new Headers(headers);
    responseHeaders.set('Content-Type', 'application/json');

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Error submitting vote:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Failed to submit vote';
    
    return new Response(
      JSON.stringify({ error: errorMessage } satisfies ErrorResponse),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
