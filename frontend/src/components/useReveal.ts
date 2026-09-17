import { useEffect, useRef } from "react";
export default function useReveal(key: unknown) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!key) return;
    const frame = requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ block: "start", behavior: "instant" });
      ref.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [key]);
  return ref;
}
