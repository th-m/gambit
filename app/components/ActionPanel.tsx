/**
 * ActionPanel Component
 *
 * Displays available character special abilities based on current phase.
 * Features:
 * - Filters available actions based on current phase
 * - Hides used one-time actions
 * - Displays action buttons with descriptions
 * - Integrates with TargetSelector when targets needed
 * - Submits action execution with visual feedback
 * - Shows confirmation/result with animations
 * - Handles execution errors with shake effect
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { actionRegistry, getUsedActionIds } from '~/registry/ActionRegistry';
import { characterRegistry } from '~/registry/CharacterRegistry';
import { TargetSelector } from '~/components/TargetSelector';
import { useEscapeKey, FOCUS_RING_CLASSES } from '~/hooks/useKeyboardNavigation';
import { ACTION_KEYFRAMES, ANIMATION_DURATIONS, ANIMATION_EASINGS } from '~/utils/animations';
import type {
  Player,
  Game,
  GameAction,
  GameContext,
  ActionDefinition,
  ActionId,
  ActionResult,
} from '~/types/game';

// =============================================================================
// Types
// =============================================================================

interface ActionPanelProps {
  /** Current player */
  player: Player;
  /** Current game state */
  game: Game;
  /** All players in the game */
  players: Player[];
  /** Game actions (for tracking used actions) */
  actions: GameAction[];
  /** Game context for action validation */
  ctx: GameContext;
  /** Callback to execute an action */
  onExecuteAction: (actionId: ActionId, targetIds: string[]) => Promise<ActionResult>;
}

type PanelState =
  | { type: 'idle' }
  | { type: 'selecting'; action: ActionDefinition }
  | { type: 'executing'; action: ActionDefinition }
  | { type: 'result'; action: ActionDefinition; result: ActionResult };

// =============================================================================
// Action Button Component
// =============================================================================

interface ActionButtonProps {
  action: ActionDefinition;
  onClick: () => void;
  disabled?: boolean;
}

function ActionButton({ action, onClick, disabled }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        w-full text-left p-3 rounded-lg transition-all duration-200
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-900
        ${disabled
          ? 'bg-stone-800 text-gray-600 cursor-not-allowed'
          : 'bg-stone-700 hover:bg-stone-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-amber-500/10 active:scale-[0.98] text-gray-200'
        }
      `}
    >
      <div className="flex items-center gap-3">
        <div className={`
          shrink-0 w-8 h-8 rounded-lg flex items-center justify-center
          ${disabled ? 'bg-stone-700' : 'bg-gradient-to-br from-amber-500/20 to-orange-500/20 group-hover:from-amber-500/30 group-hover:to-orange-500/30'}
          transition-colors duration-200
        `}>
          <span className="text-lg">⚡</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-amber-400">{action.name}</p>
          <p className="text-sm text-gray-400 mt-0.5 line-clamp-1">{action.description}</p>
        </div>
      </div>
    </button>
  );
}

// =============================================================================
// Result Display Component
// =============================================================================

interface ResultDisplayProps {
  action: ActionDefinition;
  result: ActionResult;
  onDismiss: () => void;
}

function ResultDisplay({ action, result, onDismiss }: ResultDisplayProps) {
  const isSuccess = result.success;
  const bgColor = isSuccess ? 'bg-green-900/30' : 'bg-red-900/30';
  const borderColor = isSuccess ? 'border-green-700' : 'border-red-700';
  const textColor = isSuccess ? 'text-green-400' : 'text-red-400';
  const iconColor = isSuccess ? 'text-green-500' : 'text-red-500';

  // Animation style based on result
  const animationStyle: React.CSSProperties = {
    animation: isSuccess
      ? `action-expand ${ANIMATION_DURATIONS.standard}ms ${ANIMATION_EASINGS.spring}, action-flash-success ${ANIMATION_DURATIONS.emphasis}ms ${ANIMATION_EASINGS.default}`
      : `action-expand ${ANIMATION_DURATIONS.standard}ms ${ANIMATION_EASINGS.spring}, action-shake ${ANIMATION_DURATIONS.standard}ms ${ANIMATION_EASINGS.default}`,
  };

  return (
    <div 
      className={`p-4 rounded-lg border ${bgColor} ${borderColor} overflow-hidden`}
      style={animationStyle}
    >
      {/* Impact burst effect on success */}
      {isSuccess && (
        <div 
          className="absolute inset-0 bg-green-400/20 rounded-lg pointer-events-none"
          style={{
            animation: `impact-burst ${ANIMATION_DURATIONS.emphasis}ms ${ANIMATION_EASINGS.decelerate} forwards`,
          }}
        />
      )}
      
      <div className="relative flex items-start gap-3">
        {/* Result icon with animation */}
        <div 
          className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${isSuccess ? 'bg-green-900/50' : 'bg-red-900/50'}`}
          style={{
            animation: `action-expand ${ANIMATION_DURATIONS.standard}ms ${ANIMATION_EASINGS.spring} ${ANIMATION_DURATIONS.fast}ms both`,
          }}
        >
          {isSuccess ? (
            <svg className={`w-6 h-6 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className={`w-6 h-6 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <p className={`font-semibold ${textColor}`}>
            {isSuccess ? 'Action Successful!' : 'Action Failed'}
          </p>
          <p className="text-sm text-gray-300 mt-1">{result.message}</p>
          {result.error && <p className="text-sm text-red-400 mt-1">{result.error}</p>}
          {result.gameEnded && result.winner && (
            <div 
              className="mt-2 px-3 py-2 rounded-lg bg-amber-900/30 border border-amber-600/30"
              style={{
                animation: `action-expand ${ANIMATION_DURATIONS.emphasis}ms ${ANIMATION_EASINGS.spring} ${ANIMATION_DURATIONS.standard}ms both`,
              }}
            >
              <p className="text-sm text-amber-400 font-semibold">
                🏆 Game Over! {result.winner === 'good' ? 'Good' : 'Evil'} team wins!
              </p>
            </div>
          )}
        </div>
      </div>
      
      <button
        type="button"
        onClick={onDismiss}
        className="mt-3 w-full py-2 px-3 rounded-lg bg-stone-700 text-gray-300 hover:bg-stone-600 transition-all duration-200 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-900 active:scale-[0.98]"
        style={{
          animation: `fade-in-up ${ANIMATION_DURATIONS.standard}ms ${ANIMATION_EASINGS.decelerate} ${ANIMATION_DURATIONS.standard}ms both`,
        }}
      >
        {result.gameEnded ? 'View Results' : 'Continue'}
      </button>
    </div>
  );
}

// =============================================================================
// Loading Spinner
// =============================================================================

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-4">
      <svg
        className="animate-spin h-6 w-6 text-amber-400"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <span className="ml-2 text-gray-400">Executing action...</span>
    </div>
  );
}

// =============================================================================
// Main ActionPanel Component
// =============================================================================

export function ActionPanel({
  player,
  game,
  players,
  actions,
  ctx,
  onExecuteAction,
}: ActionPanelProps) {
  const [state, setState] = useState<PanelState>({ type: 'idle' });
  const lastClickRef = useRef<number>(0);
  const CLICK_DEBOUNCE_MS = 500;

  // Escape key closes target selector
  useEscapeKey(() => {
    if (state.type === 'selecting') {
      setState({ type: 'idle' });
    }
  }, state.type === 'selecting');

  // Get character definition to find available actions
  const characterDef = player.character ? characterRegistry.get(player.character) : null;
  const characterActions = characterDef?.actions ?? [];

  // Get used action IDs for this player
  const usedActionIds = getUsedActionIds(player.id, actions);

  // Get available actions based on phase, character, and use limits
  const availableActions = actionRegistry.getAvailableActions(ctx, characterActions, usedActionIds);

  // Handle action click
  const handleActionClick = useCallback(
    (action: ActionDefinition) => {
      // Debounce clicks
      const now = Date.now();
      if (now - lastClickRef.current < CLICK_DEBOUNCE_MS) {
        return;
      }
      lastClickRef.current = now;

      // Check if action requires targets
      if (action.minTargets > 0) {
        setState({ type: 'selecting', action });
      } else {
        // Execute immediately if no targets needed
        executeActionWithTargets(action, []);
      }
    },
    [ctx]
  );

  // Execute action with selected targets
  const executeActionWithTargets = useCallback(
    async (action: ActionDefinition, targetIds: string[]) => {
      setState({ type: 'executing', action });

      try {
        const result = await onExecuteAction(action.id, targetIds);
        setState({ type: 'result', action, result });
      } catch (error) {
        setState({
          type: 'result',
          action,
          result: {
            success: false,
            message: 'Failed to execute action',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    },
    [onExecuteAction]
  );

  // Handle target selection complete
  const handleTargetsSelected = useCallback(
    (targetIds: string[]) => {
      if (state.type !== 'selecting') return;
      executeActionWithTargets(state.action, targetIds);
    },
    [state, executeActionWithTargets]
  );

  // Handle cancel
  const handleCancel = useCallback(() => {
    setState({ type: 'idle' });
  }, []);

  // Handle dismiss result
  const handleDismissResult = useCallback(() => {
    setState({ type: 'idle' });
  }, []);

  // Don't render if player has no character or no actions
  if (!characterDef || characterActions.length === 0) {
    return null;
  }

  // Don't render if no actions available in current phase
  if (availableActions.length === 0 && state.type === 'idle') {
    // Show disabled state with used actions info
    const hasUsedAllActions = characterActions.every((actionId) =>
      usedActionIds.includes(actionId)
    );

    if (hasUsedAllActions) {
      return (
        <div className="bg-stone-800 rounded-xl p-4 border border-stone-700">
          <h3 className="font-semibold mb-2 text-gray-300">Special Ability</h3>
          <p className="text-sm text-gray-500">All abilities have been used</p>
        </div>
      );
    }

    return (
      <div className="bg-stone-800 rounded-xl p-4 border border-stone-700">
        <h3 className="font-semibold mb-2 text-gray-300">Special Ability</h3>
        <p className="text-sm text-gray-500">No actions available in this phase</p>
      </div>
    );
  }

  return (
    <div className="bg-stone-800 rounded-xl p-4 border border-stone-700 relative overflow-hidden">
      {/* Inject animation keyframes */}
      <style dangerouslySetInnerHTML={{ __html: ACTION_KEYFRAMES }} />
      
      <h3 className="font-semibold mb-3 text-gray-300">Special Ability</h3>

      {/* Idle State - Show action buttons */}
      {state.type === 'idle' && (
        <div className="space-y-2">
          {availableActions.map((action) => (
            <ActionButton
              key={action.id}
              action={action}
              onClick={() => handleActionClick(action)}
            />
          ))}
          {/* Show phase indicator if actions are available */}
          <p className="text-xs text-green-400 mt-2">Available this phase</p>
        </div>
      )}

      {/* Selecting Targets State */}
      {state.type === 'selecting' && (
        <TargetSelector
          action={state.action}
          players={players}
          currentPlayerId={player.id}
          ctx={ctx}
          onSelect={handleTargetsSelected}
          onCancel={handleCancel}
        />
      )}

      {/* Executing State */}
      {state.type === 'executing' && <LoadingSpinner />}

      {/* Result State */}
      {state.type === 'result' && (
        <ResultDisplay
          action={state.action}
          result={state.result}
          onDismiss={handleDismissResult}
        />
      )}
    </div>
  );
}

export default ActionPanel;
