import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import * as Sentry from '@sentry/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { getEngine, DEFAULT_ENGINE_ID } from '@/engines/index'
import type { CalculatorEngine } from '@/engines/types'

interface EngineContextType {
  activeEngine: CalculatorEngine
  defaultEngineId: string
  showEngineSelector: boolean
  authorizedEngines: CalculatorEngine[]
  setJobEngine(id: string | null): void
  setDefaultEngine(id: string): Promise<void>
}

const EngineContext = createContext<EngineContextType | undefined>(undefined)

export function EngineProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [defaultEngineId, setDefaultEngineId] = useState(DEFAULT_ENGINE_ID)
  const [jobEngineOverride, setJobEngineOverride] = useState<string | null>(null)
  const [showEngineSelector, setShowEngineSelector] = useState(false)
  const [authorizedEngineIds, setAuthorizedEngineIds] = useState<string[]>([DEFAULT_ENGINE_ID])

  useEffect(() => {
    if (!user) {
      setDefaultEngineId(DEFAULT_ENGINE_ID)
      setShowEngineSelector(false)
      setAuthorizedEngineIds([DEFAULT_ENGINE_ID])
      setJobEngineOverride(null)
      return
    }
    supabase
      .from('profiles')
      .select('default_engine, multi_engine_enabled, authorized_engines')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          Sentry.captureException(new Error(error.message), {
            extra: { context: 'EngineContext profile fetch' },
          })
          return
        }
        if (data) {
          setDefaultEngineId(data.default_engine ?? DEFAULT_ENGINE_ID)
          setShowEngineSelector(data.multi_engine_enabled ?? false)
          setAuthorizedEngineIds(data.authorized_engines ?? [DEFAULT_ENGINE_ID])
        }
      })
  }, [user])

  const setJobEngine = useCallback((id: string | null) => {
    setJobEngineOverride(id)
  }, [])

  const setDefaultEngine = useCallback(async (id: string) => {
    if (!user) return
    setDefaultEngineId(id)
    const { error } = await supabase
      .from('profiles')
      .update({ default_engine: id })
      .eq('id', user.id)
    if (error) {
      Sentry.captureException(new Error(error.message), {
        extra: { context: 'EngineContext setDefaultEngine' },
      })
    }
  }, [user])

  const resolvedId = jobEngineOverride ?? defaultEngineId

  let activeEngine: CalculatorEngine
  try {
    activeEngine = getEngine(resolvedId)
  } catch {
    activeEngine = getEngine(DEFAULT_ENGINE_ID)
  }

  const authorizedEngines = authorizedEngineIds
    .map(id => { try { return getEngine(id) } catch { return null } })
    .filter((e): e is CalculatorEngine => e !== null)

  return (
    <EngineContext.Provider value={{
      activeEngine,
      defaultEngineId,
      showEngineSelector,
      authorizedEngines,
      setJobEngine,
      setDefaultEngine,
    }}>
      {children}
    </EngineContext.Provider>
  )
}

export function useEngineContext() {
  const ctx = useContext(EngineContext)
  if (!ctx) throw new Error('useEngineContext must be used within EngineProvider')
  return ctx
}
