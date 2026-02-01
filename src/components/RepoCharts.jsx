import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import './RepoCharts.css';

// Format timestamp to readable date
function formatDate(timestamp, format = 'short') {
  const date = new Date(timestamp);
  if (format === 'month') {
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  if (format === 'full') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Get start of month timestamp
function getMonthStart(timestamp) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

function RepoCharts({ commits, repoInfo }) {
  // Aggregate commits by MONTH for bar chart (simpler and cleaner)
  const barData = useMemo(() => {
    if (commits.length === 0) return [];

    const aggregated = new Map();

    commits.forEach(commit => {
      const monthStart = getMonthStart(commit.timestamp * 1000);
      if (!aggregated.has(monthStart)) {
        aggregated.set(monthStart, { timestamp: monthStart, commits: 0 });
      }
      aggregated.get(monthStart).commits++;
    });

    // Convert to array and sort by timestamp
    return Array.from(aggregated.values()).sort((a, b) => a.timestamp - b.timestamp);
  }, [commits]);

  // Calculate cumulative LOC over time for line chart
  // Aggregate by DAY to avoid too many points and jittering
  const locData = useMemo(() => {
    if (commits.length === 0) return [];

    // Sort commits by timestamp
    const sortedCommits = [...commits].sort((a, b) => a.timestamp - b.timestamp);

    // Aggregate by day
    const dailyData = new Map();
    let cumulativeLOC = 0;

    sortedCommits.forEach(commit => {
      const added = commit.files?.reduce((sum, f) => sum + (f.added || 0), 0) || 0;
      const deleted = commit.files?.reduce((sum, f) => sum + (f.deleted || 0), 0) || 0;
      cumulativeLOC += (added - deleted);

      // Get start of day
      const date = new Date(commit.timestamp * 1000);
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

      // Always update to latest cumulative value for this day
      dailyData.set(dayStart, {
        timestamp: dayStart,
        loc: cumulativeLOC
      });
    });

    return Array.from(dailyData.values()).sort((a, b) => a.timestamp - b.timestamp);
  }, [commits]);

  // Stats
  const stats = useMemo(() => {
    const totalCommits = commits.length;
    const totalAdded = commits.reduce((sum, c) =>
      sum + (c.files?.reduce((s, f) => s + (f.added || 0), 0) || 0), 0);
    const totalDeleted = commits.reduce((sum, c) =>
      sum + (c.files?.reduce((s, f) => s + (f.deleted || 0), 0) || 0), 0);
    const netLOC = totalAdded - totalDeleted;

    return { totalCommits, totalAdded, totalDeleted, netLOC };
  }, [commits]);

  // Calculate time range for better tick formatting
  const timeRange = useMemo(() => {
    if (barData.length === 0) return { months: 0 };
    const first = barData[0].timestamp;
    const last = barData[barData.length - 1].timestamp;
    const months = (last - first) / (1000 * 60 * 60 * 24 * 30);
    return { months, first, last };
  }, [barData]);

  if (commits.length === 0) {
    return (
      <div className="repo-charts">
        <p className="no-data">No commits to display</p>
      </div>
    );
  }

  // Custom tick formatter for bar chart (monthly)
  const formatBarTick = (timestamp) => {
    return formatDate(timestamp, 'month');
  };

  // Custom tick formatter for line chart
  const formatLineTick = (timestamp) => {
    // Show month and year for multi-year spans, just month otherwise
    if (timeRange.months > 18) {
      return formatDate(timestamp, 'month');
    }
    return formatDate(timestamp, 'short');
  };

  // Tooltip formatters
  const barTooltipFormatter = (value, name, props) => {
    return [value, 'Commits'];
  };

  const barLabelFormatter = (timestamp) => {
    return formatDate(timestamp, 'month');
  };

  const locTooltipFormatter = (value) => {
    return [value.toLocaleString() + ' lines', 'Total LOC'];
  };

  const locLabelFormatter = (timestamp) => {
    return formatDate(timestamp, 'full');
  };

  return (
    <div className="repo-charts">
      <div className="charts-header">
        <h3>Repository Activity: <span style={{ color: repoInfo?.color }}>{repoInfo?.name}</span></h3>
        <div className="charts-stats">
          <span><strong>{stats.totalCommits}</strong> commits</span>
          <span className="additions">+{stats.totalAdded.toLocaleString()}</span>
          <span className="deletions">-{stats.totalDeleted.toLocaleString()}</span>
          <span>Net: <strong>{stats.netLOC.toLocaleString()}</strong> LOC</span>
        </div>
      </div>

      <div className="charts-grid">
        {/* Commits over time bar chart */}
        <div className="chart-card">
          <h4>Monthly Commits</h4>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={formatBarTick}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border-color)' }}
                />
                <YAxis
                  tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    fontSize: '12px'
                  }}
                  formatter={barTooltipFormatter}
                  labelFormatter={barLabelFormatter}
                />
                <Bar
                  dataKey="commits"
                  fill={repoInfo?.color || 'var(--color-level-4)'}
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* LOC over time line chart */}
        <div className="chart-card">
          <h4>Lines of Code Over Time</h4>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={locData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={formatLineTick}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border-color)' }}
                />
                <YAxis
                  tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => {
                    if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                    if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}k`;
                    return value;
                  }}
                  width={45}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    fontSize: '12px'
                  }}
                  formatter={locTooltipFormatter}
                  labelFormatter={locLabelFormatter}
                />
                <Line
                  type="monotone"
                  dataKey="loc"
                  stroke={repoInfo?.color || 'var(--color-accent)'}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RepoCharts;
