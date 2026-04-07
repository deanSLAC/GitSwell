import { useState, useMemo } from 'react';
import './ReposView.css';

function ReposView({ repos, updateRepo, onBack }) {
  const [filter, setFilter] = useState('all'); // all, active, local, github, ignored, duplicates
  const [search, setSearch] = useState('');
  const [editingColor, setEditingColor] = useState(null);

  const filteredRepos = useMemo(() => {
    return repos
      .filter(repo => {
        if (filter === 'active') return !repo.ignored;
        if (filter === 'local') return !repo.ignored && !repo.has_github_remote;
        if (filter === 'github') return !repo.ignored && repo.has_github_remote;
        if (filter === 'ignored') return repo.ignored;
        if (filter === 'duplicates') return repo.duplicate_of;
        return true;
      })
      .filter(repo =>
        repo.name.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => b.commit_count - a.commit_count);
  }, [repos, filter, search]);

  const stats = useMemo(() => {
    const total = repos.length;
    const active = repos.filter(r => !r.ignored).length;
    const localOnly = repos.filter(r => !r.ignored && !r.has_github_remote).length;
    const onGithub = repos.filter(r => !r.ignored && r.has_github_remote).length;
    const ignored = repos.filter(r => r.ignored).length;
    const duplicates = repos.filter(r => r.duplicate_of).length;
    return { total, active, localOnly, onGithub, ignored, duplicates };
  }, [repos]);

  const handleColorChange = (repoId, color) => {
    updateRepo(repoId, { color });
    setEditingColor(null);
  };

  return (
    <main className="repos-view">
      <div className="repos-header">
        <div>
          <h2>Repositories</h2>
          <p className="repos-subtitle">
            Manage which repositories are included in the contribution heatmap
          </p>
        </div>
        <button className="btn" onClick={onBack}>
          Back to Heatmap
        </button>
      </div>

      <div className="repos-toolbar">
        <div className="repos-filters">
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({stats.total})
          </button>
          <button
            className={`filter-btn ${filter === 'active' ? 'active' : ''}`}
            onClick={() => setFilter('active')}
          >
            Active ({stats.active})
          </button>
          <button
            className={`filter-btn ${filter === 'local' ? 'active' : ''}`}
            onClick={() => setFilter('local')}
          >
            Local Only ({stats.localOnly})
          </button>
          <button
            className={`filter-btn ${filter === 'github' ? 'active' : ''}`}
            onClick={() => setFilter('github')}
          >
            On GitHub ({stats.onGithub})
          </button>
          <button
            className={`filter-btn ${filter === 'ignored' ? 'active' : ''}`}
            onClick={() => setFilter('ignored')}
          >
            Ignored ({stats.ignored})
          </button>
          {stats.duplicates > 0 && (
            <button
              className={`filter-btn ${filter === 'duplicates' ? 'active' : ''}`}
              onClick={() => setFilter('duplicates')}
            >
              Duplicates ({stats.duplicates})
            </button>
          )}
        </div>

        <input
          type="text"
          className="input search-input"
          placeholder="Search repositories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="repos-list">
        {filteredRepos.length === 0 ? (
          <div className="repos-empty">
            No repositories found
          </div>
        ) : (
          filteredRepos.map(repo => (
            <div
              key={repo.id}
              className={`repo-card ${repo.ignored ? 'ignored' : ''} ${repo.duplicate_of ? 'duplicate' : ''}`}
            >
              <div
                className="repo-color-indicator"
                style={{ backgroundColor: repo.color || '#39d353' }}
                onClick={() => setEditingColor(editingColor === repo.id ? null : repo.id)}
                title="Click to change color"
              />

              <div className="repo-info">
                <div className="repo-name-row">
                  <span className="repo-name">{repo.name}</span>
                  {repo.duplicate_of && (
                    <span className="duplicate-badge" title={`Duplicate of ${repo.duplicate_of}`}>
                      duplicate
                    </span>
                  )}
                  {!repo.duplicate_of && !repo.has_github_remote && (
                    <span className="local-badge" title="No GitHub remote — not on your GitHub profile">
                      local only
                    </span>
                  )}
                  {!repo.duplicate_of && repo.has_github_remote === 1 && (
                    <span className="github-badge" title="Has a GitHub remote">
                      GitHub
                    </span>
                  )}
                </div>
                {repo.duplicate_of ? (
                  <span className="repo-duplicate-of">
                    Backup/older version of: <strong>{repo.duplicate_of}</strong>
                  </span>
                ) : (
                  <div className="repo-locations">
                    <span className="repo-path" title={repo.path}>{repo.path}</span>
                    {repo.remote_url && (
                      <span className="repo-remote">
                        {repo.remote_url.includes('github.com') ? (
                          <a
                            href={repo.remote_url
                              .replace(/^git@github\.com:/, 'https://github.com/')
                              .replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/')
                              .replace(/\.git$/, '')}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="repo-remote-link"
                          >
                            {repo.remote_url
                              .replace(/^git@github\.com:/, 'https://github.com/')
                              .replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/')
                              .replace(/\.git$/, '')}
                          </a>
                        ) : (
                          repo.remote_url
                        )}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="repo-stats">
                <span className="repo-commit-count">
                  {repo.commit_count} commits
                </span>
              </div>

              <div className="repo-actions">
                {repo.ignored ? (
                  <button
                    className="btn btn-sm"
                    onClick={() => updateRepo(repo.id, { ignored: false })}
                  >
                    Include
                  </button>
                ) : (
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => updateRepo(repo.id, { ignored: true })}
                  >
                    Ignore
                  </button>
                )}
              </div>

              {editingColor === repo.id && (
                <div className="color-picker-popup">
                  <div className="color-picker-grid">
                    {[
                      '#58a6ff', '#f778ba', '#a371f7', '#ff7b72',
                      '#ffa657', '#7ee787', '#79c0ff', '#d2a8ff',
                      '#ffc107', '#00bcd4', '#8bc34a', '#e91e63',
                      '#9c27b0', '#3f51b5', '#009688', '#cddc39'
                    ].map(color => (
                      <button
                        key={color}
                        className="color-option"
                        style={{ backgroundColor: color }}
                        onClick={() => handleColorChange(repo.id, color)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </main>
  );
}

export default ReposView;
