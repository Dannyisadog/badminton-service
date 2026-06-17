import { supabaseAdmin } from '@/lib/supabase'

export async function getGroupIds(): Promise<string[]> {
  const { data } = await supabaseAdmin.from('groups').select('line_group_id')
  return (data ?? []).map((g: { line_group_id: string }) => g.line_group_id)
}
