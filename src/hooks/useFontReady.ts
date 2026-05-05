import { useEffect, useState } from 'react'

/**
 * Resolves to true once the named font is loaded by the browser.
 * Uses the CSS Font Loading API. Server / unsupported environments
 * fall back to immediate true so SSR / older browsers don't hang.
 */
export function useFontReady(family: string, sample = '1rem'): boolean {
  const [ready, setReady] = useState(() => typeof document === 'undefined')

  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts?.load) {
      setReady(true)
      return
    }
    let cancelled = false
    document.fonts
      .load(`${sample} "${family}"`)
      .then(() => {
        if (!cancelled) setReady(true)
      })
      .catch(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [family, sample])

  return ready
}
