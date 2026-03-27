import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { useLiveData } from './useLiveData';

describe('useLiveData', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not call fetchFn on mount when skipInitialRun is true', () => {
    const fetchFn = vi.fn();
    function Host() {
      useLiveData({ fetchFn, intervalMs: 5000, enabled: true, skipInitialRun: true });
      return null;
    }
    render(<Host />);
    expect(fetchFn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('calls fetchFn once on mount by default', () => {
    const fetchFn = vi.fn();
    function Host() {
      useLiveData({ fetchFn, intervalMs: 5000, enabled: true });
      return null;
    }
    render(<Host />);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
