type StationFiltersProps = {
  operatorSearch: string;
  chargerType: string;
  chargerTypes: string[];
  totalCount: number;
  filteredCount: number;
  onOperatorSearchChange: (
    value: string,
  ) => void;
  onChargerTypeChange: (
    value: string,
  ) => void;
  onReset: () => void;
};

export default function StationFilters({
  operatorSearch,
  chargerType,
  chargerTypes,
  totalCount,
  filteredCount,
  onOperatorSearchChange,
  onChargerTypeChange,
  onReset,
}: StationFiltersProps) {
  const filtersActive =
    operatorSearch.trim() !== "" ||
    chargerType !== "all";

  return (
    <section className="station-filters">
      <p className="section-label">
        QUERY STATIONS
      </p>

      <h3>Filter infrastructure</h3>

      <div className="filter-form">
        <label>
          Operator search

          <input
            type="search"
            value={operatorSearch}
            onChange={(event) =>
              onOperatorSearchChange(
                event.target.value,
              )
            }
            placeholder="Example: ubitricity"
          />
        </label>

        <label>
          Charger type

          <select
            value={chargerType}
            onChange={(event) =>
              onChargerTypeChange(
                event.target.value,
              )
            }
          >
            <option value="all">
              All charger types
            </option>

            {chargerTypes.map((type) => (
              <option
                value={type}
                key={type}
              >
                {type}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="filter-summary">
        <strong>
          {filteredCount.toLocaleString()}
        </strong>

        <span>
          of {totalCount.toLocaleString()} stations
          displayed
        </span>
      </div>

      <button
        className="secondary-button"
        type="button"
        onClick={onReset}
        disabled={!filtersActive}
      >
        Reset filters
      </button>
    </section>
  );
}
