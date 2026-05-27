import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ marketId: string }> }
) {
  const { marketId } = await params
  const { data } = await supabaseAdmin
    .from('oracle_markets')
    .select('*')
    .eq('market_id', marketId)
    .single()

  return NextResponse.json({ capture: data || null })
}