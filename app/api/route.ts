import { NextResponse } from 'next/server'

const DELPHI_API = 'https://api.delphi.fyi'
const DELPHI_KEY = process.env.DELPHI_API_ACCESS_KEY!

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const r = await fetch(`${DELPHI_API}/markets?limit=100&status=open`, {
      headers: { 'x-api-key': DELPHI_KEY },
      next: { revalidate: 60 }
    })
    const data = await r.json()
    const markets = data.markets || []

    const r2 = await fetch(`${DELPHI_API}/markets?limit=50&status=settled`, {
      headers: { 'x-api-key': DELPHI_KEY },
      next: { revalidate: 60 }
    })
    const data2 = await r2.json()
    const settled = data2.markets || []

    return NextResponse.json({ markets: [...markets, ...settled] })
  } catch (e) {
    return NextResponse.json({ markets: [], error: String(e) })
  }
}