import { NextResponse } from 'next/server';
import { getWalledGardenEntries, addWalledGardenEntry, removeWalledGardenEntry, getMikroTikConfig } from '@/lib/mikrotik';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';
import { logChange } from '@/lib/changeHistory';

/**
 * GET — List all walled garden entries from the MikroTik router
 */
export async function GET(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const { searchParams } = new URL(request.url);
    const routerId = searchParams.get('router_id');
    const entries = await getWalledGardenEntries(routerId || undefined);
    return NextResponse.json({ success: true, entries });
  } catch (error) {
    console.error('Walled garden list error:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch walled garden entries', details: error.message },
      { status: 502 }
    );
  }
}

/**
 * POST — Add a new domain to the walled garden bypass list
 * Body: { dst_host, comment?, category?, router_id? }
 */
export async function POST(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const { dst_host, comment = '', category = 'custom', router_id } = await request.json();

    if (!dst_host || typeof dst_host !== 'string' || !dst_host.trim()) {
      return NextResponse.json({ error: 'dst_host is required' }, { status: 400 });
    }

    const cleanHost = dst_host.trim();
    const lowerHost = cleanHost.toLowerCase();

    // Fetch the configured hotspot domain to block dynamically (not just hardcoded asuktech.net)
    let hotspotDomain = 'asuktech.net';
    try {
      const routerConfig = await getMikroTikConfig();
      if (routerConfig.hotspot_url) {
        hotspotDomain = routerConfig.hotspot_url.toLowerCase();
      }
    } catch {}

    // Prevent adding the router's own hotspot domain, internal IP, or OS captive portal probe domains
    const bannedCaptiveProbes = [
      '*.gstatic.com',
      '*gstatic.com',
      '*gstatic.com*',
      'www.gstatic.com',
      'gstatic.com',
      'connectivitycheck.gstatic.com',
      'connectivitycheck.android.com',
      'clients3.google.com',
      'clients1.google.com',
      'captive.apple.com',
      'msftconnecttest.com',
      '*.msftconnecttest.com',
      'msftncsi.com',
      '*.msftncsi.com',
      'detectportal.firefox.com',
      'nmcheck.gnome.org',
    ];
    if (
      lowerHost.includes('asuktech.net') ||
      lowerHost.includes(hotspotDomain) ||
      lowerHost.includes('10.5.50.') ||
      bannedCaptiveProbes.includes(lowerHost) ||
      lowerHost.includes('connectivitycheck') ||
      lowerHost.includes('captive.apple') ||
      lowerHost.includes('msftconnecttest')
    ) {
      return NextResponse.json({
        error: `Cannot add "${cleanHost}" to Walled Garden. Captive portal probe domains (like *.gstatic.com / www.gstatic.com / captive.apple.com) and the router's own hotspot domain must stay intercepted so phones automatically open the Wi-Fi login popup.`,
      }, { status: 400 });
    }

    const fullComment = category ? `[${category}] ${comment}`.trim() : comment;

    const result = await addWalledGardenEntry({
      dstHost: cleanHost,
      action: 'allow',
      comment: fullComment,
      routerId: router_id || undefined,
    });


    // Log to change history
    await logChange({
      category: 'walled-garden',
      action: 'add',
      summary: `Added "${cleanHost}" to walled garden bypass`,
      beforeState: {},
      afterState: { dst_host: cleanHost, comment: fullComment, category, router_id },
      metadata: { dst_host: cleanHost, comment: fullComment, category, router_id },
    });

    return NextResponse.json({ success: true, entry: result });
  } catch (error) {
    console.error('Walled garden add error:', error.message);
    return NextResponse.json(
      { error: 'Failed to add walled garden entry', details: error.message },
      { status: 502 }
    );
  }
}

/**
 * DELETE — Remove a walled garden entry by MikroTik ID
 * Body: { id, source?, dst_host?, comment?, router_id? }
 */
export async function DELETE(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    const { id, source, dst_host, comment, router_id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Entry ID is required' }, { status: 400 });
    }

    await removeWalledGardenEntry(id, source, router_id || undefined);

    // Log to change history
    const targetLabel = dst_host || id;
    await logChange({
      category: 'walled-garden',
      action: 'remove',
      summary: `Removed "${targetLabel}" from walled garden bypass`,
      beforeState: { id, dst_host, comment, source, router_id },
      afterState: {},
      metadata: { id, dst_host, comment, source, router_id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Walled garden remove error:', error.message);
    return NextResponse.json(
      { error: 'Failed to remove walled garden entry', details: error.message },
      { status: 502 }
    );
  }
}

