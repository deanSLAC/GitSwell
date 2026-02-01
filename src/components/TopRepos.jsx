import './TopRepos.css';

function TopRepos({
  repos,
  hiddenRepoIds,
  toggleRepoVisibility,
  singleRepoMode,
  setSingleRepoMode
}) {
  if (!repos || repos.length === 0) return null;

  return (
    <div className="top-repos">
      <div className="top-repos-header">
        <span className="top-repos-title">Top Repositories</span>
        <span className="top-repos-hint">Click to hide/show, double-click to focus</span>
      </div>

      <div className="top-repos-list">
        {repos.map((repo, index) => {
          const isHidden = hiddenRepoIds.has(repo.id);
          const isFocused = singleRepoMode === repo.id;

          return (
            <button
              key={repo.id}
              className={`top-repo-chip ${isHidden ? 'hidden' : ''} ${isFocused ? 'focused' : ''}`}
              style={{
                '--repo-color': repo.color || '#39d353',
                borderColor: repo.color || '#39d353'
              }}
              onClick={() => toggleRepoVisibility(repo.id)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setSingleRepoMode(isFocused ? null : repo.id);
              }}
              title={`${repo.name}: ${repo.commit_count} commits${isHidden ? ' (hidden)' : ''}`}
            >
              <span className="repo-rank">#{index + 1}</span>
              <span className="repo-name">{repo.name}</span>
              <span className="repo-count">{repo.commit_count}</span>
              {isHidden && <span className="hidden-indicator">hidden</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default TopRepos;
