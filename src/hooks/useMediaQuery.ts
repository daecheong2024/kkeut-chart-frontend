import { useEffect, useState } from "react";

/**
 * Simple media query hook (client-only).
 * Example: const isMobile = useMediaQuery("(max-width: 767px)");
 */
export function useMediaQuery(query: string) {
  const get = () => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  };

  const [matches, setMatches] = useState<boolean>(get);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);

    const onChange = () => setMatches(mql.matches);

    // set immediately in case of hydration mismatch
    setMatches(mql.matches);

    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    // Safari < 14 fallback
    // eslint-disable-next-line deprecation/deprecation
    mql.addListener(onChange);
    // eslint-disable-next-line deprecation/deprecation
    return () => mql.removeListener(onChange);
  }, [query]);

  return matches;
}
