import { NextResponse } from 'next/server';
import { getActiveSessions, kickActiveSession, removeHotspotCookiesForUsers } from '@/lib/mikrotik';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';

export async function POST(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();
  try {
    const { session_id, username, router_id } = await request.json();

    if (!session_id) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    const targetRouterId = router_id || undefined;
    let userToClear = username || '';
    if (!userToClear) {
      try {
        const sessions = await getActiveSessions(targetRouterId);
        const match = (sessions || []).find(s => s['.id'] === session_id);
        if (match?.user) userToClear = match.user;
      } catch {}
    }

    await kickActiveSession(session_id, targetRouterId);
    if (userToClear) {
      await removeHotspotCookiesForUsers([userToClear], targetRouterId);
    }

    return NextResponse.json({ success: true, message: 'User disconnected' });
  } catch (error) {
    console.error('MikroTik kick-user error:', error.message);
    return NextResponse.json(
      { error: 'Failed to disconnect user', details: error.message },
      { status: 502 }
    );
  }
}
