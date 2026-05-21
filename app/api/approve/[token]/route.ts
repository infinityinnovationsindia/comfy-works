
import { NextRequest, NextResponse } from 'next/server';
import { getLeaveByToken } from '@/lib/approval-tokens';

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const leave = await getLeaveByToken(params.token);
  if (!leave) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 404 });
  return NextResponse.json(leave);
}
