#!/usr/bin/env python3
"""
Git repository parser for GitSwell.
Scans a directory for git repositories and extracts commit data into SQLite.
Detects and auto-ignores duplicate/backup repos.
"""

import os
import sys
import subprocess
import sqlite3
import hashlib

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


def check_github_remote(repo_path):
    """Check if this repo has a remote pointing to github.com."""
    try:
        result = subprocess.run(
            ['git', 'remote', '-v'],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0:
            return 'github.com' in result.stdout
    except Exception:
        pass
    return False


def get_remote_url(repo_path):
    """Get the URL of the origin remote (or first available remote)."""
    try:
        result = subprocess.run(
            ['git', 'remote', 'get-url', 'origin'],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
        # Fall back to first available remote
        result = subprocess.run(
            ['git', 'remote'],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0:
            remotes = result.stdout.strip().split('\n')
            if remotes and remotes[0]:
                result = subprocess.run(
                    ['git', 'remote', 'get-url', remotes[0]],
                    cwd=repo_path,
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if result.returncode == 0 and result.stdout.strip():
                    return result.stdout.strip()
    except Exception:
        pass
    return None


def get_commit_hashes(repo_path):
    """Get just the commit hashes from a repo (fast operation for duplicate detection)."""
    try:
        result = subprocess.run(
            ['git', 'log', '--all', '--format=%H'],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=60
        )
        if result.returncode == 0:
            return set(line.strip() for line in result.stdout.split('\n') if line.strip())
    except Exception:
        pass
    return set()


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


def detect_duplicates(repo_hashes):
    """
    Detect duplicate repos where one repo's commits are a subset of another.
    Returns a dict mapping duplicate repo names to their parent repo names.
    """
    duplicates = {}
    repo_names = list(repo_hashes.keys())

    for i, repo_a in enumerate(repo_names):
        hashes_a = repo_hashes[repo_a]
        if not hashes_a:
            continue

        for repo_b in repo_names[i+1:]:
            hashes_b = repo_hashes[repo_b]
            if not hashes_b:
                continue

            # Check if B is a subset of A (B is a backup/older version of A)
            if hashes_b < hashes_a:  # strict subset
                duplicates[repo_b] = repo_a
            # Check if A is a subset of B (A is a backup/older version of B)
            elif hashes_a < hashes_b:  # strict subset
                duplicates[repo_a] = repo_b

    return duplicates


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

    # Ensure schema exists (with duplicate_of column)
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
            ignored INTEGER DEFAULT 0,
            duplicate_of TEXT DEFAULT NULL,
            has_github_remote INTEGER DEFAULT 0,
            remote_url TEXT DEFAULT NULL
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

    # Add duplicate_of column if it doesn't exist (for existing databases)
    try:
        cursor.execute('ALTER TABLE repos ADD COLUMN duplicate_of TEXT DEFAULT NULL')
        conn.commit()
    except sqlite3.OperationalError:
        pass  # Column already exists

    # Add has_github_remote column if it doesn't exist (for existing databases)
    try:
        cursor.execute('ALTER TABLE repos ADD COLUMN has_github_remote INTEGER DEFAULT 0')
        conn.commit()
    except sqlite3.OperationalError:
        pass  # Column already exists

    # Add remote_url column if it doesn't exist (for existing databases)
    try:
        cursor.execute('ALTER TABLE repos ADD COLUMN remote_url TEXT DEFAULT NULL')
        conn.commit()
    except sqlite3.OperationalError:
        pass  # Column already exists

    # Get existing repos to preserve colors and manually-set ignored status
    existing_repos = {}
    cursor.execute('SELECT name, color, ignored, duplicate_of, has_github_remote FROM repos')
    for row in cursor.fetchall():
        existing_repos[row[0]] = {
            'color': row[1],
            'ignored': row[2],
            'duplicate_of': row[3],
            'has_github_remote': row[4]
        }

    # First pass: collect commit hashes for duplicate detection
    print("Collecting commit hashes for duplicate detection...")
    sys.stdout.flush()
    repo_hashes = {}
    repo_paths = {}

    for i, repo_path in enumerate(repos):
        repo_name = get_repo_name(repo_path, projects_path)
        repo_paths[repo_name] = repo_path
        repo_hashes[repo_name] = get_commit_hashes(repo_path)
        if (i + 1) % 20 == 0:
            print(f"  Scanned {i+1}/{len(repos)} repos for hashes...")
            sys.stdout.flush()

    # Detect duplicates
    print("Detecting duplicate repositories...")
    sys.stdout.flush()
    duplicates = detect_duplicates(repo_hashes)

    if duplicates:
        print(f"Found {len(duplicates)} duplicate repositories:")
        for dup, parent in duplicates.items():
            print(f"  {dup} -> duplicate of {parent}")
        sys.stdout.flush()

    # Second pass: process repos and insert commits
    total_commits = 0

    for i, repo_path in enumerate(repos):
        repo_name = get_repo_name(repo_path, projects_path)
        print(f"Processing [{i+1}/{len(repos)}]: {repo_name}...")
        sys.stdout.flush()

        # Check for GitHub remote and get remote URL
        github_remote = 1 if check_github_remote(repo_path) else 0
        remote_url = get_remote_url(repo_path)

        # Determine color - preserve existing or generate new
        if repo_name in existing_repos and existing_repos[repo_name]['color']:
            color = existing_repos[repo_name]['color']
        else:
            color = generate_color_from_name(repo_name)

        # Determine ignored status
        # - If it's a detected duplicate and wasn't manually un-ignored, auto-ignore it
        # - If user manually set ignored status, preserve it (unless it's a new duplicate)
        is_duplicate = repo_name in duplicates
        duplicate_of = duplicates.get(repo_name)

        if repo_name in existing_repos:
            existing = existing_repos[repo_name]
            # If it was already marked as a duplicate, keep ignored
            # If user manually ignored/un-ignored (duplicate_of is NULL but ignored is set), respect that
            if existing['duplicate_of']:
                ignored = 1  # Keep ignored if previously detected as duplicate
            elif is_duplicate:
                ignored = 1  # Newly detected as duplicate
            else:
                ignored = existing['ignored']  # Preserve user preference
        else:
            ignored = 1 if is_duplicate else 0

        # Insert or update repo
        cursor.execute('''
            INSERT INTO repos (name, path, color, ignored, duplicate_of, has_github_remote, remote_url)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
                path = excluded.path,
                duplicate_of = excluded.duplicate_of,
                has_github_remote = excluded.has_github_remote,
                remote_url = excluded.remote_url,
                ignored = CASE
                    WHEN excluded.duplicate_of IS NOT NULL THEN 1
                    ELSE repos.ignored
                END
        ''', (repo_name, repo_path, color, ignored, duplicate_of, github_remote, remote_url))

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
        github_label = " [GitHub]" if github_remote else " [local only]"
        status = " [DUPLICATE - auto-ignored]" if is_duplicate else ""
        print(f"  Added {commit_count} new commits (total in repo: {len(commits)}){github_label}{status}")
        sys.stdout.flush()

        # Commit periodically to avoid large transactions
        if (i + 1) % 10 == 0:
            conn.commit()

    conn.commit()
    conn.close()

    print(f"Parsing complete! Added {total_commits} new commits from {len(repos)} repositories.")
    if duplicates:
        print(f"Auto-ignored {len(duplicates)} duplicate repositories.")
    sys.stdout.flush()


if __name__ == '__main__':
    main()
