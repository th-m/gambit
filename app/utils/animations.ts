/**
 * Animation Utilities
 *
 * Shared animation constants, keyframes, and utilities for game UI components.
 * This module provides:
 * - CSS keyframes as injectable style strings
 * - Animation class name generators
 * - Transition timing utilities
 * - Reusable animation configurations
 */

// =============================================================================
// Animation Timing Constants
// =============================================================================

export const ANIMATION_DURATIONS = {
  /** Fast micro-interactions (button feedback, small state changes) */
  fast: 150,
  /** Standard transitions (selection changes, panel reveals) */
  standard: 300,
  /** Emphasis transitions (phase changes, important reveals) */
  emphasis: 500,
  /** Dramatic reveals (vote results, game over) */
  dramatic: 800,
  /** Stagger delay between sequential items */
  stagger: 80,
} as const;

export const ANIMATION_EASINGS = {
  /** Standard ease for most transitions */
  default: 'cubic-bezier(0.4, 0, 0.2, 1)',
  /** Bounce effect for selection feedback */
  bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  /** Smooth deceleration for entrances */
  decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
  /** Accelerate for exits */
  accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
  /** Elastic for playful interactions */
  elastic: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  /** Spring-like for natural motion */
  spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
} as const;

// =============================================================================
// Keyframe Definitions
// =============================================================================

/**
 * CSS keyframes for phase transitions.
 * Includes entrance, exit, and emphasis animations.
 */
export const PHASE_TRANSITION_KEYFRAMES = `
  @keyframes phase-enter {
    0% {
      opacity: 0;
      transform: translateY(16px) scale(0.96);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes phase-exit {
    0% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    100% {
      opacity: 0;
      transform: translateY(-16px) scale(0.96);
    }
  }

  @keyframes phase-pulse {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.8;
      transform: scale(1.02);
    }
  }

  @keyframes phase-glow {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
    }
    50% {
      box-shadow: 0 0 20px 4px rgba(59, 130, 246, 0.3);
    }
  }
`;

/**
 * CSS keyframes for player selection feedback.
 * Includes selection, deselection, and hover effects.
 */
export const SELECTION_KEYFRAMES = `
  @keyframes selection-pop {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.08);
    }
    100% {
      transform: scale(1.03);
    }
  }

  @keyframes selection-ripple {
    0% {
      transform: scale(0);
      opacity: 0.6;
    }
    100% {
      transform: scale(2.5);
      opacity: 0;
    }
  }

  @keyframes selection-check {
    0% {
      transform: scale(0) rotate(-180deg);
      opacity: 0;
    }
    60% {
      transform: scale(1.2) rotate(10deg);
    }
    100% {
      transform: scale(1) rotate(0deg);
      opacity: 1;
    }
  }

  @keyframes selection-uncheck {
    0% {
      transform: scale(1) rotate(0deg);
      opacity: 1;
    }
    100% {
      transform: scale(0) rotate(180deg);
      opacity: 0;
    }
  }

  @keyframes selection-highlight {
    0% {
      box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5);
    }
    70% {
      box-shadow: 0 0 0 8px rgba(59, 130, 246, 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
    }
  }

  @keyframes card-hover-lift {
    0% {
      transform: translateY(0);
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    100% {
      transform: translateY(-4px);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25);
    }
  }
`;

/**
 * CSS keyframes for action execution effects.
 * Includes success, failure, and in-progress animations.
 */
export const ACTION_KEYFRAMES = `
  @keyframes action-flash-success {
    0% {
      background-color: transparent;
    }
    25% {
      background-color: rgba(34, 197, 94, 0.3);
    }
    100% {
      background-color: transparent;
    }
  }

  @keyframes action-flash-failure {
    0% {
      background-color: transparent;
    }
    25% {
      background-color: rgba(239, 68, 68, 0.3);
    }
    100% {
      background-color: transparent;
    }
  }

  @keyframes action-shake {
    0%, 100% {
      transform: translateX(0);
    }
    10%, 30%, 50%, 70%, 90% {
      transform: translateX(-4px);
    }
    20%, 40%, 60%, 80% {
      transform: translateX(4px);
    }
  }

  @keyframes action-pulse {
    0%, 100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.05);
      opacity: 0.8;
    }
  }

  @keyframes action-spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes action-expand {
    0% {
      transform: scale(0.8);
      opacity: 0;
    }
    60% {
      transform: scale(1.1);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  @keyframes target-ping {
    0% {
      transform: scale(1);
      opacity: 0.8;
    }
    75%, 100% {
      transform: scale(1.5);
      opacity: 0;
    }
  }

  @keyframes impact-burst {
    0% {
      transform: scale(0);
      opacity: 1;
    }
    100% {
      transform: scale(2);
      opacity: 0;
    }
  }

  @keyframes fade-in-up {
    0% {
      opacity: 0;
      transform: translateY(10px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

/**
 * CSS keyframes for loading and progress animations.
 */
export const LOADING_KEYFRAMES = `
  @keyframes skeleton-shimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }

  @keyframes loading-dots {
    0%, 20% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.3);
      opacity: 0.5;
    }
    80%, 100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  @keyframes progress-fill {
    0% {
      width: 0%;
    }
    100% {
      width: var(--progress-width, 100%);
    }
  }

  @keyframes fade-in-up {
    0% {
      opacity: 0;
      transform: translateY(10px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes fade-out-down {
    0% {
      opacity: 1;
      transform: translateY(0);
    }
    100% {
      opacity: 0;
      transform: translateY(10px);
    }
  }
`;

/**
 * CSS keyframes for vote and result reveals.
 */
export const VOTE_REVEAL_KEYFRAMES = `
  @keyframes vote-flip {
    0% {
      transform: rotateY(0deg);
    }
    50% {
      transform: rotateY(90deg);
    }
    100% {
      transform: rotateY(0deg);
    }
  }

  @keyframes vote-reveal {
    0% {
      transform: scale(0) rotateY(90deg);
      opacity: 0;
    }
    60% {
      transform: scale(1.1) rotateY(-10deg);
    }
    100% {
      transform: scale(1) rotateY(0deg);
      opacity: 1;
    }
  }

  @keyframes vote-count-up {
    0% {
      transform: scale(1.3);
      opacity: 0.5;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  @keyframes result-banner-enter {
    0% {
      transform: scale(0.8) translateY(-20px);
      opacity: 0;
    }
    60% {
      transform: scale(1.05) translateY(5px);
    }
    100% {
      transform: scale(1) translateY(0);
      opacity: 1;
    }
  }
`;

// =============================================================================
// Combined Keyframes String
// =============================================================================

/**
 * All animation keyframes combined.
 * Inject this into a <style> tag for use throughout the app.
 */
export const ALL_ANIMATION_KEYFRAMES = `
${PHASE_TRANSITION_KEYFRAMES}
${SELECTION_KEYFRAMES}
${ACTION_KEYFRAMES}
${LOADING_KEYFRAMES}
${VOTE_REVEAL_KEYFRAMES}
`;

// =============================================================================
// Animation Class Generators
// =============================================================================

/**
 * Get animation style for phase transitions.
 */
export function getPhaseTransitionStyle(isEntering: boolean): React.CSSProperties {
  return {
    animation: `${isEntering ? 'phase-enter' : 'phase-exit'} ${ANIMATION_DURATIONS.emphasis}ms ${ANIMATION_EASINGS.decelerate} forwards`,
  };
}

/**
 * Get animation style for selection feedback.
 */
export function getSelectionStyle(isSelected: boolean, wasJustChanged: boolean): React.CSSProperties {
  if (!wasJustChanged) {
    return {};
  }
  
  return {
    animation: isSelected 
      ? `selection-pop ${ANIMATION_DURATIONS.standard}ms ${ANIMATION_EASINGS.bounce}, selection-highlight ${ANIMATION_DURATIONS.emphasis}ms ${ANIMATION_EASINGS.default}`
      : 'none',
  };
}

/**
 * Get animation style for action execution result.
 */
export function getActionResultStyle(success: boolean): React.CSSProperties {
  return {
    animation: success
      ? `action-flash-success ${ANIMATION_DURATIONS.emphasis}ms ${ANIMATION_EASINGS.default}, action-expand ${ANIMATION_DURATIONS.standard}ms ${ANIMATION_EASINGS.spring}`
      : `action-flash-failure ${ANIMATION_DURATIONS.emphasis}ms ${ANIMATION_EASINGS.default}, action-shake ${ANIMATION_DURATIONS.standard}ms ${ANIMATION_EASINGS.default}`,
  };
}

/**
 * Get staggered animation delay for list items.
 */
export function getStaggerDelay(index: number, baseDelay: number = 0): React.CSSProperties {
  return {
    animationDelay: `${baseDelay + index * ANIMATION_DURATIONS.stagger}ms`,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create a delay promise for sequencing animations.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a unique animation key for React key prop.
 * Useful for forcing re-render with fresh animation.
 */
export function generateAnimationKey(prefix: string = 'anim'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if reduced motion is preferred.
 * Returns true if user prefers reduced motion.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Get animation duration respecting reduced motion preference.
 */
export function getReducedMotionDuration(normalDuration: number): number {
  return prefersReducedMotion() ? 0 : normalDuration;
}

// =============================================================================
// Animation CSS Classes (Tailwind-compatible)
// =============================================================================

/**
 * Tailwind animation class presets.
 * These can be used directly in className props.
 */
export const ANIMATION_CLASSES = {
  /** Fade in from below */
  fadeInUp: 'animate-[fade-in-up_300ms_ease-out_forwards]',
  /** Fade out to below */
  fadeOutDown: 'animate-[fade-out-down_200ms_ease-in_forwards]',
  /** Pop effect for selection */
  selectionPop: 'animate-[selection-pop_300ms_cubic-bezier(0.34,1.56,0.64,1)]',
  /** Shake effect for errors */
  shake: 'animate-[action-shake_300ms_ease-in-out]',
  /** Pulse effect */
  pulse: 'animate-[action-pulse_1000ms_ease-in-out_infinite]',
  /** Spin for loading */
  spin: 'animate-[action-spin_1000ms_linear_infinite]',
  /** Phase enter */
  phaseEnter: 'animate-[phase-enter_500ms_cubic-bezier(0,0,0.2,1)_forwards]',
  /** Phase glow */
  phaseGlow: 'animate-[phase-glow_2000ms_ease-in-out_infinite]',
  /** Result banner enter */
  resultBanner: 'animate-[result-banner-enter_600ms_cubic-bezier(0.175,0.885,0.32,1.275)_forwards]',
  /** Vote reveal */
  voteReveal: 'animate-[vote-reveal_400ms_cubic-bezier(0.175,0.885,0.32,1.275)_forwards]',
} as const;

// =============================================================================
// Helper for Injecting Animations
// =============================================================================

/**
 * Get the HTML string for injecting animation styles.
 * Use this with dangerouslySetInnerHTML in a style tag.
 * 
 * @example
 * ```tsx
 * <style dangerouslySetInnerHTML={{ __html: getAnimationStylesHTML() }} />
 * ```
 */
export function getAnimationStylesHTML(): string {
  return ALL_ANIMATION_KEYFRAMES;
}

export default {
  ANIMATION_DURATIONS,
  ANIMATION_EASINGS,
  ANIMATION_CLASSES,
  getAnimationStylesHTML,
  getPhaseTransitionStyle,
  getSelectionStyle,
  getActionResultStyle,
  getStaggerDelay,
  delay,
  generateAnimationKey,
  prefersReducedMotion,
  getReducedMotionDuration,
};
