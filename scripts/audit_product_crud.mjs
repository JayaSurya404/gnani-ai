const BASE_URL = 'http://localhost:3000';

async function testProductCrud() {
  console.log('=== PRODUCT CATALOG CRUD VERIFICATION ===');

  // 1. CREATE (POST)
  const createPayload = {
    name: 'CRUD Test Solar Panel Kit',
    sku: 'TEST-SKU-' + Date.now(),
    category: 'Commercial',
    price_amount: 450000,
    price_display: '₹4,50,000 Turnkey',
    currency: 'INR',
    description: 'High efficiency bifacial test solar kit',
    is_active: true,
  };

  const createRes = await fetch(`${BASE_URL}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createPayload),
  });

  const createData = await createRes.json();
  console.log(`POST /api/products status: ${createRes.status}`, createData);
  if (!createRes.ok || !createData.success) {
    throw new Error('Product creation failed: ' + JSON.stringify(createData));
  }
  const productId = createData.product.id;
  console.log(`[✓] Created Product ID: ${productId}`);

  // 2. READ (GET)
  const getRes = await fetch(`${BASE_URL}/api/products?includeInactive=true`);
  const getData = await getRes.json();
  console.log(`GET /api/products status: ${getRes.status}, count: ${getData.products?.length}`);
  const found = getData.products?.find(p => p.id === productId);
  if (!found) throw new Error('Created product not found in GET /api/products');
  console.log(`[✓] Found in list: name="${found.name}", price="${found.price_display}"`);

  // 3. UPDATE (PATCH)
  const updatePayload = {
    id: productId,
    price_amount: 475000,
    price_display: '₹4,75,000 Updated Turnkey',
    is_active: false,
  };

  const updateRes = await fetch(`${BASE_URL}/api/products`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatePayload),
  });
  const updateData = await updateRes.json();
  console.log(`PATCH /api/products status: ${updateRes.status}`, updateData);
  if (!updateRes.ok || !updateData.success) throw new Error('Product update failed');
  console.log(`[✓] Updated product: is_active=${updateData.product?.is_active}, price_display="${updateData.product?.price_display}"`);

  // 4. DELETE / ARCHIVE (DELETE)
  const deleteRes = await fetch(`${BASE_URL}/api/products?id=${productId}`, {
    method: 'DELETE',
  });
  const deleteData = await deleteRes.json();
  console.log(`DELETE /api/products status: ${deleteRes.status}`, deleteData);
  if (!deleteRes.ok || !deleteData.success) throw new Error('Product deletion failed');
  console.log(`[✓] Deleted product: message="${deleteData.message}"`);

  // Verify it is archived or deleted
  const getAfterRes = await fetch(`${BASE_URL}/api/products`);
  const getAfterData = await getAfterRes.json();
  const stillActive = getAfterData.products?.find(p => p.id === productId);
  if (stillActive) throw new Error('Product still visible in active list after delete');
  console.log(`[✓] Verified product is no longer in active catalog`);

  console.log('=== PRODUCT CATALOG CRUD VERIFIED 100% ===');
}

testProductCrud().catch(err => {
  console.error('Product CRUD audit failed:', err);
  process.exit(1);
});

