/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKeyboardNavigation, useEscapeKey, FOCUS_RING_CLASSES, FOCUS_RING_AMBER } from './useKeyboardNavigation';

describe('useKeyboardNavigation', () => {
  describe('initialization', () => {
    it('should initialize with focusedIndex at 0 by default', () => {
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          columns: 3,
          itemCount: 9,
        })
      );

      expect(result.current.focusedIndex).toBe(0);
    });

    it('should initialize with custom initialIndex', () => {
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          columns: 3,
          itemCount: 9,
          initialIndex: 4,
        })
      );

      expect(result.current.focusedIndex).toBe(4);
    });

    it('should return containerProps with correct role', () => {
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          columns: 3,
          itemCount: 9,
        })
      );

      expect(result.current.containerProps.role).toBe('grid');
      expect(result.current.containerProps['aria-label']).toBe('Player selection grid');
    });
  });

  describe('getItemProps', () => {
    it('should return tabIndex 0 for focused item, -1 for others', () => {
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          columns: 3,
          itemCount: 9,
          initialIndex: 2,
        })
      );

      expect(result.current.getItemProps(2).tabIndex).toBe(0);
      expect(result.current.getItemProps(0).tabIndex).toBe(-1);
      expect(result.current.getItemProps(5).tabIndex).toBe(-1);
    });

    it('should set data-focused correctly', () => {
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          columns: 3,
          itemCount: 9,
          initialIndex: 1,
        })
      );

      expect(result.current.getItemProps(1)['data-focused']).toBe(true);
      expect(result.current.getItemProps(0)['data-focused']).toBe(false);
    });
  });

  describe('keyboard navigation', () => {
    it('should navigate right with ArrowRight key', () => {
      const onFocusChange = vi.fn();
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          columns: 3,
          itemCount: 9,
          onFocusChange,
        })
      );

      const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
      act(() => {
        result.current.containerProps.onKeyDown(event as any);
      });

      expect(onFocusChange).toHaveBeenCalledWith(1);
    });

    it('should navigate left with ArrowLeft key', () => {
      const onFocusChange = vi.fn();
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          columns: 3,
          itemCount: 9,
          initialIndex: 1,
          onFocusChange,
        })
      );

      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
      act(() => {
        result.current.containerProps.onKeyDown(event as any);
      });

      expect(onFocusChange).toHaveBeenCalledWith(0);
    });

    it('should navigate down with ArrowDown key', () => {
      const onFocusChange = vi.fn();
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          columns: 3,
          itemCount: 9,
          initialIndex: 1,
          onFocusChange,
        })
      );

      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      act(() => {
        result.current.containerProps.onKeyDown(event as any);
      });

      expect(onFocusChange).toHaveBeenCalledWith(4); // 1 + 3 columns
    });

    it('should navigate up with ArrowUp key', () => {
      const onFocusChange = vi.fn();
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          columns: 3,
          itemCount: 9,
          initialIndex: 4,
          onFocusChange,
        })
      );

      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
      act(() => {
        result.current.containerProps.onKeyDown(event as any);
      });

      expect(onFocusChange).toHaveBeenCalledWith(1); // 4 - 3 columns
    });

    it('should wrap around right edge when wrapAround is true', () => {
      const onFocusChange = vi.fn();
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          columns: 3,
          itemCount: 9,
          initialIndex: 2, // Last item in first row
          wrapAround: true,
          onFocusChange,
        })
      );

      const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
      act(() => {
        result.current.containerProps.onKeyDown(event as any);
      });

      expect(onFocusChange).toHaveBeenCalledWith(3); // First item in second row
    });

    it('should wrap around left edge when wrapAround is true', () => {
      const onFocusChange = vi.fn();
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          columns: 3,
          itemCount: 9,
          initialIndex: 3, // First item in second row
          wrapAround: true,
          onFocusChange,
        })
      );

      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
      act(() => {
        result.current.containerProps.onKeyDown(event as any);
      });

      expect(onFocusChange).toHaveBeenCalledWith(2); // Last item in first row
    });

    it('should wrap around bottom edge when wrapAround is true', () => {
      const onFocusChange = vi.fn();
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          columns: 3,
          itemCount: 9,
          initialIndex: 7, // Middle of last row
          wrapAround: true,
          onFocusChange,
        })
      );

      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      act(() => {
        result.current.containerProps.onKeyDown(event as any);
      });

      expect(onFocusChange).toHaveBeenCalledWith(1); // Middle of first row
    });

    it('should wrap around top edge when wrapAround is true', () => {
      const onFocusChange = vi.fn();
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          columns: 3,
          itemCount: 9,
          initialIndex: 1, // Middle of first row
          wrapAround: true,
          onFocusChange,
        })
      );

      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
      act(() => {
        result.current.containerProps.onKeyDown(event as any);
      });

      expect(onFocusChange).toHaveBeenCalledWith(7); // Middle of last row
    });

    it('should not wrap around when wrapAround is false', () => {
      const onFocusChange = vi.fn();
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          columns: 3,
          itemCount: 9,
          initialIndex: 0,
          wrapAround: false,
          onFocusChange,
        })
      );

      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
      act(() => {
        result.current.containerProps.onKeyDown(event as any);
      });

      // Should not change when at left edge
      expect(onFocusChange).not.toHaveBeenCalled();
    });

    it('should not navigate when disabled', () => {
      const onFocusChange = vi.fn();
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          columns: 3,
          itemCount: 9,
          enabled: false,
          onFocusChange,
        })
      );

      const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
      act(() => {
        result.current.containerProps.onKeyDown(event as any);
      });

      expect(onFocusChange).not.toHaveBeenCalled();
    });
  });

  describe('selection with Enter/Space', () => {
    it('should call onSelect with current index on Enter', () => {
      const onSelect = vi.fn();
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          columns: 3,
          itemCount: 9,
          initialIndex: 4,
          onSelect,
        })
      );

      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      act(() => {
        result.current.containerProps.onKeyDown(event as any);
      });

      expect(onSelect).toHaveBeenCalledWith(4);
    });

    it('should call onSelect with current index on Space', () => {
      const onSelect = vi.fn();
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          columns: 3,
          itemCount: 9,
          initialIndex: 2,
          onSelect,
        })
      );

      const event = new KeyboardEvent('keydown', { key: ' ' });
      act(() => {
        result.current.containerProps.onKeyDown(event as any);
      });

      expect(onSelect).toHaveBeenCalledWith(2);
    });
  });

  describe('Escape key handling', () => {
    it('should call onEscape when Escape is pressed', () => {
      const onEscape = vi.fn();
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          columns: 3,
          itemCount: 9,
          onEscape,
        })
      );

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      act(() => {
        result.current.containerProps.onKeyDown(event as any);
      });

      expect(onEscape).toHaveBeenCalled();
    });
  });

  describe('Home/End keys', () => {
    it('should navigate to first item on Home', () => {
      const onFocusChange = vi.fn();
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          columns: 3,
          itemCount: 9,
          initialIndex: 5,
          onFocusChange,
        })
      );

      const event = new KeyboardEvent('keydown', { key: 'Home' });
      act(() => {
        result.current.containerProps.onKeyDown(event as any);
      });

      expect(onFocusChange).toHaveBeenCalledWith(0);
    });

    it('should navigate to last item on End', () => {
      const onFocusChange = vi.fn();
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          columns: 3,
          itemCount: 9,
          initialIndex: 2,
          onFocusChange,
        })
      );

      const event = new KeyboardEvent('keydown', { key: 'End' });
      act(() => {
        result.current.containerProps.onKeyDown(event as any);
      });

      expect(onFocusChange).toHaveBeenCalledWith(8);
    });
  });

  describe('setFocusedIndex', () => {
    it('should allow manual focus changes', () => {
      const onFocusChange = vi.fn();
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          columns: 3,
          itemCount: 9,
          onFocusChange,
        })
      );

      act(() => {
        result.current.setFocusedIndex(5);
      });

      expect(onFocusChange).toHaveBeenCalledWith(5);
    });

    it('should clamp index to valid range', () => {
      const onFocusChange = vi.fn();
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          columns: 3,
          itemCount: 9,
          onFocusChange,
        })
      );

      act(() => {
        result.current.setFocusedIndex(100);
      });

      expect(onFocusChange).toHaveBeenCalledWith(8); // Clamped to itemCount - 1
    });
  });

  describe('resetFocus', () => {
    it('should reset to initial index', () => {
      const onFocusChange = vi.fn();
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          columns: 3,
          itemCount: 9,
          initialIndex: 3,
          onFocusChange,
        })
      );

      // Navigate away
      act(() => {
        result.current.setFocusedIndex(7);
      });

      // Reset
      act(() => {
        result.current.resetFocus();
      });

      // Should be back at initial index
      expect(onFocusChange).toHaveBeenLastCalledWith(3);
    });
  });
});

describe('useEscapeKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should call callback when Escape is pressed', () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(onEscape, true));

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);
    });

    expect(onEscape).toHaveBeenCalled();
  });

  it('should not call callback when disabled', () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(onEscape, false));

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);
    });

    expect(onEscape).not.toHaveBeenCalled();
  });

  it('should not call callback for other keys', () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(onEscape, true));

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      document.dispatchEvent(event);
    });

    expect(onEscape).not.toHaveBeenCalled();
  });

  it('should cleanup listener on unmount', () => {
    const onEscape = vi.fn();
    const { unmount } = renderHook(() => useEscapeKey(onEscape, true));

    unmount();

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);
    });

    expect(onEscape).not.toHaveBeenCalled();
  });
});

describe('Focus ring class constants', () => {
  it('should export FOCUS_RING_CLASSES', () => {
    expect(FOCUS_RING_CLASSES).toContain('focus-visible:ring-blue-500');
  });

  it('should export FOCUS_RING_AMBER', () => {
    expect(FOCUS_RING_AMBER).toContain('focus-visible:ring-amber-500');
  });
});
