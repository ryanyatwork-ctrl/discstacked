import { useState, useEffect, useCallback, useRef, RefObject } from "react";

export function useAutoHideHeader(scrollRef?: RefObject<HTMLElement | null>) {
  const [pinned, setPinned] = useState(() => {
    try {
      return localStorage.getItem("ds-header-pinned") === "true";
    } catch {
      return false;
    }
  });
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  const togglePin = useCallback(() => {
    setPinned((prev) => {
      const next = !prev;
      try { localStorage.setItem("ds-header-pinned", String(next)); } catch {}
      if (next) setVisible(true);
      return next;
    });
  }, []);

  useEffect(() => {
    setVisible(true);
    ticking.current = false;
    lastScrollY.current = 0;
  }, [scrollRef, pinned]);

  // Keep the stats ribbon visible for now. The previous auto-hide behavior
  // changed layout height while the user scrolled, which caused card jitter.
  return { visible: true, pinned, togglePin };
}
