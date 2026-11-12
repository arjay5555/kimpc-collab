import React, { useState, useRef, useEffect } from "react";

/**
 * ManagerSearchBar
 * Unified search bar with embedded icon-only Filter and Sort controls.
 *
 * Props:
 * - searchQuery: string
 * - onSearchChange: (value: string) => void
 * - placeholder: string (optional)
 * - filters: Array<{
 *     id: string,
 *     label: string,
 *     value: string,
 *     defaultValue?: string,
 *     onChange: (value: string) => void,
 *     options: Array<string | { value: string, label: string }>
 *   }>
 * - sort: {
 *     value: string,
 *     defaultValue?: string,
 *     onChange: (value: string) => void,
 *     options: Array<string | { value: string, label: string }>
 *   }
 * - onResetFilters?: () => void
 * - style?: React.CSSProperties
 * - className?: string
 */
export default function ManagerSearchBar({
  searchQuery = "",
  onSearchChange = () => {},
  placeholder = "Search...",
  filters = [],
  sort = null,
  onResetFilters,
  style = {},
  className = "",
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const containerRef = useRef(null);

  // Close popovers when clicking outside or pressing Escape
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setFilterOpen(false);
        setSortOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setFilterOpen(false);
        setSortOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Compute active filters count
  const activeFiltersCount = filters.reduce((count, f) => {
    const defaultVal = f.defaultValue !== undefined ? f.defaultValue : "All";
    return f.value !== defaultVal ? count + 1 : count;
  }, 0);

  // Check if sort is non-default
  const defaultSortVal = sort?.defaultValue || sort?.options?.[0]?.value || (typeof sort?.options?.[0] === "string" ? sort.options[0] : "");
  const isSortActive = sort && sort.value && sort.value !== defaultSortVal;

  const handleReset = () => {
    if (onResetFilters) {
      onResetFilters();
    } else {
      filters.forEach((f) => {
        const defaultVal = f.defaultValue !== undefined ? f.defaultValue : "All";
        f.onChange(defaultVal);
      });
    }
  };

  return (
    <div
      ref={containerRef}
      className={`wz-unified-search-box ${className}`}
      style={style}
    >
      {/* Search Magnifying Glass Icon */}
      <span className="wz-search-left-icon">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>

      {/* Search Input */}
      <input
        type="text"
        placeholder={placeholder}
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      {/* Clear Search Button */}
      {searchQuery && (
        <button
          type="button"
          className="wz-search-clear-btn"
          onClick={() => onSearchChange("")}
          title="Clear search"
          aria-label="Clear search"
        >
          ✕
        </button>
      )}

      {/* Embedded Action Icons (Filter & Sort) */}
      {(filters.length > 0 || sort) && (
        <>
          <div className="wz-search-divider" />
          <div className="wz-search-actions">
            {/* Filter Icon Button */}
            {filters.length > 0 && (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  className={`wz-search-icon-btn ${activeFiltersCount > 0 ? "active" : ""} ${filterOpen ? "open" : ""}`}
                  onClick={() => {
                    setFilterOpen((prev) => !prev);
                    setSortOpen(false);
                  }}
                  title={activeFiltersCount > 0 ? `Filters applied (${activeFiltersCount})` : "Filter options"}
                  aria-label="Filter"
                  aria-expanded={filterOpen}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                  </svg>
                  {activeFiltersCount > 0 && (
                    <span className="wz-search-badge">{activeFiltersCount}</span>
                  )}
                </button>

                {/* Filter Popover Dropdown */}
                {filterOpen && (
                  <div className="wz-search-popover wz-filter-popover">
                    <div className="wz-popover-header">
                      <span className="wz-popover-title">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                        </svg>
                        Filters
                        {activeFiltersCount > 0 && (
                          <span style={{ fontSize: "0.72rem", color: "#2563eb", fontWeight: 700 }}>
                            ({activeFiltersCount})
                          </span>
                        )}
                      </span>
                      {activeFiltersCount > 0 && (
                        <button
                          type="button"
                          className="wz-popover-reset"
                          onClick={handleReset}
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    <div className="wz-popover-body">
                      {filters.map((f, idx) => (
                        <div key={f.id || idx} className="wz-filter-field">
                          <label className="wz-filter-label">{f.label}</label>
                          <select
                            className="wz-popover-select"
                            value={f.value}
                            onChange={(e) => f.onChange(e.target.value)}
                          >
                            {f.options.map((opt, optIdx) => {
                              const val = typeof opt === "object" ? opt.value : opt;
                              const lbl = typeof opt === "object" ? opt.label : opt;
                              return (
                                <option key={optIdx} value={val}>
                                  {lbl}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sort Icon Button */}
            {sort && sort.options && sort.options.length > 0 && (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  className={`wz-search-icon-btn ${isSortActive ? "active" : ""} ${sortOpen ? "open" : ""}`}
                  onClick={() => {
                    setSortOpen((prev) => !prev);
                    setFilterOpen(false);
                  }}
                  title="Sort options"
                  aria-label="Sort"
                  aria-expanded={sortOpen}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7 15l5 5 5-5" />
                    <path d="M7 9l5-5 5 5" />
                  </svg>
                  {isSortActive && <span className="wz-search-dot" />}
                </button>

                {/* Sort Popover Dropdown */}
                {sortOpen && (
                  <div className="wz-search-popover wz-sort-popover">
                    <div className="wz-popover-header">
                      <span className="wz-popover-title">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M7 15l5 5 5-5" />
                          <path d="M7 9l5-5 5 5" />
                        </svg>
                        Sort By
                      </span>
                    </div>

                    <div className="wz-sort-list">
                      {sort.options.map((opt, optIdx) => {
                        const val = typeof opt === "object" ? opt.value : opt;
                        const rawLabel = typeof opt === "object" ? opt.label : opt;
                        const cleanLabel = rawLabel.replace(/^Sort:\s*/i, "");
                        const isSelected = sort.value === val;
                        return (
                          <button
                            key={optIdx}
                            type="button"
                            className={`wz-sort-option ${isSelected ? "selected" : ""}`}
                            onClick={() => {
                              sort.onChange(val);
                              setSortOpen(false);
                            }}
                          >
                            <span>{cleanLabel}</span>
                            {isSelected && <span className="wz-sort-check">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

