export async function verifyLineIdToken(token: string): Promise<string | null> {
  const channelId = process.env.LIFF_CHANNEL_ID
  if (!channelId) throw new Error('LIFF_CHANNEL_ID not set')

  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: token, client_id: channelId }),
  })

  const data = await res.json()
  if (!res.ok) {
    console.error('LINE token verify failed:', res.status, JSON.stringify(data))
    return null
  }
  return data.sub as string
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null
  return authHeader.slice(7)
}

export function verifyCronSecret(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return authHeader === `Bearer ${secret}`
}
