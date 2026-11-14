const BASE_URL = 'http://localhost:3000';

async function checkRoute(path, name) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Accept': 'text/html,application/json' },
    });
    console.log(`[${res.status === 200 ? '✓' : 'x'}] ${name} (${path}): HTTP ${res.status}`);
    return res.status === 200;
  } catch (err) {
    console.log(`[x] ${name} (${path}): Error ${err.message}`);
    return false;
  }
}

async function runRouteAudit() {
  console.log('=== SECTION 6: UI & ROUTE AUDIT ===');
  console.log('Testing routes against:', BASE_URL);

  const routes = [
    { path: '/leads', name: 'Unified CRM Leads Dashboard' },
    { path: '/business-pages', name: 'Business Page & Offering Editor' },
    { path: '/calls', name: 'AI Call Sessions & Telephony Management' },
    { path: '/settings', name: 'Workspace & Integration Settings' },
    { path: '/api/products?includeInactive=true', name: 'Products API (Catalog List)' },
    { path: '/api/leads', name: 'Leads API (CRM Feed)' },
  ];

  for (const r of routes) {
    await checkRoute(r.path, r.name);
  }

  // Check /p/[slug]
  // First find or test a public slug
  console.log('\n--- Checking Public Business Landing Page (/p/[slug]) ---');
  await checkRoute('/p/aadhira-solar', 'Public Landing Page (aadhira-solar)');

  // Verify Product Catalog CRUD API
  console.log('\n--- Checking Products Catalog REST API ---');
  const prodsRes = await fetch(`${BASE_URL}/api/products?includeInactive=true`);
  if (prodsRes.ok) {
    const pData = await prodsRes.json();
    console.log(`[✓] GET /api/products: success=${pData.success}, count=${pData.products?.length ?? 0}`);
  } else {
    console.log(`[x] GET /api/products failed: HTTP ${prodsRes.status}`);
  }
}

runRouteAudit().catch(err => {
  console.error('Route audit error:', err);
  process.exit(1);
});

