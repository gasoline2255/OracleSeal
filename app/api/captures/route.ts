import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('oracle_markets')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ captures: [] })
  return NextResponse.json({ captures: data || [] })
}