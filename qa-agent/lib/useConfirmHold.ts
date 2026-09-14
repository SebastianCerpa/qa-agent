'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// One shared "click again to confirm" window for every destructive action in
// the app (conversation delete, Stop on a run that already wrote files) —
// previously each site invented its own timeout (2500ms vs 3000ms) and label
// treatment. Picked the tighter of the two: a shorter re-click window is
// safer, not friendlier, for a destructive confirmation.
export const CONFIRM_HOLD_MS = 2500;

export function useConfirmHold() {
  const [confirming, setConfirming] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const cancel = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setConfirming(false);
  }, []);

  // First call arms the confirm window and returns false. A second call
  // within CONFIRM_HOLD_MS clears it and returns true — the caller should
  // perform the destructive action only when this returns true.
  const trigger = useCallback(() => {
    if (!confirming) {
      setConfirming(true);
      timeoutRef.current = setTimeout(() => setConfirming(false), CONFIRM_HOLD_MS);
      return false;
    }
    cancel();
    return true;
  }, [confirming, cancel]);

  return { confirming, trigger, cancel };
}
