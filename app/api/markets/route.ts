import { NextResponse } from 'next/server'

const DELPHI_API = 'https://api.delphi.fyi'
const DELPHI_KEY = process.env.DELPHI_API_ACCESS_KEY!

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [r1, r2] = await Promise.all([
      fetch(`${DELPHI_API}/markets?limit=100&status=open`, {
        headers: { 'x-api-key': DELPHI_KEY },
      }),
      fetch(`${DELPHI_API}/markets?limit=50&status=settled`, {
        headers: { 'x-api-key': DELPHI_KEY },
      }),
    ])
    const [d1, d2] = await Promise.all([r1.json(), r2.json()])
    const markets = [...(d1.markets || []), ...(d2.markets || [])]
    return NextResponse.json({ markets })
  } catch (e) {
    return NextResponse.json({ markets: [], error: String(e) })
  }
}