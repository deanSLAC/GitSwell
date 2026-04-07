import { useState, useMemo } from 'react';
import YearSelector from './YearSelector';
import ContributionHeatmap from './ContributionHeatmap';
import TopRepos from './TopRepos';
import DayDetail from './DayDetail';
import RepoCharts from './RepoCharts';
import './HeatmapView.css';

function HeatmapView({
  commits,
  allCommits,
  allRepoCommits,
  repos,
  years,
  selectedYear,
  setSelectedYear,
  topRepos,
  hiddenRepoIds,
  toggleRepoVisibility,
  singleRepoMode,
  setSingleRepoMode,
  githubFilter,
  setGithubFilter
}) {
  const [selectedDate, setSelectedDate] = useState(null);

  // Calculate stats
  const stats = useMemo(() => {
    const totalCommits = commits.length;
    const uniqueRepos = new Set(commits.map(c => c.repo_id)).size;
    const daySet = new Set(
      commits.map(c => new Date(c.timestamp * 1000).toISOString().split('T')[0])
    );
    const uniqueDays = daySet.size;

    // Calculate longest streak of consecutive days
    let longestStreak = 0;
    if (daySet.size > 0) {
      const sortedDays = [...daySet].sort();
      let current = 1;
      for (let i = 1; i < sortedDays.length; i++) {
        const prev = new Date(sortedDays[i - 1] + 'T00:00:00Z');
        const curr = new Date(sortedDays[i] + 'T00:00:00Z');
        const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
        if (diffDays === 1) {
          current++;
        } else {
          current = 1;
        }
        if (current > longestStreak) longestStreak = current;
      }
      if (sortedDays.length === 1) longestStreak = 1;
      if (current > longestStreak) longestStreak = current;
    }

    return { totalCommits, uniqueRepos, uniqueDays, longestStreak };
  }, [commits]);

  // Get commits for selected date
  const selectedDayCommits = useMemo(() => {
    if (!selectedDate) return [];
    return commits.filter(c => {
      const date = new Date(c.timestamp * 1000).toISOString().split('T')[0];
      return date === selectedDate;
    });
  }, [commits, selectedDate]);

  // Get the single repo info if in single repo mode
  const singleRepoInfo = useMemo(() => {
    if (!singleRepoMode) return null;
    return repos.find(r => r.id === singleRepoMode);
  }, [singleRepoMode, repos]);

  return (
    <main className="heatmap-view">
      <div className="heatmap-header">
        <div className="stats-bar">
          <span className="stat">
            <strong>{stats.totalCommits.toLocaleString()}</strong> contributions
          </span>
          <span className="stat">
            <strong>{stats.uniqueRepos}</strong> repositories
          </span>
          <span className="stat">
            <strong>{stats.uniqueDays}</strong> active days
          </span>
          <span className="stat">
            <strong>{stats.longestStreak}</strong> longest streak
          </span>
        </div>

        <YearSelector
          years={years}
          selectedYear={selectedYear}
          onChange={setSelectedYear}
        />
      </div>

      <div className="github-filter-bar">
        <div className="github-filter-toggle">
          <button
            className={`github-filter-btn ${githubFilter === 'all' ? 'active' : ''}`}
            onClick={() => setGithubFilter('all')}
          >
            All
          </button>
          <button
            className={`github-filter-btn ${githubFilter === 'local' ? 'active' : ''}`}
            onClick={() => setGithubFilter('local')}
          >
            Local Only
          </button>
          <button
            className={`github-filter-btn ${githubFilter === 'github' ? 'active' : ''}`}
            onClick={() => setGithubFilter('github')}
          >
            On GitHub
          </button>
        </div>
        {githubFilter !== 'all' && (
          <span className="github-filter-label">
            {githubFilter === 'local'
              ? 'Showing contributions not on GitHub'
              : 'Showing contributions already on GitHub'}
          </span>
        )}
      </div>

      {singleRepoMode && singleRepoInfo && (
        <div className="single-repo-banner">
          <span>
            Showing commits for: <strong style={{ color: singleRepoInfo.color }}>{singleRepoInfo.name}</strong>
          </span>
          <button className="btn btn-sm" onClick={() => setSingleRepoMode(null)}>
            Show All Repos
          </button>
        </div>
      )}

      <TopRepos
        repos={topRepos}
        hiddenRepoIds={hiddenRepoIds}
        toggleRepoVisibility={toggleRepoVisibility}
        singleRepoMode={singleRepoMode}
        setSingleRepoMode={setSingleRepoMode}
      />

      <div className="heatmap-container card">
        <ContributionHeatmap
          commits={commits}
          year={selectedYear}
          onSelectDate={setSelectedDate}
          selectedDate={selectedDate}
        />
      </div>

      {singleRepoMode && singleRepoInfo && allRepoCommits.length > 0 && (
        <RepoCharts
          commits={allRepoCommits}
          repoInfo={singleRepoInfo}
        />
      )}

      {selectedDate && (
        <DayDetail
          date={selectedDate}
          commits={selectedDayCommits}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </main>
  );
}

export default HeatmapView;
