import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import Database from 'better-sqlite3';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'commits.db');
const db = new Database(DB_PATH);

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS repos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    path TEXT NOT NULL,
    color TEXT DEFAULT NULL,
    ignored INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS commits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    repo_id INTEGER NOT NULL,
    message TEXT,
    FOREIGN KEY (repo_id) REFERENCES repos(id),
    UNIQUE(hash, repo_id)
  );

  CREATE TABLE IF NOT EXISTS file_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commit_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    added INTEGER DEFAULT 0,
    deleted INTEGER DEFAULT 0,
    FOREIGN KEY (commit_id) REFERENCES commits(id)
  );

  CREATE INDEX IF NOT EXISTS idx_commits_timestamp ON commits(timestamp);
  CREATE INDEX IF NOT EXISTS idx_commits_repo ON commits(repo_id);
  CREATE INDEX IF NOT EXISTS idx_file_changes_commit ON file_changes(commit_id);
`);

app.use(express.json());

// Serve static files
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}
app.use(express.static(path.join(__dirname, 'public')));

// API: Get configuration
app.get('/api/config', (req, res) => {
  const config = {};
  const rows = db.prepare('SELECT key, value FROM config').all();
  rows.forEach(row => {
    config[row.key] = row.value;
  });
  res.json(config);
});

// API: Set configuration
app.post('/api/config', (req, res) => {
  const { key, value } = req.body;
  if (!key) {
    return res.status(400).json({ error: 'Key is required' });
  }

  const stmt = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');
  stmt.run(key, value);
  res.json({ success: true });
});

// API: Get all repos
app.get('/api/repos', (req, res) => {
  const repos = db.prepare(`
    SELECT r.*, COUNT(c.id) as commit_count
    FROM repos r
    LEFT JOIN commits c ON r.id = c.repo_id
    GROUP BY r.id
    ORDER BY r.name
  `).all();
  res.json(repos);
});

// API: Update repo (ignore/unignore, set color)
app.patch('/api/repos/:id', (req, res) => {
  const { id } = req.params;
  const { ignored, color } = req.body;

  const updates = [];
  const values = [];

  if (ignored !== undefined) {
    updates.push('ignored = ?');
    values.push(ignored ? 1 : 0);
  }
  if (color !== undefined) {
    updates.push('color = ?');
    values.push(color);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No updates provided' });
  }

  values.push(id);
  const stmt = db.prepare(`UPDATE repos SET ${updates.join(', ')} WHERE id = ?`);
  stmt.run(...values);
  res.json({ success: true });
});

// API: Get commits with optional filtering
app.get('/api/commits', (req, res) => {
  const { year, includeIgnored, repoId } = req.query;

  let whereClause = '1=1';
  const params = [];

  if (year) {
    const startOfYear = new Date(`${year}-01-01T00:00:00Z`).getTime() / 1000;
    const endOfYear = new Date(`${parseInt(year) + 1}-01-01T00:00:00Z`).getTime() / 1000;
    whereClause += ' AND c.timestamp >= ? AND c.timestamp < ?';
    params.push(startOfYear, endOfYear);
  }

  if (includeIgnored !== 'true') {
    whereClause += ' AND r.ignored = 0';
  }

  if (repoId) {
    whereClause += ' AND r.id = ?';
    params.push(repoId);
  }

  const commits = db.prepare(`
    SELECT c.id, c.hash, c.timestamp, c.message, r.name as repo, r.id as repo_id, r.color as repo_color
    FROM commits c
    JOIN repos r ON c.repo_id = r.id
    WHERE ${whereClause}
    ORDER BY c.timestamp DESC
  `).all(...params);

  // Get file changes for each commit
  const fileChangesStmt = db.prepare(`
    SELECT file_path as file, added, deleted FROM file_changes WHERE commit_id = ?
  `);

  const result = commits.map(commit => ({
    ...commit,
    files: fileChangesStmt.all(commit.id)
  }));

  res.json(result);
});

// API: Get available years
app.get('/api/years', (req, res) => {
  const { includeIgnored } = req.query;

  let query = `
    SELECT DISTINCT strftime('%Y', datetime(c.timestamp, 'unixepoch')) as year
    FROM commits c
    JOIN repos r ON c.repo_id = r.id
  `;

  if (includeIgnored !== 'true') {
    query += ' WHERE r.ignored = 0';
  }

  query += ' ORDER BY year DESC';

  const years = db.prepare(query).all().map(r => parseInt(r.year));
  res.json(years);
});

// API: Get top repos for a year
app.get('/api/top-repos/:year', (req, res) => {
  const { year } = req.params;
  const { limit = 3, includeIgnored } = req.query;

  const startOfYear = new Date(`${year}-01-01T00:00:00Z`).getTime() / 1000;
  const endOfYear = new Date(`${parseInt(year) + 1}-01-01T00:00:00Z`).getTime() / 1000;

  let query = `
    SELECT r.id, r.name, r.color, COUNT(c.id) as commit_count
    FROM repos r
    JOIN commits c ON r.id = c.repo_id
    WHERE c.timestamp >= ? AND c.timestamp < ?
  `;

  if (includeIgnored !== 'true') {
    query += ' AND r.ignored = 0';
  }

  query += ' GROUP BY r.id ORDER BY commit_count DESC LIMIT ?';

  const repos = db.prepare(query).all(startOfYear, endOfYear, parseInt(limit));
  res.json(repos);
});

// API: Run parser
app.post('/api/parse', (req, res) => {
  const { projectsPath } = req.body;

  if (!projectsPath) {
    return res.status(400).json({ error: 'Projects path is required' });
  }

  // Save the path to config
  const stmt = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');
  stmt.run('projects_path', projectsPath);

  const scriptPath = path.join(__dirname, 'scripts', 'parser.py');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const parser = spawn('python3', [scriptPath, projectsPath, DB_PATH]);

  parser.stdout.on('data', (data) => {
    res.write(`data: ${data.toString().trim()}\n\n`);
  });

  parser.stderr.on('data', (data) => {
    res.write(`data: ERROR: ${data.toString().trim()}\n\n`);
  });

  parser.on('close', (code) => {
    if (code === 0) {
      res.write('data: DONE\n\n');
    } else {
      res.write(`data: FAILED with code ${code}\n\n`);
    }
    res.end();
  });

  parser.on('error', (err) => {
    res.write(`data: ERROR: ${err.message}\n\n`);
    res.end();
  });
});

// API: Get stats
app.get('/api/stats', (req, res) => {
  const { year, includeIgnored, excludeRepos } = req.query;
  const excludeList = excludeRepos ? excludeRepos.split(',').map(Number) : [];

  let whereClause = '1=1';
  const params = [];

  if (year) {
    const startOfYear = new Date(`${year}-01-01T00:00:00Z`).getTime() / 1000;
    const endOfYear = new Date(`${parseInt(year) + 1}-01-01T00:00:00Z`).getTime() / 1000;
    whereClause += ' AND c.timestamp >= ? AND c.timestamp < ?';
    params.push(startOfYear, endOfYear);
  }

  if (includeIgnored !== 'true') {
    whereClause += ' AND r.ignored = 0';
  }

  if (excludeList.length > 0) {
    whereClause += ` AND r.id NOT IN (${excludeList.map(() => '?').join(',')})`;
    params.push(...excludeList);
  }

  const stats = db.prepare(`
    SELECT
      COUNT(DISTINCT c.id) as total_commits,
      COUNT(DISTINCT r.id) as total_repos,
      COUNT(DISTINCT DATE(datetime(c.timestamp, 'unixepoch'))) as active_days
    FROM commits c
    JOIN repos r ON c.repo_id = r.id
    WHERE ${whereClause}
  `).get(...params);

  res.json(stats);
});

// Catch-all for SPA - Express 5 requires named parameter for wildcards
app.get('/{*splat}', (req, res) => {
  const indexPath = fs.existsSync(distPath)
    ? path.join(distPath, 'index.html')
    : path.join(__dirname, 'index.html');
  res.sendFile(indexPath);
});

app.listen(PORT, () => {
  console.log(`Git-Contrib server running at http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
