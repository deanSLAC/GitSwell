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
  repos,
  years,
  selectedYear,
  setSelectedYear,
  topRepos,
  hiddenRepoIds,
  toggleRepoVisibility,
  singleRepoMode,
  setSingleRepoMode
}) {
  const [selectedDate, setSelectedDate] = useState(null);

  // Calculate stats
  const stats = useMemo(() => {
    const totalCommits = commits.length;
    const uniqueRepos = new Set(commits.map(c => c.repo_id)).size;
    const uniqueDays = new Set(
      commits.map(c => new Date(c.timestamp * 1000).toISOString().split('T')[0])
    ).size;

    return { totalCommits, uniqueRepos, uniqueDays };
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
        </div>

        <YearSelector
          years={years}
          selectedYear={selectedYear}
          onChange={setSelectedYear}
        />
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

      {singleRepoMode && singleRepoInfo && (
        <RepoCharts
          commits={commits}
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
