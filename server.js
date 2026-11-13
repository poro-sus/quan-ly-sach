// Server HTTP thuần Node.js (không cần express) cung cấp:
//   - API REST CRUD cho bảng books:  /api/books
//   - Giao diện web tĩnh trong thư mục public/
//   - Health check: /healthz (Render dùng để biết service còn sống)

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createStore, STATUSES } = require('./store');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

function send(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 100_000) {
        reject(new Error('Dữ liệu quá lớn'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('JSON không hợp lệ'));
      }
    });
    req.on('error', reject);
  });
}

// Kiểm tra dữ liệu đầu vào; trả về { value } hoặc { error }.
function validate(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const author = typeof body.author === 'string' ? body.author.trim() : '';
  const status = body.status === undefined ? 'muon-doc' : body.status;
  if (!title) return { error: 'Tên sách (title) là bắt buộc' };
  if (!author) return { error: 'Tác giả (author) là bắt buộc' };
  if (title.length > 200 || author.length > 200) return { error: 'Tên sách/tác giả tối đa 200 ký tự' };
  if (!STATUSES.includes(status)) return { error: `status phải là một trong: ${STATUSES.join(', ')}` };
  return { value: { title, author, status } };
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  // Chặn truy cập ra ngoài thư mục public (path traversal).
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, { error: 'Cấm truy cập' });
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, { error: 'Không tìm thấy' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

function createServer(store) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const { pathname } = url;

      if (pathname === '/healthz') return send(res, 200, { ok: true });

      const m = pathname.match(/^\/api\/books(?:\/(\d+))?$/);
      if (!m) {
        if (req.method === 'GET') return serveStatic(req, res, pathname);
        return send(res, 404, { error: 'Không tìm thấy' });
      }

      const id = m[1] ? Number(m[1]) : null;

      if (id === null) {
        if (req.method === 'GET') return send(res, 200, await store.list(url.searchParams.get('q') || ''));
        if (req.method === 'POST') {
          const v = validate(await readJson(req));
          if (v.error) return send(res, 400, { error: v.error });
          return send(res, 201, await store.create(v.value));
        }
        return send(res, 405, { error: 'Phương thức không được hỗ trợ' });
      }

      if (req.method === 'GET') {
        const book = await store.get(id);
        return book ? send(res, 200, book) : send(res, 404, { error: 'Không tìm thấy sách' });
      }
      if (req.method === 'PUT') {
        const v = validate(await readJson(req));
        if (v.error) return send(res, 400, { error: v.error });
        const book = await store.update(id, v.value);
        return book ? send(res, 200, book) : send(res, 404, { error: 'Không tìm thấy sách' });
      }
      if (req.method === 'DELETE') {
        return (await store.remove(id))
          ? send(res, 200, { ok: true })
          : send(res, 404, { error: 'Không tìm thấy sách' });
      }
      return send(res, 405, { error: 'Phương thức không được hỗ trợ' });
    } catch (e) {
      if (e.message === 'JSON không hợp lệ' || e.message === 'Dữ liệu quá lớn') {
        return send(res, 400, { error: e.message });
      }
      console.error(e);
      return send(res, 500, { error: 'Lỗi máy chủ' });
    }
  });
}

async function main() {
  const store = createStore();
  await store.init();
  const port = process.env.PORT || 3000;
  createServer(store).listen(port, '0.0.0.0', () => {
    console.log(`Server chạy tại cổng ${port} (${process.env.DATABASE_URL ? 'PostgreSQL' : 'bộ nhớ'})`);
  });
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Không khởi động được:', e);
    process.exit(1);
  });
}

module.exports = { createServer };
