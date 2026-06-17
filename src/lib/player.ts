import { supabaseAdmin } from '@/lib/supabase'

export async function getOrCreatePlayer(lineUserId: string) {
  const { data: existing } = await supabaseAdmin
    .from('players')
    .select('*')
    .eq('line_user_id', lineUserId)
    .single()

  // Skip LINE API call if player already has a real name
  if (existing && !existing.name.startsWith('User-')) {
    return existing
  }

  // Only call LINE bot profile when we actually need the name
  const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
    headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
  })
  const profile = profileRes.ok ? await profileRes.json() : null
  const name = profile?.displayName ?? `User-${lineUserId.slice(-4)}`

  if (existing) {
    await supabaseAdmin.from('players').update({ name }).eq('id', existing.id)
    return { ...existing, name }
  }

  const { data: created } = await supabaseAdmin
    .from('players')
    .insert({ line_user_id: lineUserId, name })
    .select()
    .single()
  return created!
}
