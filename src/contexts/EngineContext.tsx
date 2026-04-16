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
import { useImpersonation } from '@/contexts/ImpersonationContext'
import { getEngine, getEngineForCountry, DEFAULT_ENGINE_ID } from '@/engines/index'
import { detectSignupCountry } from '@/lib/detectSignupCountry'
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
  const { isImpersonating, impersonatedData } = useImpersonation()
  const [defaultEngineId, setDefaultEngineId] = useState(DEFAULT_ENGINE_ID)
  const [jobEngineOverride, setJobEngineOverride] = useState<string | null>(null)
  const [showEngineSelector, setShowEngineSelector] = useState(false)
  const [authorizedEngineIds, setAuthorizedEngineIds] = useState<string[]>([DEFAULT_ENGINE_ID])

  useEffect(() => {
    if (isImpersonating && impersonatedData?.profile) {
      setDefaultEngineId(impersonatedData.profile.default_engine ?? 'apa-uk')
      setShowEngineSelector(impersonatedData.profile.multi_engine_enabled)
      setAuthorizedEngineIds(impersonatedData.profile.authorized_engines ?? ['apa-uk'])
      setJobEngineOverride(null)
      return
    }
    if (!user) {
      setDefaultEngineId(DEFAULT_ENGINE_ID)
      setShowEngineSelector(false)
      setAuthorizedEngineIds([DEFAULT_ENGINE_ID])
      setJobEngineOverride(null)
      return
    }
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('default_engine, multi_engine_enabled, authorized_engines, signup_country')
          .eq('id', user.id)
          .maybeSingle()

        if (error) {
          Sentry.captureException(new Error(error.message), {
            extra: { context: 'EngineContext profile fetch' },
          })
          return
        }

        // Safety net: if signup_country was never set (old user or failed detection),
        // detect now and patch the profile so engine is correct from first load.
        if (data && !data.signup_country) {
          try {
            const country = await detectSignupCountry()
            const engineId = getEngineForCountry(country)
            const patch = {
              signup_country: country,
              default_engine: engineId,
              multi_engine_enabled: country !== 'GB',
              authorized_engines: country !== 'GB'
                ? ['apa-uk', engineId]
                : ['apa-uk'],
            }
            await supabase.from('profiles').update(patch).eq('id', user.id)
            setDefaultEngineId(patch.default_engine)
            setShowEngineSelector(patch.multi_engine_enabled)
            setAuthorizedEngineIds(patch.authorized_engines)
            return
          } catch {
            // Detection failed — fall through to use existing profile data
          }
        }

        if (data) {
          setDefaultEngineId(data.default_engine ?? DEFAULT_ENGINE_ID)
          setShowEngineSelector(data.multi_engine_enabled ?? false)
          setAuthorizedEngineIds(data.authorized_engines ?? [DEFAULT_ENGINE_ID])
        }
      } catch (err) {
        Sentry.captureException(err, {
          extra: { context: 'EngineContext profile fetch network error' },
        })
      }
    })()
  }, [user, isImpersonating, impersonatedData?.profile])

  const setJobEngine = useCallback((id: string | null) => {
    setJobEngineOverride(id)
  }, [])

  const setDefaultEngine = useCallback(async (id: string) => {
    if (isImpersonating) return
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
  }, [user, isImpersonating])

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
