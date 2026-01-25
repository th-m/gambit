/**
 * useKeyboardNavigation Hook
 *
 * Provides keyboard navigation support for grid-based player selection interfaces.
 * Features:
 * - Arrow key navigation (up, down, left, right)
 * - Enter/Space to select items
 * - Escape to cancel/close
 * - Tab order management
 * - Focus management for accessibility
 */

import { useCallback, useRef, useEffect } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface KeyboardNavigationOptions {
  /** Number of columns in the grid */
  columns: number;
  /** Total number of items in the grid */
  itemCount: number;
  /** Callback when an item is selected via Enter/Space */
  onSelect?: (index: number) => void;
  /** Callback when Escape is pressed */
  onEscape?: () => void;
  /** Whether navigation is enabled (default: true) */
  enabled?: boolean;
  /** Wrap around when reaching edges (default: true) */
  wrapAround?: boolean;
  /** Initial focused index (default: 0) */
  initialIndex?: number;
  /** Callback when focused index changes */
  onFocusChange?: (index: number) => void;
}

export interface KeyboardNavigationResult {
  /** Current focused index */
  focusedIndex: number;
  /** Set the focused index manually */
  setFocusedIndex: (index: number) => void;
  /** Props to spread on the container element */
  containerProps: {
    role: 'grid';
    'aria-label': string;
    onKeyDown: (e: React.KeyboardEvent) => void;
    tabIndex: number;
  };
  /** Generate props for each item in the grid */
  getItemProps: (index: number) => {
    tabIndex: number;
    'data-focused': boolean;
    'aria-selected'?: boolean;
    onFocus: () => void;
    ref: (el: HTMLElement | null) => void;
  };
  /** Reset focus to initial index */
  resetFocus: () => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useKeyboardNavigation({
  columns,
  itemCount,
  onSelect,
  onEscape,
  enabled = true,
  wrapAround = true,
  initialIndex = 0,
  onFocusChange,
}: KeyboardNavigationOptions): KeyboardNavigationResult {
  // Store focused index in ref to avoid re-renders during navigation
  const focusedIndexRef = useRef(initialIndex);
  const itemRefs = useRef<Map<number, HTMLElement>>(new Map());

  // Calculate next index based on direction
  const getNextIndex = useCallback(
    (currentIndex: number, direction: 'up' | 'down' | 'left' | 'right'): number => {
      if (itemCount === 0) return 0;

      const rows = Math.ceil(itemCount / columns);
      const currentRow = Math.floor(currentIndex / columns);
      const currentCol = currentIndex % columns;

      let nextIndex = currentIndex;

      switch (direction) {
        case 'up': {
          if (currentRow > 0) {
            nextIndex = currentIndex - columns;
          } else if (wrapAround) {
            // Wrap to same column in last row
            const lastRowStartIndex = (rows - 1) * columns;
            const targetIndex = lastRowStartIndex + currentCol;
            nextIndex = targetIndex < itemCount ? targetIndex : itemCount - 1;
          }
          break;
        }
        case 'down': {
          const nextRowIndex = currentIndex + columns;
          if (nextRowIndex < itemCount) {
            nextIndex = nextRowIndex;
          } else if (wrapAround) {
            // Wrap to same column in first row
            nextIndex = currentCol;
          }
          break;
        }
        case 'left': {
          if (currentCol > 0) {
            nextIndex = currentIndex - 1;
          } else if (wrapAround) {
            // Wrap to last column of previous row or last item
            if (currentRow > 0) {
              const prevRowLastCol = (currentRow * columns) - 1;
              nextIndex = Math.min(prevRowLastCol, itemCount - 1);
            } else {
              nextIndex = itemCount - 1;
            }
          }
          break;
        }
        case 'right': {
          if (currentCol < columns - 1 && currentIndex + 1 < itemCount) {
            nextIndex = currentIndex + 1;
          } else if (wrapAround) {
            // Wrap to first column of next row or first item
            if (currentRow < rows - 1) {
              nextIndex = (currentRow + 1) * columns;
              if (nextIndex >= itemCount) nextIndex = 0;
            } else {
              nextIndex = 0;
            }
          }
          break;
        }
      }

      return nextIndex;
    },
    [columns, itemCount, wrapAround]
  );

  // Focus the item at the given index
  const focusItem = useCallback((index: number) => {
    const element = itemRefs.current.get(index);
    if (element) {
      element.focus();
    }
  }, []);

  // Set focused index and optionally focus the element
  const setFocusedIndex = useCallback(
    (index: number, shouldFocus = true) => {
      const clampedIndex = Math.max(0, Math.min(index, itemCount - 1));
      focusedIndexRef.current = clampedIndex;
      onFocusChange?.(clampedIndex);
      if (shouldFocus) {
        focusItem(clampedIndex);
      }
    },
    [itemCount, focusItem, onFocusChange]
  );

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!enabled) return;

      const currentIndex = focusedIndexRef.current;
      let nextIndex = currentIndex;
      let handled = false;

      switch (e.key) {
        case 'ArrowUp':
          nextIndex = getNextIndex(currentIndex, 'up');
          handled = true;
          break;
        case 'ArrowDown':
          nextIndex = getNextIndex(currentIndex, 'down');
          handled = true;
          break;
        case 'ArrowLeft':
          nextIndex = getNextIndex(currentIndex, 'left');
          handled = true;
          break;
        case 'ArrowRight':
          nextIndex = getNextIndex(currentIndex, 'right');
          handled = true;
          break;
        case 'Enter':
        case ' ':
          onSelect?.(currentIndex);
          handled = true;
          break;
        case 'Escape':
          onEscape?.();
          handled = true;
          break;
        case 'Home':
          nextIndex = 0;
          handled = true;
          break;
        case 'End':
          nextIndex = itemCount - 1;
          handled = true;
          break;
      }

      if (handled) {
        e.preventDefault();
        e.stopPropagation();

        if (nextIndex !== currentIndex) {
          setFocusedIndex(nextIndex);
        }
      }
    },
    [enabled, getNextIndex, onSelect, onEscape, itemCount, setFocusedIndex]
  );

  // Reset focus to initial index
  const resetFocus = useCallback(() => {
    setFocusedIndex(initialIndex, false);
  }, [initialIndex, setFocusedIndex]);

  // Generate props for each item
  const getItemProps = useCallback(
    (index: number) => ({
      tabIndex: index === focusedIndexRef.current ? 0 : -1,
      'data-focused': index === focusedIndexRef.current,
      onFocus: () => {
        focusedIndexRef.current = index;
        onFocusChange?.(index);
      },
      ref: (el: HTMLElement | null) => {
        if (el) {
          itemRefs.current.set(index, el);
        } else {
          itemRefs.current.delete(index);
        }
      },
    }),
    [onFocusChange]
  );

  // Container props
  const containerProps = {
    role: 'grid' as const,
    'aria-label': 'Player selection grid',
    onKeyDown: handleKeyDown,
    tabIndex: -1,
  };

  return {
    focusedIndex: focusedIndexRef.current,
    setFocusedIndex,
    containerProps,
    getItemProps,
    resetFocus,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Focus ring classes for consistent accessible focus styles.
 * Use these classes on interactive elements to ensure visible focus indicators.
 */
export const FOCUS_RING_CLASSES = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-900';

export const FOCUS_RING_AMBER = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-900';

/**
 * Create an Escape key handler for closing modals/panels.
 */
export function useEscapeKey(onEscape: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onEscape();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onEscape, enabled]);
}

export default useKeyboardNavigation;
