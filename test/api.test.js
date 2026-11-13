const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server');
const { createMemoryStore } = require('../store');

let server;
let base;

test.before(async () => {
  server = createServer(createMemoryStore());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const json = (method, path, body) =>
  fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test('healthz trả về ok', async () => {
  const r = await fetch(base + '/healthz');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
});

test('trang chủ trả về HTML', async () => {
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Quản lý sách/);
});

test('CRUD đầy đủ một cuốn sách', async () => {
  // Create
  let r = await json('POST', '/api/books', { title: 'Dế Mèn phiêu lưu ký', author: 'Tô Hoài' });
  assert.equal(r.status, 201);
  const created = await r.json();
  assert.equal(created.status, 'muon-doc');
  assert.ok(created.id);

  // Read (one + list)
  r = await fetch(`${base}/api/books/${created.id}`);
  assert.equal((await r.json()).title, 'Dế Mèn phiêu lưu ký');
  r = await fetch(base + '/api/books');
  assert.equal((await r.json()).length, 1);

  // Update
  r = await json('PUT', `/api/books/${created.id}`, {
    title: 'Dế Mèn phiêu lưu ký',
    author: 'Tô Hoài',
    status: 'da-doc',
  });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, 'da-doc');

  // Search
  r = await fetch(base + '/api/books?q=' + encodeURIComponent('tô hoài'));
  assert.equal((await r.json()).length, 1);
  r = await fetch(base + '/api/books?q=khongco');
  assert.equal((await r.json()).length, 0);

  // Delete
  r = await json('DELETE', `/api/books/${created.id}`);
  assert.equal(r.status, 200);
  r = await fetch(`${base}/api/books/${created.id}`);
  assert.equal(r.status, 404);
});

test('từ chối dữ liệu không hợp lệ', async () => {
  let r = await json('POST', '/api/books', { title: '', author: 'A' });
  assert.equal(r.status, 400);
  r = await json('POST', '/api/books', { title: 'T', author: 'A', status: 'khac' });
  assert.equal(r.status, 400);
  r = await fetch(base + '/api/books', { method: 'POST', body: '{hong', headers: { 'Content-Type': 'application/json' } });
  assert.equal(r.status, 400);
});

test('sửa/xóa sách không tồn tại trả về 404', async () => {
  let r = await json('PUT', '/api/books/9999', { title: 'T', author: 'A' });
  assert.equal(r.status, 404);
  r = await json('DELETE', '/api/books/9999');
  assert.equal(r.status, 404);
});

test('chặn truy cập file ngoài thư mục public', async () => {
  const r = await fetch(base + '/..%2Fserver.js');
  assert.notEqual(r.status, 200);
});
