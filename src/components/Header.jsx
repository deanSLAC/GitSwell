import './Header.css';

function Header({ view, setView, projectsPath, onRefresh }) {
  return (
    <header className="header">
      <div className="header-content">
        <div className="header-left">
          <h1 className="header-title" onClick={() => setView('heatmap')}>
            GitSwell
          </h1>
          {projectsPath && (
            <span className="header-path" title={projectsPath}>
              {projectsPath}
            </span>
          )}
        </div>

        <nav className="header-nav">
          <button
            className={`nav-btn ${view === 'heatmap' ? 'active' : ''}`}
            onClick={() => setView('heatmap')}
          >
            Heatmap
          </button>
          <button
            className={`nav-btn ${view === 'repos' ? 'active' : ''}`}
            onClick={() => setView('repos')}
          >
            Repositories
          </button>
          <button
            className="nav-btn"
            onClick={onRefresh}
            title="Scan for repositories"
          >
            Scan
          </button>
        </nav>
      </div>
    </header>
  );
}

export default Header;
