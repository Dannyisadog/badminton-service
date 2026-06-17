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
  idToken: string | null
  error: Error | null
}

export function useLiff(): UseLiffResult {
  const [isReady, setIsReady] = useState(false)
  const [profile, setProfile] = useState<LiffProfile | null>(null)
  const [idToken, setIdToken] = useState<string | null>(null)
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

        const [p, token] = await Promise.all([
          liff.getProfile(),
          Promise.resolve(liff.getIDToken()),
        ])

        setProfile(p)
        setIdToken(token)
        setIsReady(true)
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
      }
    }
    init()
  }, [])

  return { isReady, profile, idToken, error }
}
