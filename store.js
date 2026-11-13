// Lớp lưu trữ dữ liệu cho bảng books.
// - Có DATABASE_URL  -> dùng PostgreSQL (khi chạy trên Render).
// - Không có         -> dùng bộ nhớ (để chạy thử trên máy / chạy test).

const STATUSES = ['muon-doc', 'dang-doc', 'da-doc'];

function createMemoryStore() {
  let nextId = 1;
  const rows = new Map();
  return {
    async init() {},
    async list(q) {
      let all = [...rows.values()];
      if (q) {
        const s = q.toLowerCase();
        all = all.filter(
          (b) => b.title.toLowerCase().includes(s) || b.author.toLowerCase().includes(s)
        );
      }
      return all.sort((a, b) => b.id - a.id);
    },
    async get(id) {
      return rows.get(id) || null;
    },
    async create({ title, author, status }) {
      const book = { id: nextId++, title, author, status, created_at: new Date().toISOString() };
      rows.set(book.id, book);
      return book;
    },
    async update(id, { title, author, status }) {
      const cur = rows.get(id);
      if (!cur) return null;
      const next = { ...cur, title, author, status };
      rows.set(id, next);
      return next;
    },
    async remove(id) {
      return rows.delete(id);
    },
  };
}

function createPgStore(connectionString) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString,
    // Render Postgres yêu cầu SSL khi kết nối từ ngoài; trong cùng vùng thì không bắt buộc.
    ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
  });
  return {
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS books (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          author TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'muon-doc',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);
    },
    async list(q) {
      if (q) {
        const r = await pool.query(
          'SELECT * FROM books WHERE title ILIKE $1 OR author ILIKE $1 ORDER BY id DESC',
          [`%${q}%`]
        );
        return r.rows;
      }
      return (await pool.query('SELECT * FROM books ORDER BY id DESC')).rows;
    },
    async get(id) {
      return (await pool.query('SELECT * FROM books WHERE id=$1', [id])).rows[0] || null;
    },
    async create({ title, author, status }) {
      const r = await pool.query(
        'INSERT INTO books (title, author, status) VALUES ($1,$2,$3) RETURNING *',
        [title, author, status]
      );
      return r.rows[0];
    },
    async update(id, { title, author, status }) {
      const r = await pool.query(
        'UPDATE books SET title=$2, author=$3, status=$4 WHERE id=$1 RETURNING *',
        [id, title, author, status]
      );
      return r.rows[0] || null;
    },
    async remove(id) {
      const r = await pool.query('DELETE FROM books WHERE id=$1', [id]);
      return r.rowCount > 0;
    },
  };
}

function createStore() {
  return process.env.DATABASE_URL ? createPgStore(process.env.DATABASE_URL) : createMemoryStore();
}

module.exports = { createStore, createMemoryStore, STATUSES };
