import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

export async function GET(
  req: Request,
  { params }: { params: { marketId: string } }
) {
  const { data } = await supabaseAdmin
    .from('oracle_markets')
    .select('*')
    .eq('market_id', params.marketId)
    .single()

  return NextResponse.json({ capture: data || null })
}