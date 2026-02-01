import { useMemo } from 'react';
import './DayDetail.css';

function DayDetail({ date, commits, onClose }) {
  // Group commits by repo
  const groupedCommits = useMemo(() => {
    const groups = new Map();

    commits.forEach(commit => {
      if (!groups.has(commit.repo)) {
        groups.set(commit.repo, {
          name: commit.repo,
          color: commit.repo_color,
          commits: []
        });
      }
      groups.get(commit.repo).commits.push(commit);
    });

    // Sort by number of commits descending
    return Array.from(groups.values()).sort((a, b) => b.commits.length - a.commits.length);
  }, [commits]);

  // Calculate totals
  const totals = useMemo(() => {
    let files = 0;
    let added = 0;
    let deleted = 0;

    commits.forEach(commit => {
      commit.files?.forEach(file => {
        files++;
        added += file.added || 0;
        deleted += file.deleted || 0;
      });
    });

    return { commits: commits.length, repos: groupedCommits.length, files, added, deleted };
  }, [commits, groupedCommits]);

  const formatTime = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="day-detail card">
      <div className="day-detail-header">
        <div>
          <h3 className="day-detail-title">{formatDate(date)}</h3>
          <div className="day-detail-stats">
            <span><strong>{totals.commits}</strong> commits</span>
            <span><strong>{totals.repos}</strong> repos</span>
            <span><strong>{totals.files}</strong> files</span>
            <span className="additions">+{totals.added}</span>
            <span className="deletions">-{totals.deleted}</span>
          </div>
        </div>
        <button className="btn btn-sm btn-icon" onClick={onClose}>
          &times;
        </button>
      </div>

      <div className="day-detail-content">
        {groupedCommits.map(group => (
          <div key={group.name} className="repo-group">
            <div
              className="repo-group-header"
              style={{ borderLeftColor: group.color || 'var(--border-color)' }}
            >
              <span className="repo-group-name">{group.name}</span>
              <span className="repo-group-count">{group.commits.length}</span>
            </div>

            <div className="commit-list">
              {group.commits.map(commit => (
                <div key={commit.hash} className="commit-item">
                  <div className="commit-main">
                    <span className="commit-time">{formatTime(commit.timestamp)}</span>
                    <code className="commit-hash">{commit.hash.slice(0, 7)}</code>
                    <span className="commit-message">{commit.message}</span>
                  </div>

                  {commit.files && commit.files.length > 0 && (
                    <div className="commit-files">
                      {commit.files.slice(0, 5).map((file, i) => (
                        <div key={i} className="file-change">
                          <span className="file-name">{file.file}</span>
                          <span className="file-stats">
                            {file.added > 0 && <span className="additions">+{file.added}</span>}
                            {file.deleted > 0 && <span className="deletions">-{file.deleted}</span>}
                          </span>
                        </div>
                      ))}
                      {commit.files.length > 5 && (
                        <div className="file-change more">
                          ...and {commit.files.length - 5} more files
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default DayDetail;
