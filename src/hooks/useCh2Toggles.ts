import { useEffect, useState } from 'react'

interface State {
  showDecor: boolean
  showAihub: boolean
  signsLineup: boolean
}

let globalState: State = { showDecor: true, showAihub: true, signsLineup: false }
const listeners = new Set<(v: State) => void>()

function setGlobal(next: Partial<State>) {
  globalState = { ...globalState, ...next }
  listeners.forEach(fn => fn(globalState))
}

export function useCh2Toggles(): [State, (k: keyof State) => void] {
  const [state, setState] = useState(globalState)
  useEffect(() => {
    const handler = (v: State) => setState(v)
    listeners.add(handler)
    return () => { listeners.delete(handler) }
  }, [])
  const toggle = (k: keyof State) => setGlobal({ [k]: !globalState[k] })
  return [state, toggle]
}
