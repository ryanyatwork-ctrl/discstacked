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
    if (pinned) return;

    const target = scrollRef?.current ?? window;
    const getScrollY = () =>
      scrollRef?.current ? scrollRef.current.scrollTop : window.scrollY;

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;

      requestAnimationFrame(() => {
        const currentY = getScrollY();
        const delta = currentY - lastScrollY.current;

        if (currentY < 60) {
          setVisible(true);
        } else if (delta > 8) {
          setVisible(false);
        } else if (delta < -8) {
          setVisible(true);
        }

        lastScrollY.current = currentY;
        ticking.current = false;
      });
    };

    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [pinned, scrollRef]);

  return { visible: pinned || visible, pinned, togglePin };
}
