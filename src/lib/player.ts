import { supabaseAdmin } from '@/lib/supabase'

export async function getOrCreatePlayer(lineUserId: string, displayName?: string) {
  const { data: existing } = await supabaseAdmin
    .from('players')
    .select('*')
    .eq('line_user_id', lineUserId)
    .single()

  // Use provided display name, or keep existing real name
  const name = displayName ?? existing?.name

  if (existing) {
    // Update name if we now have a better one (replacing a placeholder)
    if (displayName && existing.name !== displayName) {
      await supabaseAdmin.from('players').update({ name: displayName }).eq('id', existing.id)
      return { ...existing, name: displayName }
    }
    return existing
  }

  // New player — use provided name or fall back to placeholder
  const { data: created } = await supabaseAdmin
    .from('players')
    .insert({ line_user_id: lineUserId, name: name ?? `User-${lineUserId.slice(-4)}` })
    .select()
    .single()
  return created!
}
