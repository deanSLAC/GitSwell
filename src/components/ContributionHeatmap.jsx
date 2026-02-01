import { useMemo } from 'react';
import './ContributionHeatmap.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ContributionHeatmap({ commits, year, onSelectDate, selectedDate }) {
  // Build a map of date -> { count, repos, color }
  const dateMap = useMemo(() => {
    const map = new Map();

    commits.forEach(commit => {
      const date = new Date(commit.timestamp * 1000).toISOString().split('T')[0];
      if (!map.has(date)) {
        map.set(date, { count: 0, repos: new Map() });
      }
      const entry = map.get(date);
      entry.count++;

      // Track repo colors
      if (!entry.repos.has(commit.repo_id)) {
        entry.repos.set(commit.repo_id, {
          color: commit.repo_color,
          count: 0
        });
      }
      entry.repos.get(commit.repo_id).count++;
    });

    return map;
  }, [commits]);

  // Generate calendar grid
  const weeks = useMemo(() => {
    const startDate = new Date(`${year}-01-01`);
    const endDate = new Date(`${year}-12-31`);

    // Start from the Sunday of the week containing Jan 1
    const firstSunday = new Date(startDate);
    firstSunday.setDate(firstSunday.getDate() - firstSunday.getDay());

    const weeks = [];
    let currentWeek = [];
    let currentDate = new Date(firstSunday);

    while (currentDate <= endDate || currentWeek.length > 0) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const isInYear = currentDate.getFullYear() === year;

      currentWeek.push({
        date: dateStr,
        dayOfWeek: currentDate.getDay(),
        isInYear,
        month: currentDate.getMonth(),
        dayOfMonth: currentDate.getDate()
      });

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }

      currentDate.setDate(currentDate.getDate() + 1);

      // Stop after we've completed the week containing Dec 31
      if (currentDate.getFullYear() > year && currentWeek.length === 0) {
        break;
      }
    }

    // Handle partial last week
    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }

    return weeks;
  }, [year]);

  // Calculate month labels positions
  const monthLabels = useMemo(() => {
    const labels = [];
    let lastMonth = -1;

    weeks.forEach((week, weekIndex) => {
      const firstDayInYear = week.find(d => d.isInYear);
      if (firstDayInYear && firstDayInYear.month !== lastMonth) {
        labels.push({
          month: MONTHS[firstDayInYear.month],
          weekIndex
        });
        lastMonth = firstDayInYear.month;
      }
    });

    return labels;
  }, [weeks]);

  // Get color and intensity for a day
  const getDayStyle = (dateStr, isInYear) => {
    if (!isInYear) {
      return { backgroundColor: 'transparent' };
    }

    const entry = dateMap.get(dateStr);
    if (!entry || entry.count === 0) {
      return { backgroundColor: 'var(--color-empty)' };
    }

    // Determine the dominant color
    let color;
    if (entry.repos.size === 1) {
      // Single repo - use its color
      const [repoData] = entry.repos.values();
      color = repoData.color || '#39d353';
    } else {
      // Multiple repos - use white/neutral
      color = '#ffffff';
    }

    // Calculate intensity based on count
    const intensity = Math.min(entry.count / 10, 1); // Normalize to 0-1
    const minOpacity = 0.3;
    const opacity = minOpacity + (intensity * (1 - minOpacity));

    return {
      backgroundColor: color,
      opacity
    };
  };

  return (
    <div className="contribution-heatmap">
      <div className="heatmap-grid">
        {/* Month labels */}
        <div className="month-labels">
          <div className="day-labels-spacer" />
          {monthLabels.map((label, i) => (
            <div
              key={i}
              className="month-label"
              style={{ gridColumn: label.weekIndex + 2 }}
            >
              {label.month}
            </div>
          ))}
        </div>

        {/* Grid with day labels */}
        <div className="grid-container">
          {/* Day labels */}
          <div className="day-labels">
            {DAYS.map((day, i) => (
              <div key={day} className="day-label" style={{ visibility: i % 2 === 1 ? 'visible' : 'hidden' }}>
                {day}
              </div>
            ))}
          </div>

          {/* Cells */}
          <div className="cells-grid">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="week-column">
                {week.map(day => {
                  const entry = dateMap.get(day.date);
                  const count = entry?.count || 0;

                  return (
                    <div
                      key={day.date}
                      className={`day-cell ${day.isInYear ? 'in-year' : ''} ${selectedDate === day.date ? 'selected' : ''}`}
                      style={getDayStyle(day.date, day.isInYear)}
                      onClick={() => day.isInYear && count > 0 && onSelectDate(day.date)}
                      title={day.isInYear ? `${day.date}: ${count} contribution${count !== 1 ? 's' : ''}` : ''}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="heatmap-legend">
        <span>Less</span>
        <div className="legend-cells">
          <div className="legend-cell" style={{ backgroundColor: 'var(--color-empty)' }} />
          <div className="legend-cell" style={{ backgroundColor: 'var(--color-level-1)' }} />
          <div className="legend-cell" style={{ backgroundColor: 'var(--color-level-2)' }} />
          <div className="legend-cell" style={{ backgroundColor: 'var(--color-level-3)' }} />
          <div className="legend-cell" style={{ backgroundColor: 'var(--color-level-4)' }} />
        </div>
        <span>More</span>
      </div>
    </div>
  );
}

export default ContributionHeatmap;
