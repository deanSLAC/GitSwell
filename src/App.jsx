import { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import SetupView from './components/SetupView';
import HeatmapView from './components/HeatmapView';
import ReposView from './components/ReposView';
import './App.css';

function App() {
  const [view, setView] = useState('loading'); // loading, setup, heatmap, repos
  const [projectsPath, setProjectsPath] = useState('');
  const [commits, setCommits] = useState([]);
  const [repos, setRepos] = useState([]);
  const [years, setYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [topRepos, setTopRepos] = useState([]);
  const [hiddenRepoIds, setHiddenRepoIds] = useState(new Set());
  const [singleRepoMode, setSingleRepoMode] = useState(null); // null or repo id
  const [allRepoCommits, setAllRepoCommits] = useState([]); // All commits for single repo (all years)
  const [githubFilter, setGithubFilter] = useState('all'); // all, local, github
  const [isLoading, setIsLoading] = useState(true);
  const [parseStatus, setParseStatus] = useState('');

  // Load initial config
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch('/api/config');
        const config = await res.json();

        if (config.projects_path) {
          setProjectsPath(config.projects_path);
          // Check if we have data
          const yearsRes = await fetch('/api/years');
          const yearsData = await yearsRes.json();

          if (yearsData.length > 0) {
            setYears(yearsData);
            setSelectedYear(yearsData[0]);
            setView('heatmap');
          } else {
            setView('setup');
          }
        } else {
          setView('setup');
        }
      } catch (error) {
        console.error('Failed to load config:', error);
        setView('setup');
      }
      setIsLoading(false);
    };

    loadConfig();
  }, []);

  // Load commits when year changes
  useEffect(() => {
    if (!selectedYear) return;

    const loadCommits = async () => {
      try {
        const params = new URLSearchParams({ year: selectedYear });
        if (singleRepoMode) {
          params.set('repoId', singleRepoMode);
        }
        if (githubFilter !== 'all') {
          params.set('githubFilter', githubFilter);
        }
        const res = await fetch(`/api/commits?${params}`);
        const data = await res.json();
        setCommits(data);
      } catch (error) {
        console.error('Failed to load commits:', error);
      }
    };

    loadCommits();
  }, [selectedYear, singleRepoMode, githubFilter]);

  // Load top repos when year changes
  useEffect(() => {
    if (!selectedYear) return;

    const loadTopRepos = async () => {
      try {
        const params = new URLSearchParams({ limit: 5 });
        if (githubFilter !== 'all') {
          params.set('githubFilter', githubFilter);
        }
        const res = await fetch(`/api/top-repos/${selectedYear}?${params}`);
        const data = await res.json();
        setTopRepos(data);
      } catch (error) {
        console.error('Failed to load top repos:', error);
      }
    };

    loadTopRepos();
  }, [selectedYear, githubFilter]);

  // Load ALL commits for single repo (across all years) for charts
  useEffect(() => {
    if (!singleRepoMode) {
      setAllRepoCommits([]);
      return;
    }

    const loadAllRepoCommits = async () => {
      try {
        // Fetch without year filter to get all commits for this repo
        const res = await fetch(`/api/commits?repoId=${singleRepoMode}`);
        const data = await res.json();
        setAllRepoCommits(data);
      } catch (error) {
        console.error('Failed to load all repo commits:', error);
      }
    };

    loadAllRepoCommits();
  }, [singleRepoMode]);

  // Load all repos
  const loadRepos = useCallback(async () => {
    try {
      const res = await fetch('/api/repos');
      const data = await res.json();
      setRepos(data);
    } catch (error) {
      console.error('Failed to load repos:', error);
    }
  }, []);

  useEffect(() => {
    if (view === 'repos' || view === 'heatmap') {
      loadRepos();
    }
  }, [view, loadRepos]);

  // Refresh data
  const refreshYears = async () => {
    const res = await fetch('/api/years');
    const yearsData = await res.json();
    setYears(yearsData);
    if (yearsData.length > 0 && !yearsData.includes(selectedYear)) {
      setSelectedYear(yearsData[0]);
    }
  };

  // Parse repositories
  const handleParse = async (path) => {
    setParseStatus('Starting...');

    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectsPath: path })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n').filter(l => l.startsWith('data: '));

        for (const line of lines) {
          const message = line.replace('data: ', '');
          if (message === 'DONE') {
            setParseStatus('Complete!');
            setProjectsPath(path);
            await refreshYears();
            setView('heatmap');
          } else if (message.startsWith('FAILED') || message.startsWith('ERROR')) {
            setParseStatus(message);
          } else {
            setParseStatus(message);
          }
        }
      }
    } catch (error) {
      setParseStatus(`Error: ${error.message}`);
    }
  };

  // Toggle repo visibility
  const toggleRepoVisibility = (repoId) => {
    setHiddenRepoIds(prev => {
      const next = new Set(prev);
      if (next.has(repoId)) {
        next.delete(repoId);
      } else {
        next.add(repoId);
      }
      return next;
    });
  };

  // Update repo (ignored status or color)
  const updateRepo = async (repoId, updates) => {
    try {
      await fetch(`/api/repos/${repoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      await loadRepos();
      // Refresh commits if we changed ignored status
      if ('ignored' in updates) {
        await refreshYears();
      }
    } catch (error) {
      console.error('Failed to update repo:', error);
    }
  };

  // Filter commits based on hidden repos
  const filteredCommits = commits.filter(c => !hiddenRepoIds.has(c.repo_id));

  if (isLoading) {
    return (
      <div className="app">
        <div className="loading-container">
          <div className="loading-spinner" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header
        view={view}
        setView={setView}
        projectsPath={projectsPath}
        onRefresh={() => setView('setup')}
      />

      {view === 'setup' && (
        <SetupView
          projectsPath={projectsPath}
          onParse={handleParse}
          parseStatus={parseStatus}
          hasData={years.length > 0}
          onCancel={() => setView('heatmap')}
        />
      )}

      {view === 'heatmap' && (
        <HeatmapView
          commits={filteredCommits}
          allCommits={commits}
          allRepoCommits={allRepoCommits}
          repos={repos}
          years={years}
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
          topRepos={topRepos}
          hiddenRepoIds={hiddenRepoIds}
          toggleRepoVisibility={toggleRepoVisibility}
          singleRepoMode={singleRepoMode}
          setSingleRepoMode={setSingleRepoMode}
          githubFilter={githubFilter}
          setGithubFilter={setGithubFilter}
        />
      )}

      {view === 'repos' && (
        <ReposView
          repos={repos}
          updateRepo={updateRepo}
          onBack={() => setView('heatmap')}
        />
      )}
    </div>
  );
}

export default App;
