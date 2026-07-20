import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import './App.css'

const dashboardStorageKey = 'radar-cw:dashboard:v1'
const logoReservedGridRows = 16
const customerLogos = [
  { label: 'ARNG', file: 'ARNG-logo-with-background.svg' },
  { label: 'Booz Allen', file: 'boozallen-logo.svg' },
  { label: 'BWXT', file: 'bwxt-cropped-cropped-bwxt-reverse-logo-300x130.webp' },
  { label: 'Byrd Enterprises', file: 'Byrd-Enterprises-Logo+Red.webp' },
  { label: 'Centra', file: 'centra-logo-inline.svg' },
  { label: 'Clemson', file: 'clemson-logo-orange-purple.png' },
  { label: 'COL', file: 'COL_Logo_Locator.png' },
  { label: 'DARPA', file: 'DARPA_Draft_Logo_01_White.png' },
  { label: 'DISA', file: 'DISA-article-card.png' },
  { label: 'Framatome', file: 'Framatome_logo.svg' },
  { label: 'GE Aerospace', file: 'ge-aerospace-logo.jpg' },
  { label: 'ITG', file: 'ITG- Logo - Transparent.png' },
  { label: 'Kinectrics', file: 'kinectrics-2026-Logo-RGB_Workmark-Navy.svg' },
  { label: 'Microsoft', file: 'Microsoft_Horizontal_Logo.png' },
  { label: 'Orano', file: 'ORANO_HORIZ_YellowWhite_RGB.png' },
  { label: 'pWin.ai', file: 'pWin.ai_logo_TM_BLw-w_RGB.svg' },
  { label: 'Sova', file: 'sova-logo-1.webp' },
  { label: 'Space Force', file: 'SpaceForce_Horizontal_Flat_K.png' },
  { label: 'USAF', file: 'USAF_Horizontal_black.png' },
  { label: 'WPOA', file: 'WPOA logo 062220.png' },
]

function customerLogoUrl(file) {
  return `/customer-logos/${encodeURIComponent(file)}`
}

function loadPersistedDashboard() {
  if (typeof window === 'undefined') return null
  try {
    const stored = JSON.parse(window.localStorage.getItem(dashboardStorageKey))
    if (!stored?.file || !Array.isArray(stored.file.rows) || !Array.isArray(stored.file.columns)) return null
    const workspaces = Array.isArray(stored.workspaces)
      ? stored.workspaces
        .filter((workspace) => workspace?.id && workspace?.name)
        .map((workspace) => ({ ...workspace, visualizations: Array.isArray(workspace.visualizations) ? workspace.visualizations : [] }))
      : []
    if (!workspaces.length) return null
    const activeWorkspaceId = workspaces.some((workspace) => workspace.id === stored.activeWorkspaceId)
      ? stored.activeWorkspaceId
      : workspaces[0].id
    return { file: stored.file, workspaces, activeWorkspaceId }
  } catch {
    return null
  }
}

function CsvSelectionPage({ onData }) {
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  const parseFile = useCallback((file) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Select a CSV file to continue.')
      return
    }

    setLoading(true)
    setError(null)
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: ({ data, meta, errors }) => {
        setLoading(false)
        if (errors.length) {
          setError(errors[0].message)
          return
        }
        if (!data.length) {
          setError('File parsed but contained no rows.')
          return
        }
        onData({ name: file.name, rows: data, columns: meta.fields ?? [] })
      },
      error: (parseError) => {
        setLoading(false)
        setError(parseError.message)
      },
    })
  }, [onData])

  function handleDrop(event) {
    event.preventDefault()
    setDragging(false)
    parseFile(event.dataTransfer.files[0])
  }

  return (
    <main className="cw-upload-page">
      <div className="cw-upload-brand" aria-label="RADAR Continuous Wave">
        <span className="cw-brand-radar">RADAR</span>
        <span className="cw-brand-sep"> | Continuous Wave</span>
      </div>
      <section
        className={`cw-drop-zone${dragging ? ' is-dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click()
        }}
        aria-label="Select a CSV file"
      >
        <div className="cw-drop-icon" aria-hidden="true">CSV</div>
        <h1>{loading ? 'Reading CSV...' : 'Drop your CSV here'}</h1>
        <p>or click to browse</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="cw-file-input"
          onChange={(event) => parseFile(event.target.files[0])}
        />
      </section>
      <p className="cw-upload-note">CSV data stays in this browser session.</p>
      {error && <div className="cw-upload-error" role="alert">{error}</div>}
    </main>
  )
}

const visualizationTypes = [
  { name: 'Metric', description: 'Show a labeled count for a CSV data field.' },
  { name: 'Line chart', description: 'Track change and trends across a continuous range.' },
  { name: 'Bar chart', description: 'Compare values across discrete categories.' },
  { name: 'Scatter plot', description: 'Explore the relationship between two numeric fields.' },
  { name: 'Table', description: 'Inspect your source data in a structured view.' },
]

function VisualizationSelectionPage({ onBack, onSelectTable, onSelectMetric }) {
  const [selectedType, setSelectedType] = useState(null)

  return (
    <main className="cw-visualization-page">
      <div className="cw-page-heading">
        <p className="cw-eyebrow">Dashboard editor</p>
        <h1>Choose a visualization</h1>
        <p>Select the format that best fits the question you want to answer.</p>
      </div>
      <section className="cw-visualization-grid" aria-label="Visualization types">
        {visualizationTypes.map((visualization) => (
          <button
            key={visualization.name}
            type="button"
            className={`cw-visualization-option${selectedType === visualization.name ? ' is-selected' : ''}`}
            onClick={() => {
              if (visualization.name === 'Table') {
                onSelectTable()
                return
              }
              if (visualization.name === 'Metric') {
                onSelectMetric()
                return
              }
              setSelectedType(visualization.name)
            }}
            aria-pressed={selectedType === visualization.name}
          >
            <span className="cw-visualization-option-name">{visualization.name}</span>
            <span className="cw-visualization-option-description">{visualization.description}</span>
          </button>
        ))}
      </section>
      <div className="cw-editor-actions">
        <button type="button" className="cw-back-button" onClick={onBack}>Back to dashboard</button>
        {selectedType && <span className="cw-selection-status">{selectedType} selected</span>}
      </div>
    </main>
  )
}

function Sparkline({ values }) {
  const validValues = values.filter((value) => Number.isFinite(value))
  if (validValues.length < 2) return <span className="cw-empty-trend">-</span>

  const min = Math.min(...validValues)
  const max = Math.max(...validValues)
  const span = max - min || 1
  const points = validValues.map((value, index) => {
    const x = (index / (validValues.length - 1)) * 96 + 2
    const y = 26 - ((value - min) / span) * 22
    return `${x},${y}`
  }).join(' ')

  return (
    <svg className="cw-sparkline" viewBox="0 0 100 30" role="img" aria-label="Trend sparkline">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function toIsoDate(value) {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw || !/^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/.test(raw)) return ''
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

const aggregateOperations = {
  sum: 'Sum',
  average: 'Average',
  min: 'Minimum',
  max: 'Maximum',
  count: 'Count',
}

function formatAggregate(value, operation) {
  if (operation === 'count') return value.toLocaleString()
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
}

function DateRangePicker({ dateFrom, dateTo, onChange, onClear }) {
  const [isOpen, setIsOpen] = useState(false)
  const [pickingEnd, setPickingEnd] = useState(false)
  const initialMonth = dateFrom ? new Date(`${dateFrom}T00:00:00`) : new Date()
  const [month, setMonth] = useState(() => new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1))

  const dates = []
  for (let offset = 0; offset < 2; offset += 1) {
    dates.push(new Date(month.getFullYear(), month.getMonth() + offset, 1))
  }

  function chooseDate(date) {
    if (!dateFrom || pickingEnd) {
      const [from, to] = dateFrom && date < dateFrom ? [date, dateFrom] : [dateFrom || date, date]
      onChange(from, to)
      setPickingEnd(false)
      setIsOpen(false)
      return
    }
    onChange(date, '')
    setPickingEnd(true)
  }

  function applyDays(days) {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - (days - 1))
    onChange(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10))
    setPickingEnd(false)
    setIsOpen(false)
  }

  return (
    <div className="cw-date-picker">
      <button type="button" className="cw-date-picker-trigger" onClick={() => setIsOpen((open) => !open)} aria-expanded={isOpen}>
        {dateFrom ? `${dateFrom}${dateTo ? ` to ${dateTo}` : ' - Select end date'}` : 'Select date range'}
      </button>
      {(dateFrom || dateTo) && <button type="button" className="cw-date-clear" onClick={onClear} aria-label="Clear date range">Clear</button>}
      {isOpen && (
        <div className="cw-date-picker-popover">
          <div className="cw-date-presets">
            <button type="button" onClick={() => applyDays(1)}>Today</button>
            <button type="button" onClick={() => applyDays(7)}>Last 7 days</button>
            <button type="button" onClick={() => applyDays(30)}>Last 30 days</button>
            <button type="button" onClick={() => applyDays(90)}>Last 90 days</button>
          </div>
          <div className="cw-calendar-toolbar">
            <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} aria-label="Previous month">&lt;</button>
            <span>{dates[0].toLocaleString('en-US', { month: 'long', year: 'numeric' })} - {dates[1].toLocaleString('en-US', { month: 'long', year: 'numeric' })}</span>
            <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} aria-label="Next month">&gt;</button>
          </div>
          <div className="cw-calendar-months">
            {dates.map((calendarMonth) => {
              const year = calendarMonth.getFullYear()
              const monthIndex = calendarMonth.getMonth()
              const firstDay = new Date(year, monthIndex, 1).getDay()
              const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
              return (
                <div key={`${year}-${monthIndex}`} className="cw-calendar-month">
                  <strong>{calendarMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' })}</strong>
                  <div className="cw-calendar-grid">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span key={day}>{day}</span>)}
                    {Array.from({ length: firstDay }, (_, index) => <i key={`blank-${index}`} />)}
                    {Array.from({ length: daysInMonth }, (_, index) => {
                      const day = index + 1
                      const iso = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                      const isSelected = iso === dateFrom || iso === dateTo
                      const isInRange = dateFrom && dateTo && iso > dateFrom && iso < dateTo
                      return <button type="button" key={iso} className={`${isSelected ? 'is-selected' : ''}${isInRange ? ' is-in-range' : ''}`} onClick={() => chooseDate(iso)}>{day}</button>
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function DataTable({ file, config, isPresenting, onEdit, onDelete }) {
  const [sortConfig, setSortConfig] = useState(null)
  const [dateRange, setDateRange] = useState({ from: '', to: '' })
  const numericValues = useMemo(() => {
    if (!config.metricColumn) return []
    return file.rows.map((row) => Number(row[config.metricColumn])).filter(Number.isFinite)
  }, [config.metricColumn, file.rows])
  const maxMetric = Math.max(...numericValues.map(Math.abs), 1)
  const rows = useMemo(() => {
    const filteredRows = config.dateColumn && dateRange.from
      ? file.rows.filter((row) => {
          const date = toIsoDate(row[config.dateColumn])
          return date && date >= dateRange.from && (!dateRange.to || date <= dateRange.to)
        })
      : file.rows
    if (!sortConfig) return filteredRows
    return [...filteredRows].sort((left, right) => {
      const leftValue = String(left[sortConfig.column] ?? '')
      const rightValue = String(right[sortConfig.column] ?? '')
      const comparison = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' })
      return sortConfig.direction === 'asc' ? comparison : -comparison
    })
  }, [file.rows, sortConfig])
  const aggregates = useMemo(() => (config.aggregates ?? []).map((aggregate) => {
    const values = rows.map((row) => Number(row[aggregate.column])).filter(Number.isFinite)
    if (aggregate.operation === 'count') return { ...aggregate, value: values.length }
    if (!values.length) return { ...aggregate, value: null }
    if (aggregate.operation === 'sum') return { ...aggregate, value: values.reduce((total, value) => total + value, 0) }
    if (aggregate.operation === 'average') return { ...aggregate, value: values.reduce((total, value) => total + value, 0) / values.length }
    if (aggregate.operation === 'min') return { ...aggregate, value: Math.min(...values) }
    return { ...aggregate, value: Math.max(...values) }
  }), [config.aggregates, rows])

  function handleSort(column) {
    setSortConfig((previous) => (
      previous?.column === column
        ? { column, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    ))
  }

  return (
    <section className="cw-table-card" aria-label="Table visualization">
      <div className="cw-table-card-header">
        <div>
          <p className="cw-eyebrow">Table visualization</p>
          <h2>CSV Data</h2>
        </div>
        <div className="cw-table-header-actions">
          {config.dateColumn && (
            <DateRangePicker
              dateFrom={dateRange.from}
              dateTo={dateRange.to}
              onChange={(from, to) => setDateRange({ from, to })}
              onClear={() => setDateRange({ from: '', to: '' })}
            />
          )}
          <span className="cw-table-count">{rows.length.toLocaleString()} rows</span>
          {!isPresenting && <button type="button" className="cw-table-action" onClick={onEdit}>Edit</button>}
          {!isPresenting && <button type="button" className="cw-table-action cw-table-action-delete" onClick={onDelete}>Delete</button>}
        </div>
      </div>
      <div className="cw-table-wrap">
        <table className="cw-data-table">
          <thead>
            <tr>
              {config.columns.map((column) => (
                <th key={column}>
                  <button type="button" className="cw-table-sort-button" onClick={() => handleSort(column)}>
                    {column}
                    {sortConfig?.column === column && <span>{sortConfig.direction === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </button>
                </th>
              ))}
              {config.display === 'sparkline' && <th>Trend</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {config.columns.map((column) => {
                  const value = row[column]
                  const number = Number(value)
                  const isMetric = column === config.metricColumn && Number.isFinite(number)
                  return (
                    <td key={column}>
                      <span>{String(value ?? '')}</span>
                      {config.display === 'bar' && isMetric && (
                        <span className="cw-value-bar" aria-hidden="true">
                          <i style={{ width: `${Math.min(100, (Math.abs(number) / maxMetric) * 100)}%` }} />
                        </span>
                      )}
                    </td>
                  )
                })}
                {config.display === 'sparkline' && (
                  <td className="cw-trend-cell">
                    <Sparkline values={file.rows.slice(Math.max(0, rowIndex - 7), rowIndex + 1).map((item) => Number(item[config.metricColumn]))} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {aggregates.length > 0 && (
        <div className="cw-table-aggregates" aria-label="Table aggregates">
          {aggregates.map((aggregate) => (
            <div key={`${aggregate.operation}-${aggregate.column}`} className="cw-aggregate-item">
              <span>{aggregateOperations[aggregate.operation]} of {aggregate.column}</span>
              <strong>{aggregate.value == null ? 'No data' : formatAggregate(aggregate.value, aggregate.operation)}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function TableConfigurationPage({ file, initialConfig, workspaces, activeWorkspaceId, onBack, onAdd }) {
  const [selectedColumns, setSelectedColumns] = useState(() => initialConfig?.columns ?? file.columns.slice(0, Math.min(4, file.columns.length)))
  const numericColumns = useMemo(() => file.columns.filter((column) => (
    file.rows.some((row) => Number.isFinite(Number(row[column])))
  )), [file.columns, file.rows])
  const dateColumns = useMemo(() => file.columns.filter((column) => (
    file.rows.some((row) => toIsoDate(row[column]))
  )), [file.columns, file.rows])
  const [metricColumn, setMetricColumn] = useState(() => initialConfig?.metricColumn ?? numericColumns[0] ?? '')
  const [dateColumn, setDateColumn] = useState(() => initialConfig?.dateColumn ?? dateColumns[0] ?? '')
  const [display, setDisplay] = useState(() => initialConfig?.display ?? 'none')
  const [aggregates, setAggregates] = useState(() => initialConfig?.aggregates ?? [])
  const [workspaceId, setWorkspaceId] = useState(() => initialConfig?.workspaceId ?? activeWorkspaceId)

  function toggleColumn(column) {
    setSelectedColumns((current) => (
      current.includes(column) ? current.filter((item) => item !== column) : [...current, column]
    ))
  }

  function addAggregate() {
    if (!numericColumns.length) return
    setAggregates((current) => [...current, { column: numericColumns[0], operation: 'sum' }])
  }

  function updateAggregate(index, key, value) {
    setAggregates((current) => current.map((aggregate, aggregateIndex) => (
      aggregateIndex === index ? { ...aggregate, [key]: value } : aggregate
    )))
  }

  return (
    <main className="cw-table-editor">
      <div className="cw-page-heading">
        <p className="cw-eyebrow">Add visualization / Table</p>
        <h1>Configure your table</h1>
        <p>Choose the CSV fields to display, then optionally emphasize a numeric field.</p>
      </div>
      <div className="cw-table-editor-layout">
        <section className="cw-table-editor-panel">
          <div className="cw-editor-panel-heading">
            <h2>Display columns</h2>
            <button type="button" className="cw-text-button" onClick={() => setSelectedColumns(file.columns)}>Select all</button>
          </div>
          <div className="cw-column-list">
            {file.columns.map((column) => (
              <label key={column} className="cw-column-option">
                <input type="checkbox" checked={selectedColumns.includes(column)} onChange={() => toggleColumn(column)} />
                <span>{column}</span>
              </label>
            ))}
          </div>
        </section>
        <section className="cw-table-editor-panel">
          <label className="cw-select-field">
            <span>Dashboard workspace</span>
            <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </select>
          </label>
          <h2>Numeric display</h2>
          <p className="cw-panel-description">Add a visual treatment to one numeric data field.</p>
          <label className="cw-select-field">
            <span>Numeric field</span>
            <select value={metricColumn} onChange={(event) => setMetricColumn(event.target.value)} disabled={!numericColumns.length}>
              {!numericColumns.length && <option>No numeric fields found</option>}
              {numericColumns.map((column) => <option key={column} value={column}>{column}</option>)}
            </select>
          </label>
          <div className="cw-display-options" role="group" aria-label="Numeric display type">
            {['none', 'bar', 'sparkline'].map((option) => (
              <button
                key={option}
                type="button"
                className={`cw-display-option${display === option ? ' is-selected' : ''}`}
                onClick={() => setDisplay(option)}
                aria-pressed={display === option}
              >
                {option === 'none' ? 'None' : option === 'bar' ? 'Bar' : 'Sparkline'}
              </button>
            ))}
          </div>
          <label className="cw-select-field cw-date-column-field">
            <span>Date field</span>
            <select value={dateColumn} onChange={(event) => setDateColumn(event.target.value)}>
              <option value="">No date filter</option>
              {dateColumns.map((column) => <option key={column} value={column}>{column}</option>)}
            </select>
          </label>
          <div className="cw-aggregate-editor">
            <div className="cw-editor-panel-heading">
              <div>
                <h2>Aggregates</h2>
                <p className="cw-panel-description">Add summary calculations for numeric data points.</p>
              </div>
              <button type="button" className="cw-text-button" onClick={addAggregate} disabled={!numericColumns.length}>Add aggregate</button>
            </div>
            {aggregates.length > 0 && (
              <div className="cw-aggregate-list">
                {aggregates.map((aggregate, index) => (
                  <div key={`${aggregate.column}-${aggregate.operation}-${index}`} className="cw-aggregate-config">
                    <select value={aggregate.operation} onChange={(event) => updateAggregate(index, 'operation', event.target.value)} aria-label={`Aggregate ${index + 1} calculation`}>
                      {Object.entries(aggregateOperations).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <select value={aggregate.column} onChange={(event) => updateAggregate(index, 'column', event.target.value)} aria-label={`Aggregate ${index + 1} field`}>
                      {numericColumns.map((column) => <option key={column} value={column}>{column}</option>)}
                    </select>
                    <button type="button" className="cw-remove-aggregate" onClick={() => setAggregates((current) => current.filter((_, aggregateIndex) => aggregateIndex !== index))} aria-label={`Remove aggregate ${index + 1}`}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
      <div className="cw-editor-actions">
        <button type="button" className="cw-back-button" onClick={onBack}>Back</button>
        <button
          type="button"
          className="cw-add-table-button"
          disabled={!selectedColumns.length}
          onClick={() => onAdd({ columns: selectedColumns, metricColumn, dateColumn, display, aggregates, workspaceId })}
        >
          {initialConfig ? 'Save table' : 'Add table'}
        </button>
      </div>
    </main>
  )
}

function MetricCard({ file, config, isPresenting, onEdit, onDelete }) {
  const value = file.rows.filter((row) => String(row[config.countColumn] ?? '').trim() !== '').length

  return (
    <section className="cw-metric-card" aria-label={`${config.label} metric`}>
      <div className="cw-metric-card-actions">
        {!isPresenting && <button type="button" className="cw-table-action" onClick={onEdit}>Edit</button>}
        {!isPresenting && <button type="button" className="cw-table-action cw-table-action-delete" onClick={onDelete}>Delete</button>}
      </div>
      <div className="cw-metric-value">{value.toLocaleString()}</div>
      <div className="cw-metric-label">{config.label}</div>
      <div className="cw-metric-source">Count of {config.countColumn}</div>
    </section>
  )
}

function MetricConfigurationPage({ file, initialConfig, workspaces, activeWorkspaceId, onBack, onAdd }) {
  const [countColumn, setCountColumn] = useState(() => initialConfig?.countColumn ?? file.columns[0] ?? '')
  const [label, setLabel] = useState(() => initialConfig?.label ?? '')
  const [workspaceId, setWorkspaceId] = useState(() => initialConfig?.workspaceId ?? activeWorkspaceId)

  return (
    <main className="cw-metric-editor">
      <div className="cw-page-heading">
        <p className="cw-eyebrow">Add visualization / Metric</p>
        <h1>Configure your metric</h1>
        <p>Choose the CSV field to count and give the metric a dashboard label.</p>
      </div>
      <section className="cw-metric-editor-panel">
        <label className="cw-select-field">
          <span>Dashboard workspace</span>
          <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
            {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select>
        </label>
        <label className="cw-select-field">
          <span>Data point to count</span>
          <select value={countColumn} onChange={(event) => setCountColumn(event.target.value)}>
            {file.columns.map((column) => <option key={column} value={column}>{column}</option>)}
          </select>
        </label>
        <label className="cw-metric-label-field">
          <span>Metric label</span>
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={`Count of ${countColumn}`} />
        </label>
      </section>
      <div className="cw-editor-actions">
        <button type="button" className="cw-back-button" onClick={onBack}>Back</button>
        <button
          type="button"
          className="cw-add-table-button"
          disabled={!countColumn}
          onClick={() => onAdd({ countColumn, label: label.trim() || `Count of ${countColumn}`, workspaceId })}
        >
          {initialConfig ? 'Save metric' : 'Add metric'}
        </button>
      </div>
    </main>
  )
}

function DashboardShell({ file, onReset }) {
  const [view, setView] = useState('dashboard')
  const [workspaces, setWorkspaces] = useState(() => (
    loadPersistedDashboard()?.workspaces ?? [{
      id: 'workspace-1',
      name: 'My Dashboard',
      visualizations: [],
    }]
  ))
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => loadPersistedDashboard()?.activeWorkspaceId ?? 'workspace-1')
  const [isWorkspaceDialogOpen, setIsWorkspaceDialogOpen] = useState(false)
  const [workspaceDraft, setWorkspaceDraft] = useState({
    name: '',
    customerLogo: '',
    programManager: '',
    teamMembers: '',
  })
  const [editingVisualizationId, setEditingVisualizationId] = useState(null)
  const [gridInteraction, setGridInteraction] = useState(null)
  const [isPresenting, setIsPresenting] = useState(false)
  const workspaceGridRef = useRef(null)
  const gridItemRefs = useRef(new Map())
  const pendingGridLayoutRef = useRef(null)
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0]
  const editingVisualization = workspaces
    .flatMap((workspace) => workspace.visualizations)
    .find((visualization) => visualization.id === editingVisualizationId)

  useEffect(() => {
    function handleFullscreenChange() {
      if (!document.fullscreenElement) setIsPresenting(false)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(dashboardStorageKey, JSON.stringify({
        file,
        workspaces,
        activeWorkspaceId,
      }))
    } catch {}
  }, [activeWorkspaceId, file, workspaces])

  useEffect(() => {
    if (!activeWorkspace?.customerLogo) return
    setWorkspaces((current) => current.map((workspace) => (
      workspace.id !== activeWorkspaceId
        ? workspace
        : {
            ...workspace,
            visualizations: workspace.visualizations.map((visualization) => (
              (visualization.gridY ?? 0) < logoReservedGridRows
                ? { ...visualization, gridY: (visualization.gridY ?? 0) + logoReservedGridRows }
                : visualization
            )),
          }
    )))
  }, [activeWorkspace?.customerLogo, activeWorkspaceId])

  function enterPresentation() {
    setIsPresenting(true)
    const fullscreenRequest = document.documentElement.requestFullscreen?.()
    fullscreenRequest?.catch(() => {})
  }

  function exitPresentation() {
    setIsPresenting(false)
    if (document.fullscreenElement) document.exitFullscreen()
  }

  function createWorkspace(event) {
    event.preventDefault()
    const name = workspaceDraft.name.trim()
    if (!name) return
    const id = `workspace-${Date.now()}`
    const teamMembers = workspaceDraft.teamMembers
      .split(/[\n,]/)
      .map((member) => member.trim())
      .filter(Boolean)
    setWorkspaces((current) => [...current, {
      id,
      name,
      customerLogo: workspaceDraft.customerLogo,
      programManager: workspaceDraft.programManager.trim(),
      teamMembers,
      visualizations: [],
    }])
    setActiveWorkspaceId(id)
    setWorkspaceDraft({ name: '', customerLogo: '', programManager: '', teamMembers: '' })
    setIsWorkspaceDialogOpen(false)
  }

  function saveVisualization(config, type = 'table') {
    const visualization = {
      ...config,
      id: editingVisualizationId ?? `${type}-${Date.now()}`,
      type,
    }
    setWorkspaces((current) => current.map((workspace) => {
      const withoutEditedVisualization = workspace.visualizations.filter((item) => item.id !== visualization.id)
      const existingLayout = editingVisualization && {
        gridX: editingVisualization.gridX,
        gridY: editingVisualization.gridY,
        gridWidth: editingVisualization.gridWidth,
        gridHeight: editingVisualization.gridHeight,
      }
      const defaultLayout = {
        gridX: 0,
        gridY: Math.max(
          workspace.customerLogo ? logoReservedGridRows : 0,
          ...workspace.visualizations.map((item) => (item.gridY ?? 0) + (item.gridHeight ?? 64)),
        ),
        gridWidth: type === 'metric' ? 32 : 96,
        gridHeight: type === 'metric' ? 32 : 64,
      }
      const layout = existingLayout ?? defaultLayout
      return workspace.id === config.workspaceId
        ? { ...workspace, visualizations: [...withoutEditedVisualization, { ...visualization, ...layout }] }
        : { ...workspace, visualizations: withoutEditedVisualization }
    }))
    setActiveWorkspaceId(config.workspaceId)
    setEditingVisualizationId(null)
    setView('dashboard')
  }

  function deleteVisualization(id) {
    setWorkspaces((current) => current.map((workspace) => (
      workspace.id === activeWorkspaceId
        ? { ...workspace, visualizations: workspace.visualizations.filter((visualization) => visualization.id !== id) }
        : workspace
    )))
  }

  function updateVisualizationLayout(id, layout) {
    setWorkspaces((current) => current.map((workspace) => (
      workspace.id === activeWorkspaceId
        ? {
            ...workspace,
            visualizations: workspace.visualizations.map((visualization) => (
              visualization.id === id ? { ...visualization, ...layout } : visualization
            )),
          }
        : workspace
    )))
  }

  function beginGridInteraction(event, visualization, mode) {
    const grid = workspaceGridRef.current
    if (!grid) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const rect = grid.getBoundingClientRect()
    pendingGridLayoutRef.current = null
    setGridInteraction({
      id: visualization.id,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      gridWidth: rect.width / 96,
      gridHeight: 8,
      original: {
        gridX: visualization.gridX ?? 0,
        gridY: visualization.gridY ?? 0,
        gridWidth: visualization.gridWidth ?? 96,
        gridHeight: visualization.gridHeight ?? 64,
      },
    })
  }

  function handleGridPointerMove(event) {
    if (!gridInteraction || event.pointerId !== gridInteraction.pointerId) return
    const deltaX = Math.round((event.clientX - gridInteraction.startX) / gridInteraction.gridWidth)
    const deltaY = Math.round((event.clientY - gridInteraction.startY) / gridInteraction.gridHeight)
    const { original } = gridInteraction

    const layout = gridInteraction.mode === 'move'
      ? {
        ...original,
        gridX: Math.max(0, Math.min(96 - original.gridWidth, original.gridX + deltaX)),
        gridY: Math.max(activeWorkspace.customerLogo ? logoReservedGridRows : 0, original.gridY + deltaY),
      }
      : {
        ...original,
        gridWidth: Math.max(24, Math.min(96 - original.gridX, original.gridWidth + deltaX)),
        gridHeight: Math.max(24, original.gridHeight + deltaY),
      }

    const gridItem = gridItemRefs.current.get(gridInteraction.id)
    if (gridItem) {
      gridItem.style.gridColumn = `${layout.gridX + 1} / span ${layout.gridWidth}`
      gridItem.style.gridRow = `${layout.gridY + 1} / span ${layout.gridHeight}`
    }
    pendingGridLayoutRef.current = { id: gridInteraction.id, layout }
  }

  function endGridInteraction(event) {
    if (!gridInteraction || event.pointerId !== gridInteraction.pointerId) return
    const pendingLayout = pendingGridLayoutRef.current
    if (pendingLayout?.id === gridInteraction.id) {
      updateVisualizationLayout(pendingLayout.id, pendingLayout.layout)
    }
    pendingGridLayoutRef.current = null
    setGridInteraction(null)
  }

  return (
    <div className={`cw-app${isPresenting ? ' is-presenting' : ''}`}>
      {!isPresenting && <header className="cw-nav">
        <div className="cw-nav-left">
          <span className="cw-brand-radar">RADAR</span>
          <span className="cw-brand-sep"> | Continuous Wave</span>
        </div>
        <div className="cw-nav-center" aria-label="Continuous Wave dashboard">CONTINUOUS WAVE</div>
        <div className="cw-nav-right">
          <span className="cw-nav-file" title={file.name}>{file.name}</span>
          <label className="cw-workspace-switcher">
            <span>Workspace</span>
            <select value={activeWorkspaceId} onChange={(event) => setActiveWorkspaceId(event.target.value)}>
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </select>
          </label>
          <button type="button" className="cw-nav-edit" onClick={() => setView('select')}>Add visualization</button>
          <button type="button" className="cw-nav-present" onClick={enterPresentation}>Present</button>
          <button type="button" className="cw-nav-reset" onClick={onReset}>New CSV</button>
        </div>
      </header>}
      {view === 'select' ? (
        <VisualizationSelectionPage
          onBack={() => setView('dashboard')}
          onSelectTable={() => {
            setEditingVisualizationId(null)
            setView('table-config')
          }}
          onSelectMetric={() => {
            setEditingVisualizationId(null)
            setView('metric-config')
          }}
        />
      ) : view === 'table-config' ? (
        <TableConfigurationPage
          file={file}
          initialConfig={editingVisualization}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onBack={() => setView('select')}
          onAdd={saveVisualization}
        />
      ) : view === 'metric-config' ? (
        <MetricConfigurationPage
          file={file}
          initialConfig={editingVisualization}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onBack={() => setView('select')}
          onAdd={(config) => saveVisualization(config, 'metric')}
        />
      ) : (
        <main className="cw-dashboard-placeholder">
          {!isPresenting && <div className="cw-dashboard-content">
            <div className="cw-workspace-summary">
              <div className="cw-workspace-identity">
                {activeWorkspace.customerLogo && <img src={customerLogoUrl(activeWorkspace.customerLogo)} alt="" className="cw-workspace-logo" />}
                <div className="cw-placeholder-heading">
                  <p className="cw-eyebrow">CSV loaded / Workspace</p>
                  <h1>{activeWorkspace.name}</h1>
                  <p>Add visualizations to this workspace, or create another dashboard for a different view of the same CSV.</p>
                </div>
              </div>
              <button type="button" className="cw-new-workspace-button" onClick={() => setIsWorkspaceDialogOpen(true)}>New workspace</button>
            </div>
            {(activeWorkspace.programManager || activeWorkspace.teamMembers?.length > 0) && (
              <div className="cw-workspace-team">
                {activeWorkspace.programManager && <span><b>Program manager</b>{activeWorkspace.programManager}</span>}
                {activeWorkspace.teamMembers?.length > 0 && <span><b>Engineering team</b>{activeWorkspace.teamMembers.join(', ')}</span>}
              </div>
            )}
          <section className="cw-data-summary" aria-label="Imported CSV summary">
            <div>
              <span>Rows</span>
              <strong>{file.rows.length.toLocaleString()}</strong>
            </div>
            <div>
              <span>Columns</span>
              <strong>{file.columns.length.toLocaleString()}</strong>
            </div>
            <div className="cw-columns">
              <span>Available fields</span>
              <strong>{file.columns.join(', ')}</strong>
            </div>
          </section>
          {activeWorkspace.visualizations.length === 0 && (
            <p className="cw-empty-workspace">This workspace has no visualizations yet. Select Add visualization to add one.</p>
          )}
          </div>}
          {isWorkspaceDialogOpen && (
            <div className="cw-dialog-backdrop" role="presentation" onMouseDown={() => setIsWorkspaceDialogOpen(false)}>
              <form className="cw-workspace-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-dialog-title" onSubmit={createWorkspace} onMouseDown={(event) => event.stopPropagation()}>
                <div className="cw-dialog-heading">
                  <div>
                    <p className="cw-eyebrow">New workspace</p>
                    <h2 id="workspace-dialog-title">Workspace details</h2>
                  </div>
                  <button type="button" className="cw-dialog-close" onClick={() => setIsWorkspaceDialogOpen(false)} aria-label="Close workspace dialog">Close</button>
                </div>
                <label className="cw-dialog-field">
                  <span>Workspace name</span>
                  <input autoFocus value={workspaceDraft.name} onChange={(event) => setWorkspaceDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Dashboard name" />
                </label>
                <fieldset className="cw-logo-picker">
                  <legend>Customer logo</legend>
                  <div className="cw-logo-options">
                    {customerLogos.map((logo) => (
                      <button
                        key={logo.file}
                        type="button"
                        className={`cw-logo-option${workspaceDraft.customerLogo === logo.file ? ' is-selected' : ''}`}
                        onClick={() => setWorkspaceDraft((draft) => ({ ...draft, customerLogo: logo.file }))}
                        aria-pressed={workspaceDraft.customerLogo === logo.file}
                      >
                        <img src={customerLogoUrl(logo.file)} alt={logo.label} />
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label className="cw-dialog-field">
                  <span>Program manager</span>
                  <input value={workspaceDraft.programManager} onChange={(event) => setWorkspaceDraft((draft) => ({ ...draft, programManager: event.target.value }))} placeholder="Name" />
                </label>
                <label className="cw-dialog-field">
                  <span>Engineering team</span>
                  <textarea value={workspaceDraft.teamMembers} onChange={(event) => setWorkspaceDraft((draft) => ({ ...draft, teamMembers: event.target.value }))} placeholder="One engineer per line" rows="4" />
                </label>
                <div className="cw-dialog-actions">
                  <button type="button" className="cw-back-button" onClick={() => setIsWorkspaceDialogOpen(false)}>Cancel</button>
                  <button type="submit" className="cw-add-table-button" disabled={!workspaceDraft.name.trim()}>Create workspace</button>
                </div>
              </form>
            </div>
          )}
          {activeWorkspace.visualizations.length > 0 && (
            <div
              ref={workspaceGridRef}
              className={`cw-workspace-grid${gridInteraction ? ' is-editing-layout' : ''}`}
              onPointerMove={handleGridPointerMove}
              onPointerUp={endGridInteraction}
              onPointerCancel={endGridInteraction}
            >
              {!isPresenting && activeWorkspace.customerLogo && (
                <img src={customerLogoUrl(activeWorkspace.customerLogo)} alt="" className="cw-grid-customer-logo" />
              )}
              {activeWorkspace.visualizations.map((visualization) => (
                <div
                  key={visualization.id}
                  ref={(node) => {
                    if (node) gridItemRefs.current.set(visualization.id, node)
                    else gridItemRefs.current.delete(visualization.id)
                  }}
                  className="cw-grid-item"
                  style={{
                    gridColumn: `${(visualization.gridX ?? 0) + 1} / span ${visualization.gridWidth ?? 96}`,
                    gridRow: `${(visualization.gridY ?? 0) + 1} / span ${visualization.gridHeight ?? 64}`,
                  }}
                >
                  {!isPresenting && (
                    <div
                      className="cw-grid-drag-handle"
                      onPointerDown={(event) => beginGridInteraction(event, visualization, 'move')}
                      title="Drag to move"
                    >
                      Drag to move
                    </div>
                  )}
                  {visualization.type === 'metric' ? (
                    <MetricCard
                      file={file}
                      config={visualization}
                      isPresenting={isPresenting}
                      onEdit={() => {
                        setEditingVisualizationId(visualization.id)
                        setView('metric-config')
                      }}
                      onDelete={() => deleteVisualization(visualization.id)}
                    />
                  ) : (
                    <DataTable
                      file={file}
                      config={visualization}
                      isPresenting={isPresenting}
                      onEdit={() => {
                        setEditingVisualizationId(visualization.id)
                        setView('table-config')
                      }}
                      onDelete={() => deleteVisualization(visualization.id)}
                    />
                  )}
                  {!isPresenting && (
                    <button
                      type="button"
                      className="cw-grid-resize-handle"
                      onPointerDown={(event) => beginGridInteraction(event, visualization, 'resize')}
                      aria-label="Resize visualization"
                      title="Drag to resize"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          {isPresenting && (activeWorkspace.customerLogo || activeWorkspace.programManager || activeWorkspace.teamMembers?.length > 0) && (
            <div className="cw-presentation-workspace-info">
              {activeWorkspace.customerLogo && <img src={customerLogoUrl(activeWorkspace.customerLogo)} alt="" className="cw-presentation-logo" />}
              {(activeWorkspace.programManager || activeWorkspace.teamMembers?.length > 0) && (
                <div className="cw-presentation-team">
                  {activeWorkspace.programManager && <span><b>Program manager</b>{activeWorkspace.programManager}</span>}
                  {activeWorkspace.teamMembers?.length > 0 && <span><b>Engineering team</b>{activeWorkspace.teamMembers.join(', ')}</span>}
                </div>
              )}
            </div>
          )}
          {isPresenting && <button type="button" className="cw-exit-presentation" onClick={exitPresentation}>Exit presentation</button>}
        </main>
      )}
    </div>
  )
}

function App() {
  const [file, setFile] = useState(() => loadPersistedDashboard()?.file ?? null)

  function handleData(data) {
    window.localStorage.removeItem(dashboardStorageKey)
    setFile(data)
  }

  function handleReset() {
    window.localStorage.removeItem(dashboardStorageKey)
    setFile(null)
  }

  return file
    ? <DashboardShell file={file} onReset={handleReset} />
    : <CsvSelectionPage onData={handleData} />
}

export default App
