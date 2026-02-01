import './YearSelector.css';

function YearSelector({ years, selectedYear, onChange }) {
  return (
    <div className="year-selector">
      {years.map(year => (
        <button
          key={year}
          className={`year-btn ${year === selectedYear ? 'active' : ''}`}
          onClick={() => onChange(year)}
        >
          {year}
        </button>
      ))}
    </div>
  );
}

export default YearSelector;
