'use client'

import { useEffect, useState } from 'react'

interface LiffProfile {
  userId: string
  displayName: string
  pictureUrl?: string
}

interface UseLiffResult {
  isReady: boolean
  profile: LiffProfile | null
  getIdToken: () => string | null
  error: Error | null
}

export function useLiff(): UseLiffResult {
  const [isReady, setIsReady] = useState(false)
  const [profile, setProfile] = useState<LiffProfile | null>(null)
  const [liffInstance, setLiffInstance] = useState<typeof import('@line/liff').default | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const init = async () => {
      try {
        const liffModule = await import('@line/liff')
        const liff = liffModule.default
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! })

        if (!liff.isLoggedIn()) {
          liff.login()
          return
        }

        const p = await liff.getProfile()
        setProfile(p)
        setLiffInstance(liff)
        setIsReady(true)
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
      }
    }
    init()
  }, [])

  const getIdToken = () => liffInstance?.getIDToken() ?? null

  return { isReady, profile, getIdToken, error }
}
