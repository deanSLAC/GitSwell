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

/**
 * Determine the best time aggregation based on the time span
 * - < 3 months: daily
 * - < 2 years: weekly (default)
 * - >= 2 years: monthly
 */
function getAggregationLevel(commits) {
  if (commits.length === 0) return 'week';

  const timestamps = commits.map(c => c.timestamp);
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const spanDays = (maxTime - minTime) / (60 * 60 * 24);

  if (spanDays < 90) return 'day';
  if (spanDays < 730) return 'week';
  return 'month';
}

/**
 * Get the start of the period (day, week, or month) for a timestamp
 */
function getPeriodKey(timestamp, level) {
  const date = new Date(timestamp * 1000);

  if (level === 'day') {
    return date.toISOString().split('T')[0];
  }

  if (level === 'week') {
    // Get Monday of the week
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    return monday.toISOString().split('T')[0];
  }

  // Month
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function RepoCharts({ commits, repoInfo }) {
  // Aggregate commits by time period for bar chart
  const { barData, aggregationLevel } = useMemo(() => {
    if (commits.length === 0) return { barData: [], aggregationLevel: 'week' };

    const level = getAggregationLevel(commits);
    const aggregated = new Map();

    // Sort commits by timestamp
    const sortedCommits = [...commits].sort((a, b) => a.timestamp - b.timestamp);

    sortedCommits.forEach(commit => {
      const key = getPeriodKey(commit.timestamp, level);
      if (!aggregated.has(key)) {
        aggregated.set(key, { period: key, commits: 0 });
      }
      aggregated.get(key).commits++;
    });

    // Convert to array and sort by period
    const data = Array.from(aggregated.values()).sort((a, b) => a.period.localeCompare(b.period));

    // Create short labels based on aggregation level
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let lastMonth = null;

    data.forEach((d, idx) => {
      if (level === 'month') {
        const [year, month] = d.period.split('-');
        const monthIdx = parseInt(month) - 1;
        // Show year on first item or when year changes
        if (idx === 0 || !data[idx - 1].period.startsWith(year)) {
          d.label = `${monthNames[monthIdx]} '${year.slice(2)}`;
        } else {
          d.label = monthNames[monthIdx];
        }
      } else {
        const date = new Date(d.period + 'T00:00:00');
        const month = date.getMonth();
        const day = date.getDate();

        if (level === 'day') {
          // Show month name on day 1 or first data point
          if (month !== lastMonth) {
            d.label = `${monthNames[month]} ${day}`;
            lastMonth = month;
          } else {
            d.label = String(day);
          }
        } else {
          // Weekly - show "Mon D" format
          if (month !== lastMonth) {
            d.label = `${monthNames[month]} ${day}`;
            lastMonth = month;
          } else {
            d.label = String(day);
          }
        }
      }

      // Keep full date for tooltip
      d.fullDate = d.period;
    });

    return { barData: data, aggregationLevel: level };
  }, [commits]);

  // Calculate cumulative LOC over time for line chart
  const locData = useMemo(() => {
    if (commits.length === 0) return [];

    // Sort commits by timestamp
    const sortedCommits = [...commits].sort((a, b) => a.timestamp - b.timestamp);

    let cumulativeLOC = 0;
    const data = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let lastMonth = null;

    sortedCommits.forEach((commit, idx) => {
      const added = commit.files?.reduce((sum, f) => sum + (f.added || 0), 0) || 0;
      const deleted = commit.files?.reduce((sum, f) => sum + (f.deleted || 0), 0) || 0;
      cumulativeLOC += (added - deleted);

      const date = new Date(commit.timestamp * 1000);
      const month = date.getMonth();
      const day = date.getDate();

      // Create short label - show month on first occurrence
      let label;
      if (month !== lastMonth) {
        label = `${monthNames[month]} ${day}`;
        lastMonth = month;
      } else {
        label = String(day);
      }

      data.push({
        idx,
        timestamp: commit.timestamp,
        label,
        fullDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        loc: cumulativeLOC,
        added,
        deleted,
        message: commit.message
      });
    });

    return data;
  }, [commits]);

  // Calculate smart tick interval
  const getTickInterval = (dataLength) => {
    if (dataLength <= 10) return 0; // Show all
    if (dataLength <= 20) return 1; // Show every other
    if (dataLength <= 50) return Math.floor(dataLength / 10);
    return Math.floor(dataLength / 8);
  };

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

  if (commits.length === 0) {
    return (
      <div className="repo-charts">
        <p className="no-data">No commits to display</p>
      </div>
    );
  }

  const levelLabel = aggregationLevel === 'day' ? 'Daily' : aggregationLevel === 'week' ? 'Weekly' : 'Monthly';

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
          <h4>{levelLabel} Commits</h4>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border-color)' }}
                  interval={getTickInterval(barData.length)}
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
                  formatter={(value) => [value, 'Commits']}
                  labelFormatter={(label, payload) => {
                    if (payload && payload[0]) {
                      return payload[0].payload.fullDate;
                    }
                    return label;
                  }}
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
                  dataKey="label"
                  tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border-color)' }}
                  interval={getTickInterval(locData.length)}
                />
                <YAxis
                  tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => {
                    if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}k`;
                    return value;
                  }}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    fontSize: '12px'
                  }}
                  formatter={(value, name) => {
                    if (name === 'loc') return [value.toLocaleString() + ' lines', 'Total LOC'];
                    return [value, name];
                  }}
                  labelFormatter={(label, payload) => {
                    if (payload && payload[0]) {
                      const p = payload[0].payload;
                      const msg = p.message?.slice(0, 40) || '';
                      return `${p.fullDate}${msg ? ': ' + msg : ''}`;
                    }
                    return label;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="loc"
                  stroke={repoInfo?.color || 'var(--color-accent)'}
                  strokeWidth={2}
                  dot={locData.length < 50 ? { r: 2 } : false}
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
