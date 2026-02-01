import { useState } from 'react';
import './SetupView.css';

function SetupView({ projectsPath, onParse, parseStatus, hasData, onCancel }) {
  const [path, setPath] = useState(projectsPath || '');
  const [isParsing, setIsParsing] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!path.trim()) return;

    setIsParsing(true);
    await onParse(path.trim());
    setIsParsing(false);
  };

  return (
    <main className="setup-view">
      <div className="setup-card card">
        <h2>Configure Projects Directory</h2>
        <p className="setup-description">
          Enter the path to a directory containing your git repositories.
          The scanner will recursively search for git repos up to 3 levels deep.
        </p>

        <form onSubmit={handleSubmit} className="setup-form">
          <div className="form-group">
            <label htmlFor="path">Projects Directory</label>
            <input
              type="text"
              id="path"
              className="input"
              placeholder="/path/to/your/projects"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              disabled={isParsing}
            />
          </div>

          <div className="setup-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!path.trim() || isParsing}
            >
              {isParsing ? 'Scanning...' : 'Scan for Repositories'}
            </button>

            {hasData && (
              <button
                type="button"
                className="btn"
                onClick={onCancel}
                disabled={isParsing}
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        {parseStatus && (
          <div className={`parse-status ${parseStatus.includes('ERROR') || parseStatus.includes('FAILED') ? 'error' : ''}`}>
            <pre>{parseStatus}</pre>
          </div>
        )}
      </div>
    </main>
  );
}

export default SetupView;
