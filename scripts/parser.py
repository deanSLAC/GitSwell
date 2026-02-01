#!/usr/bin/env python3
"""
Git repository parser for git-contrib.
Scans a directory for git repositories and extracts commit data into SQLite.
"""

import os
import sys
import subprocess
import sqlite3
import hashlib
import random

# Predefined set of distinct colors for repos
REPO_COLORS = [
    '#58a6ff',  # blue
    '#f778ba',  # pink
    '#a371f7',  # purple
    '#ff7b72',  # red
    '#ffa657',  # orange
    '#7ee787',  # green
    '#79c0ff',  # light blue
    '#d2a8ff',  # light purple
    '#ffc107',  # yellow
    '#00bcd4',  # cyan
    '#8bc34a',  # lime
    '#e91e63',  # magenta
    '#9c27b0',  # deep purple
    '#3f51b5',  # indigo
    '#009688',  # teal
    '#cddc39',  # lime yellow
]


def generate_color_from_name(name):
    """Generate a consistent color based on repo name."""
    hash_val = int(hashlib.md5(name.encode()).hexdigest(), 16)
    return REPO_COLORS[hash_val % len(REPO_COLORS)]


def find_git_repos(base_path, max_depth=3):
    """Recursively find git repositories up to max_depth levels."""
    repos = []

    def scan_dir(current_path, depth):
        if depth > max_depth:
            return

        try:
            entries = os.listdir(current_path)
        except PermissionError:
            return

        if '.git' in entries:
            git_path = os.path.join(current_path, '.git')
            if os.path.isdir(git_path):
                repos.append(current_path)
                return  # Don't scan subdirectories of a git repo

        for entry in entries:
            if entry.startswith('.'):
                continue
            entry_path = os.path.join(current_path, entry)
            if os.path.isdir(entry_path):
                scan_dir(entry_path, depth + 1)

    scan_dir(base_path, 0)
    return repos


def get_repo_name(repo_path, base_path):
    """Get a relative repo name from its path."""
    rel_path = os.path.relpath(repo_path, base_path)
    return rel_path


def extract_commits(repo_path):
    """Extract all commits from a git repository."""
    commits = []

    try:
        result = subprocess.run(
            ['git', 'log', '--all', '--format=COMMIT_START|%H|%at|%s', '--numstat'],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=120
        )

        if result.returncode != 0:
            return commits

        current_commit = None
        for line in result.stdout.split('\n'):
            line = line.strip()
            if not line:
                continue

            if line.startswith('COMMIT_START|'):
                if current_commit:
                    commits.append(current_commit)

                parts = line.split('|', 3)
                if len(parts) >= 4:
                    current_commit = {
                        'hash': parts[1],
                        'timestamp': int(parts[2]),
                        'message': parts[3],
                        'files': []
                    }
                else:
                    current_commit = None
            elif current_commit:
                # Parse numstat line: added\tdeleted\tfilename
                parts = line.split('\t')
                if len(parts) >= 3:
                    added = parts[0]
                    deleted = parts[1]
                    filename = parts[2]

                    # Handle binary files (shown as -)
                    try:
                        added_num = int(added) if added != '-' else 0
                        deleted_num = int(deleted) if deleted != '-' else 0
                    except ValueError:
                        added_num = 0
                        deleted_num = 0

                    current_commit['files'].append({
                        'file': filename,
                        'added': added_num,
                        'deleted': deleted_num
                    })

        if current_commit:
            commits.append(current_commit)

    except subprocess.TimeoutExpired:
        print(f"Timeout extracting commits from {repo_path}", file=sys.stderr)
    except Exception as e:
        print(f"Error extracting commits from {repo_path}: {e}", file=sys.stderr)

    return commits


def main():
    if len(sys.argv) < 3:
        print("Usage: parser.py <projects_path> <database_path>", file=sys.stderr)
        sys.exit(1)

    projects_path = os.path.expanduser(sys.argv[1])
    db_path = sys.argv[2]

    if not os.path.isdir(projects_path):
        print(f"Error: {projects_path} is not a valid directory", file=sys.stderr)
        sys.exit(1)

    print(f"Scanning {projects_path} for git repositories...")
    sys.stdout.flush()

    repos = find_git_repos(projects_path)
    print(f"Found {len(repos)} git repositories")
    sys.stdout.flush()

    # Connect to database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Ensure schema exists
    cursor.executescript('''
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
    ''')

    # Get existing repos to preserve colors and ignored status
    existing_repos = {}
    cursor.execute('SELECT name, color, ignored FROM repos')
    for row in cursor.fetchall():
        existing_repos[row[0]] = {'color': row[1], 'ignored': row[2]}

    total_commits = 0

    for i, repo_path in enumerate(repos):
        repo_name = get_repo_name(repo_path, projects_path)
        print(f"Processing [{i+1}/{len(repos)}]: {repo_name}...")
        sys.stdout.flush()

        # Determine color - preserve existing or generate new
        if repo_name in existing_repos and existing_repos[repo_name]['color']:
            color = existing_repos[repo_name]['color']
            ignored = existing_repos[repo_name]['ignored']
        else:
            color = generate_color_from_name(repo_name)
            ignored = 0

        # Insert or update repo
        cursor.execute('''
            INSERT INTO repos (name, path, color, ignored)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET path = excluded.path
        ''', (repo_name, repo_path, color, ignored))

        cursor.execute('SELECT id FROM repos WHERE name = ?', (repo_name,))
        repo_id = cursor.fetchone()[0]

        # Extract and insert commits
        commits = extract_commits(repo_path)
        commit_count = 0

        for commit in commits:
            try:
                cursor.execute('''
                    INSERT OR IGNORE INTO commits (hash, timestamp, repo_id, message)
                    VALUES (?, ?, ?, ?)
                ''', (commit['hash'], commit['timestamp'], repo_id, commit['message']))

                if cursor.rowcount > 0:
                    commit_id = cursor.lastrowid
                    commit_count += 1

                    # Insert file changes
                    for file_change in commit['files']:
                        cursor.execute('''
                            INSERT INTO file_changes (commit_id, file_path, added, deleted)
                            VALUES (?, ?, ?, ?)
                        ''', (commit_id, file_change['file'], file_change['added'], file_change['deleted']))

            except Exception as e:
                print(f"Error inserting commit {commit['hash']}: {e}", file=sys.stderr)

        total_commits += commit_count
        print(f"  Added {commit_count} new commits (total in repo: {len(commits)})")
        sys.stdout.flush()

        # Commit periodically to avoid large transactions
        if (i + 1) % 10 == 0:
            conn.commit()

    conn.commit()
    conn.close()

    print(f"Parsing complete! Added {total_commits} new commits from {len(repos)} repositories.")
    sys.stdout.flush()


if __name__ == '__main__':
    main()
