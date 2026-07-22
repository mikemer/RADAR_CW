import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Papa from 'papaparse'
import './App.css'

const dashboardStorageKey = 'radar-cw:dashboard:v1'
const dashboardFileStorageKey = `${dashboardStorageKey}:file`
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

function layoutsOverlap(first, second) {
  return first.gridX < second.gridX + second.gridWidth
    && first.gridX + first.gridWidth > second.gridX
    && first.gridY < second.gridY + second.gridHeight
    && first.gridY + first.gridHeight > second.gridY
}

function isGroupingShape(visualization) {
  return visualization.type === 'line' || visualization.type === 'rectangle'
}

function hasWorkspaceIdentity(workspace) {
  return Boolean(workspace.customerLogo || workspace.programManager || workspace.teamMembers?.length)
}

function getColumnByNormalizedName(columns, name) {
  return columns.find((column) => String(column).replace(/[^a-z0-9]/gi, '').toLowerCase() === name)
}

function normalizeComparableValue(value) {
  return String(value ?? '').trim().toLowerCase()
}

function getRowColumnValue(row, preferredColumn, matchesColumn) {
  if (preferredColumn && preferredColumn in row) return row[preferredColumn]
  const matchingKey = Object.keys(row).find((column) => matchesColumn(String(column).replace(/[^a-z0-9]/gi, '').toLowerCase()))
  return matchingKey ? row[matchingKey] : undefined
}

function getSeverityLevel(value) {
  const numericValue = Number(value)
  if (Number.isInteger(numericValue)) return numericValue
  const matchedSeverity = String(value ?? '').match(/(?:^|\D)([1-4])(?:\D|$)/)
  return matchedSeverity ? Number(matchedSeverity[1]) : null
}

function getSeverityIdColumn(columns) {
  return getColumnByNormalizedName(columns, 'severityid')
    ?? columns.find((column) => String(column).replace(/[^a-z0-9]/gi, '').toLowerCase().includes('severityid'))
    ?? columns.find((column) => String(column).replace(/[^a-z0-9]/gi, '').toLowerCase().startsWith('severity'))
}

function getHighImpactingWorkUnitColumns(columns) {
  const title = getColumnByNormalizedName(columns, 'title')
  const severity = getSeverityIdColumn(columns)
  return [title, severity].filter(Boolean)
}

function getTenantColumn(columns) {
  return columns.find((column) => {
    const normalized = String(column).replace(/[^a-z0-9]/gi, '').toLowerCase()
    return normalized === 'tenant' || normalized === 'tenantname' || normalized === 'tenantid'
  })
}

function normalizeWorkspaceLayouts(workspace) {
  const occupiedLayouts = hasWorkspaceIdentity(workspace)
    ? [{ gridX: 0, gridY: 0, gridWidth: 32, gridHeight: 40 }]
    : []
  let changed = false
  const visualizations = workspace.visualizations.map((visualization) => {
    if (isGroupingShape(visualization)) return visualization
    const layout = {
      gridX: visualization.gridX ?? 0,
      gridY: visualization.gridY ?? 0,
      gridWidth: visualization.gridWidth ?? 96,
      gridHeight: visualization.gridHeight ?? 64,
    }
    while (occupiedLayouts.some((occupiedLayout) => layoutsOverlap(layout, occupiedLayout))) {
      layout.gridY = Math.max(...occupiedLayouts
        .filter((occupiedLayout) => layoutsOverlap(layout, occupiedLayout))
        .map((occupiedLayout) => occupiedLayout.gridY + occupiedLayout.gridHeight))
    }
    occupiedLayouts.push(layout)
    const layoutChanged = layout.gridX !== visualization.gridX
      || layout.gridY !== visualization.gridY
      || layout.gridWidth !== visualization.gridWidth
      || layout.gridHeight !== visualization.gridHeight
    changed ||= layoutChanged
    return layoutChanged ? { ...visualization, ...layout } : visualization
  })
  return changed ? { ...workspace, visualizations } : workspace
}

function getDashboardKey(file) {
  return JSON.stringify({ name: file.name, columns: file.columns })
}

function loadSessionFile() {
  if (typeof window === 'undefined') return null
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(dashboardFileStorageKey))
    if (!stored?.name || !Array.isArray(stored.rows) || !Array.isArray(stored.columns)) return null
    return stored
  } catch {
    return null
  }
}

function saveSessionFile(file) {
  try {
    window.sessionStorage.setItem(dashboardFileStorageKey, JSON.stringify(file))
  } catch {}
}

function clearSessionFile() {
  try {
    window.sessionStorage.removeItem(dashboardFileStorageKey)
  } catch {}
}

function loadPersistedDashboard(file) {
  if (typeof window === 'undefined') return null
  try {
    const stored = JSON.parse(window.localStorage.getItem(dashboardStorageKey))
    if (!stored?.fileKey || !file || stored.fileKey !== getDashboardKey(file)) return null
    const workspaces = Array.isArray(stored.workspaces)
      ? stored.workspaces
        .filter((workspace) => workspace?.id && workspace?.name)
        .map((workspace) => ({ ...workspace, visualizations: Array.isArray(workspace.visualizations) ? workspace.visualizations : [] }))
      : []
    if (!workspaces.length) return null
    const activeWorkspaceId = workspaces.some((workspace) => workspace.id === stored.activeWorkspaceId)
      ? stored.activeWorkspaceId
      : workspaces[0].id
    return { workspaces, activeWorkspaceId }
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
  { name: 'Label', description: 'Place formatted text anywhere on the dashboard.' },
  { name: 'Date Label', description: 'Display a date in MM-DD-YYYY format.' },
  { name: 'Metric', description: 'Choose a metric format for a CSV data field.' },
  { name: 'Line', description: 'Draw a divider or guide across a dashboard group.' },
  { name: 'Rectangle', description: 'Frame related visualizations as a dashboard group.' },
  { name: 'Line chart', description: 'Track change and trends across a continuous range.' },
  { name: 'Bar chart', description: 'Compare values across discrete categories.' },
  { name: 'Scatter plot', description: 'Explore the relationship between two numeric fields.' },
  { name: 'Table', description: 'Inspect your source data in a structured view.' },
]

function VisualizationSelectionPage({ onBack, onSelectTable, onSelectMetric, onSelectBarChart, onSelectLabel, onSelectDateLabel, onSelectShape }) {
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
              if (visualization.name === 'Label') {
                onSelectLabel()
                return
              }
              if (visualization.name === 'Date Label') {
                onSelectDateLabel()
                return
              }
              if (visualization.name === 'Table') {
                onSelectTable()
                return
              }
              if (visualization.name === 'Metric') {
                onSelectMetric()
                return
              }
              if (visualization.name === 'Bar chart') {
                onSelectBarChart()
                return
              }
              if (visualization.name === 'Line' || visualization.name === 'Rectangle') {
                onSelectShape(visualization.name.toLowerCase())
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

function MetricSelectionPage({ onBack, onSelectMetric, onSelectSeverityMetric }) {
  const metricTypes = [
    { name: 'Metric', description: 'Show a labeled count for a selected CSV data field.', onSelect: onSelectMetric },
    { name: 'Severity Metric', description: 'Count SeverityID values from 1 through 4.', onSelect: onSelectSeverityMetric },
  ]

  return (
    <main className="cw-visualization-page">
      <div className="cw-page-heading">
        <p className="cw-eyebrow">Add visualization / Metric</p>
        <h1>Choose a metric type</h1>
        <p>Select the metric that best matches the information you want to count.</p>
      </div>
      <section className="cw-visualization-grid" aria-label="Metric types">
        {metricTypes.map((metric) => (
          <button key={metric.name} type="button" className="cw-visualization-option" onClick={metric.onSelect}>
            <span className="cw-visualization-option-name">{metric.name}</span>
            <span className="cw-visualization-option-description">{metric.description}</span>
          </button>
        ))}
      </section>
      <div className="cw-editor-actions">
        <button type="button" className="cw-back-button" onClick={onBack}>Back to visualizations</button>
      </div>
    </main>
  )
}

function BarChartSelectionPage({ onBack, onSelectWeeklyWuCount }) {
  return (
    <main className="cw-visualization-page">
      <div className="cw-page-heading">
        <p className="cw-eyebrow">Add visualization / Bar Chart</p>
        <h1>Choose a bar chart type</h1>
        <p>Select the comparison you want to add to the dashboard.</p>
      </div>
      <section className="cw-visualization-grid" aria-label="Bar chart types">
        <button type="button" className="cw-visualization-option" onClick={onSelectWeeklyWuCount}>
          <span className="cw-visualization-option-name">Weekly Work Unit Counts</span>
          <span className="cw-visualization-option-description">Count WorkUnits by week for the selected tenant.</span>
        </button>
      </section>
      <div className="cw-editor-actions">
        <button type="button" className="cw-back-button" onClick={onBack}>Back to visualizations</button>
      </div>
    </main>
  )
}

function TableSelectionPage({ onBack, onSelectTable, onSelectHighImpactingWorkUnits }) {
  const tableTypes = [
    { name: 'Table', description: 'Inspect and configure your CSV data in a structured view.', onSelect: onSelectTable },
    { name: 'Top 3 Alerts', description: 'Show the top three Severity 1 and 2 WorkUnits for a selected tenant.', onSelect: onSelectHighImpactingWorkUnits },
  ]

  return (
    <main className="cw-visualization-page">
      <div className="cw-page-heading">
        <p className="cw-eyebrow">Add visualization / Table</p>
        <h1>Choose a table type</h1>
        <p>Select the table view that best fits the work you need to review.</p>
      </div>
      <section className="cw-visualization-grid" aria-label="Table types">
        {tableTypes.map((table) => (
          <button key={table.name} type="button" className="cw-visualization-option" onClick={table.onSelect}>
            <span className="cw-visualization-option-name">{table.name}</span>
            <span className="cw-visualization-option-description">{table.description}</span>
          </button>
        ))}
      </section>
      <div className="cw-editor-actions">
        <button type="button" className="cw-back-button" onClick={onBack}>Back to visualizations</button>
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

function getTodayIsoDate() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDateLabel(value) {
  const isoDate = toIsoDate(value)
  if (!isoDate) return 'No date selected'
  const [year, month, day] = isoDate.split('-')
  return `${month}-${day}-${year}`
}

function formatCompactDateLabel(value) {
  const isoDate = toIsoDate(value)
  if (!isoDate) return ''
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getWeekStartIsoDate(value) {
  const isoDate = toIsoDate(value)
  if (!isoDate) return ''
  const date = new Date(`${isoDate}T00:00:00`)
  const daysSinceMonday = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - daysSinceMonday)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDateColumn(file) {
  return file.columns.find((column) => file.rows.some((row) => toIsoDate(row[column])))
}

function rowMatchesDateRange(row, dateColumn, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true
  const date = toIsoDate(row[dateColumn])
  return Boolean(date) && (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo)
}

function WeeklyWuCountBarChart({ file, config, dateFrom, dateTo }) {
  const tenantColumn = getTenantColumn(file.columns)
  const severityColumn = getSeverityIdColumn(file.columns)
  const titleColumn = getColumnByNormalizedName(file.columns, 'title')
  const [hoveredWeek, setHoveredWeek] = useState(null)
  const weeklyCounts = new Map()
  file.rows.forEach((row) => {
    const week = getWeekStartIsoDate(row[config.dateColumn])
    const tenant = getRowColumnValue(row, tenantColumn, (column) => column === 'tenant' || column === 'tenantname' || column === 'tenantid')
    if (!week || !rowMatchesDateRange(row, config.dateColumn, dateFrom, dateTo) || (config.tenant && normalizeComparableValue(tenant) !== normalizeComparableValue(config.tenant))) return
    const counts = weeklyCounts.get(week) ?? { total: 0, severities: [0, 0, 0, 0], titles: new Map() }
    counts.total += 1
    if (titleColumn) {
      const title = String(row[titleColumn] ?? '').trim() || 'Untitled alert'
      const titleKey = normalizeComparableValue(title)
      const existingTitle = counts.titles.get(titleKey)
      counts.titles.set(titleKey, { title: existingTitle?.title ?? title, count: (existingTitle?.count ?? 0) + 1 })
    }
    const severity = getSeverityLevel(getRowColumnValue(row, severityColumn, (column) => column.includes('severityid') || column.startsWith('severity')))
    if (severity >= 1 && severity <= 4) counts.severities[severity - 1] += 1
    weeklyCounts.set(week, counts)
  })
  const values = [...weeklyCounts.entries()].sort(([left], [right]) => left.localeCompare(right))
  const maxCount = Math.max(...values.flatMap(([, counts]) => [counts.total, ...counts.severities]), 1)
  const chartLabel = config.label === 'Daily WU Count' ? 'Weekly Work Unit Counts' : config.label ?? 'Weekly Work Unit Counts'
  const countFontSize = Math.max(8, Math.min(20, Number(config.countFontSize) || 12))
  const dateLabelFontSize = Math.max(8, Math.min(20, Number(config.dateLabelFontSize) || 9))
  const legendFontSize = Math.max(8, Math.min(20, Number(config.legendFontSize) || 9))
  const showAlertBreakdown = Boolean(config.showAlertBreakdown)
  const hoveredCounts = hoveredWeek ? weeklyCounts.get(hoveredWeek.week) : null
  const hoveredTitleCounts = hoveredCounts
    ? [...hoveredCounts.titles.values()].sort((left, right) => right.count - left.count || left.title.localeCompare(right.title)).slice(0, 10)
    : []

  function showBreakdown(event, week) {
    if (!showAlertBreakdown) return
    const barRect = event.currentTarget.getBoundingClientRect()
    const left = Math.max(12, Math.min(window.innerWidth - 12, barRect.left + (barRect.width / 2)))
    setHoveredWeek({
      week,
      left,
      top: barRect.top > 220 ? barRect.top - 8 : barRect.bottom + 8,
      placement: barRect.top > 220 ? 'above' : 'below',
    })
  }

  return (
    <>
      <section className="cw-daily-wu-chart" aria-label="Weekly Work Unit Counts bar chart">
        <header className="cw-daily-wu-chart-header">
          <span>{chartLabel}</span>
        </header>
        <div className="cw-daily-wu-chart-body">
          {values.length ? (
            <div className="cw-daily-wu-bars">
              {values.map(([week, counts]) => {
              return (
              <div
                key={week}
                className="cw-daily-wu-bar-item"
                title={`Week of ${formatDateLabel(week)}: ${counts.total} WorkUnits`}
                tabIndex={showAlertBreakdown ? 0 : undefined}
                onMouseEnter={(event) => showBreakdown(event, week)}
                onMouseLeave={() => showAlertBreakdown && setHoveredWeek(null)}
                onFocus={(event) => showBreakdown(event, week)}
                onBlur={() => showAlertBreakdown && setHoveredWeek(null)}
              >
                <strong style={{ fontSize: `${countFontSize}px` }}>{counts.total}</strong>
                <div className="cw-daily-wu-bar-series">
                  <i className="is-total" style={{ height: `${Math.max(4, (counts.total / maxCount) * 100)}%` }} />
                  {severityColumn && counts.severities.map((count, index) => (
                    <i key={index} className={`is-severity-${index + 1}`} style={{ height: `${Math.max(4, (count / maxCount) * 100)}%` }} />
                  ))}
                </div>
                <span style={{ fontSize: `${dateLabelFontSize}px` }}>{formatCompactDateLabel(week)}</span>
              </div>
              )
              })}
            </div>
          ) : <p className="cw-daily-wu-empty">No WorkUnits match this week field and tenant.</p>}
          {severityColumn && (
            <div className="cw-daily-wu-legend" aria-label="Severity legend" style={{ fontSize: `${legendFontSize}px` }}>
              <span className="is-total">Total</span>
              {[1, 2, 3, 4].map((severity) => <span key={severity} className={`is-severity-${severity}`}>Severity {severity}</span>)}
            </div>
          )}
        </div>
      </section>
      {hoveredWeek && createPortal(
        <div className={`cw-daily-wu-breakdown is-${hoveredWeek.placement}`} role="tooltip" style={{ left: `${hoveredWeek.left}px`, top: `${hoveredWeek.top}px` }}>
          <strong>Week of {formatDateLabel(hoveredWeek.week)}</strong>
          {titleColumn ? (
            <ul>
              {hoveredTitleCounts.map(({ title, count }) => <li key={title}><span>{title}</span><b>{count}</b></li>)}
            </ul>
          ) : <p>No Title column found.</p>}
        </div>,
        document.body,
      )}
    </>
  )
}

function WeeklyWuCountConfigurationPage({ file, initialConfig, workspaces, activeWorkspaceId, onBack, onAdd }) {
  const dateColumns = useMemo(() => file.columns.filter((column) => file.rows.some((row) => toIsoDate(row[column]))), [file.columns, file.rows])
  const [workspaceId, setWorkspaceId] = useState(() => initialConfig?.workspaceId ?? activeWorkspaceId)
  const [dateColumn, setDateColumn] = useState(() => initialConfig?.dateColumn ?? dateColumns[0] ?? '')
  const [tenant, setTenant] = useState(() => initialConfig?.tenant ?? '')
  const [label, setLabel] = useState(() => initialConfig?.label === 'Daily WU Count' ? 'Weekly Work Unit Counts' : initialConfig?.label ?? 'Weekly Work Unit Counts')
  const [countFontSize, setCountFontSize] = useState(() => initialConfig?.countFontSize ?? 12)
  const [dateLabelFontSize, setDateLabelFontSize] = useState(() => initialConfig?.dateLabelFontSize ?? 9)
  const [legendFontSize, setLegendFontSize] = useState(() => initialConfig?.legendFontSize ?? 9)
  const [showAlertBreakdown, setShowAlertBreakdown] = useState(() => initialConfig?.showAlertBreakdown ?? false)

  return (
    <main className="cw-metric-editor">
      <div className="cw-page-heading">
        <p className="cw-eyebrow">Add visualization / Bar Chart / Weekly Work Unit Counts</p>
        <h1>Configure weekly WorkUnit counts</h1>
        <p>Count CSV rows per Monday-starting week for the selected tenant.</p>
      </div>
      <section className="cw-metric-editor-panel">
        <label className="cw-select-field">
          <span>Dashboard workspace</span>
          <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
            {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select>
        </label>
        <label className="cw-select-field">
            <span>WorkUnit week field</span>
          <select value={dateColumn} onChange={(event) => setDateColumn(event.target.value)} disabled={!dateColumns.length}>
            {!dateColumns.length && <option value="">No date fields found</option>}
            {dateColumns.map((column) => <option key={column} value={column}>{column}</option>)}
          </select>
        </label>
        <TenantSelector file={file} tenant={tenant} onChange={setTenant} />
        <label className="cw-metric-label-field">
          <span>Chart label</span>
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Weekly Work Unit Counts" />
        </label>
        <label className="cw-alert-breakdown-option">
          <input type="checkbox" checked={showAlertBreakdown} onChange={(event) => setShowAlertBreakdown(event.target.checked)} />
          <span>Show alert title breakdown on hover</span>
        </label>
        <div className="cw-metric-style-fields">
          <label className="cw-metric-label-field">
            <span>Count font size</span>
            <input type="number" min="8" max="20" value={countFontSize} onChange={(event) => setCountFontSize(event.target.value)} />
          </label>
          <label className="cw-metric-label-field">
            <span>Date label font size</span>
            <input type="number" min="8" max="20" value={dateLabelFontSize} onChange={(event) => setDateLabelFontSize(event.target.value)} />
          </label>
          <label className="cw-metric-label-field">
            <span>Legend font size</span>
            <input type="number" min="8" max="20" value={legendFontSize} onChange={(event) => setLegendFontSize(event.target.value)} />
          </label>
        </div>
      </section>
      <div className="cw-editor-actions">
        <button type="button" className="cw-back-button" onClick={onBack}>Back</button>
        <button type="button" className="cw-add-metric-button" disabled={!dateColumn} onClick={() => onAdd({
          workspaceId,
          dateColumn,
          tenant,
          label: label.trim() || 'Weekly Work Unit Counts',
          showAlertBreakdown,
          countFontSize: Math.max(8, Math.min(20, Number(countFontSize) || 12)),
          dateLabelFontSize: Math.max(8, Math.min(20, Number(dateLabelFontSize) || 9)),
          legendFontSize: Math.max(8, Math.min(20, Number(legendFontSize) || 9)),
        })}>
          {initialConfig ? 'Save bar chart' : 'Add bar chart'}
        </button>
      </div>
    </main>
  )
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

function DataTable({ file, config, dateFrom, dateTo }) {
  const [sortConfig, setSortConfig] = useState(null)
  const tenantColumn = getTenantColumn(file.columns)
  const severityColumn = getSeverityIdColumn(file.columns)
  const titleColumn = getColumnByNormalizedName(file.columns, 'title')
  const dateColumn = config.dateColumn ?? getDateColumn(file)
  const displayColumns = config.highImpacting ? [...getHighImpactingWorkUnitColumns(file.columns), '__count'] : config.columns
  const tableTitle = config.highImpacting ? 'Top 3 Alerts' : config.title ?? 'CSV Data'
  const tableFontSize = Math.max(10, Math.min(24, Number(config.tableFontSize) || 13))
  const numericValues = useMemo(() => {
    if (!config.metricColumn) return []
    return file.rows.map((row) => Number(row[config.metricColumn])).filter(Number.isFinite)
  }, [config.metricColumn, file.rows])
  const maxMetric = Math.max(...numericValues.map(Math.abs), 1)
  const rows = useMemo(() => {
    const filteredRows = file.rows.filter((row) => {
      const tenant = getRowColumnValue(row, tenantColumn, (column) => column === 'tenant' || column === 'tenantname' || column === 'tenantid')
      const severity = getSeverityLevel(getRowColumnValue(row, severityColumn, (column) => column.includes('severityid') || column.startsWith('severity')))
      if (config.tenant && normalizeComparableValue(tenant) !== normalizeComparableValue(config.tenant)) return false
      if (!rowMatchesDateRange(row, dateColumn, dateFrom, dateTo)) return false
      if (config.highImpacting && (severity == null || severity > 2)) return false
      return true
    })
    const tableRows = config.highImpacting
      ? [...filteredRows.reduce((groups, row) => {
          const title = String(row[titleColumn] ?? '').trim() || 'Untitled'
          const groupKey = normalizeComparableValue(title)
          const severity = getSeverityLevel(getRowColumnValue(row, severityColumn, (column) => column.includes('severityid') || column.startsWith('severity')))
          const existing = groups.get(groupKey)
          if (existing) {
            existing.__count += 1
            existing[severityColumn] = Math.min(Number(existing[severityColumn]) || severity, severity)
          } else {
            groups.set(groupKey, { ...row, [titleColumn]: title, [severityColumn]: severity, __count: 1 })
          }
          return groups
        }, new Map()).values()]
      : filteredRows
    const sortedRows = sortConfig
      ? [...tableRows].sort((left, right) => {
          const leftValue = String(left[sortConfig.column] ?? '')
          const rightValue = String(right[sortConfig.column] ?? '')
          const comparison = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' })
          return sortConfig.direction === 'asc' ? comparison : -comparison
        })
      : config.highImpacting
        ? [...tableRows].sort((left, right) => right.__count - left.__count)
        : tableRows
    return config.highImpacting ? sortedRows.slice(0, 3) : sortedRows
  }, [config, dateColumn, dateFrom, dateTo, file.rows, severityColumn, sortConfig, tenantColumn, titleColumn])
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
          <h2>{tableTitle}</h2>
        </div>
        <div className="cw-table-header-actions">
          <span className="cw-table-count">{rows.length.toLocaleString()} rows</span>
        </div>
      </div>
      <div className="cw-table-wrap">
        <table className="cw-data-table" style={{ fontSize: `${tableFontSize}px` }}>
          <thead>
            <tr>
              {displayColumns.map((column) => (
                <th key={column}>
                  <button type="button" className="cw-table-sort-button" onClick={() => handleSort(column)}>
                    {column === '__count' ? 'Count' : column}
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
                {displayColumns.map((column) => {
                  const value = column === '__count' ? row.__count : row[column]
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
  const [metricColumn, setMetricColumn] = useState(() => initialConfig?.metricColumn ?? numericColumns[0] ?? '')
  const [display, setDisplay] = useState(() => initialConfig?.display ?? 'none')
  const [aggregates, setAggregates] = useState(() => initialConfig?.aggregates ?? [])
  const [workspaceId, setWorkspaceId] = useState(() => initialConfig?.workspaceId ?? activeWorkspaceId)
  const [tableFontSize, setTableFontSize] = useState(() => initialConfig?.tableFontSize ?? 13)

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
          <label className="cw-metric-label-field">
            <span>Table font size</span>
            <input type="number" min="10" max="24" value={tableFontSize} onChange={(event) => setTableFontSize(event.target.value)} />
          </label>
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
          onClick={() => onAdd({
            columns: selectedColumns,
            metricColumn,
            display,
            aggregates,
            workspaceId,
            tableFontSize: Math.max(10, Math.min(24, Number(tableFontSize) || 13)),
          })}
        >
          {initialConfig ? 'Save table' : 'Add table'}
        </button>
      </div>
    </main>
  )
}

function HighImpactingWorkUnitsConfigurationPage({ file, initialConfig, workspaces, activeWorkspaceId, onBack, onAdd }) {
  const severityColumn = getSeverityIdColumn(file.columns)
  const [workspaceId, setWorkspaceId] = useState(() => initialConfig?.workspaceId ?? activeWorkspaceId)
  const [tenant, setTenant] = useState(() => initialConfig?.tenant ?? '')
  const [tableFontSize, setTableFontSize] = useState(() => initialConfig?.tableFontSize ?? 13)

  return (
    <main className="cw-metric-editor">
      <div className="cw-page-heading">
        <p className="cw-eyebrow">Add visualization / Table / Top 3 Alerts</p>
        <h1>Configure high-impact WorkUnits</h1>
        <p>Show Severity 1 and 2 WorkUnits for the selected tenant.</p>
      </div>
      <section className="cw-metric-editor-panel">
        <label className="cw-select-field">
          <span>Dashboard workspace</span>
          <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
            {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select>
        </label>
        <TenantSelector file={file} tenant={tenant} onChange={setTenant} />
        <label className="cw-metric-label-field">
          <span>Table font size</span>
          <input type="number" min="10" max="24" value={tableFontSize} onChange={(event) => setTableFontSize(event.target.value)} />
        </label>
      </section>
      <div className="cw-editor-actions">
        <button type="button" className="cw-back-button" onClick={onBack}>Back</button>
        <button type="button" className="cw-add-metric-button" disabled={!severityColumn} onClick={() => onAdd({
          workspaceId,
          tenant,
          columns: getHighImpactingWorkUnitColumns(file.columns),
          title: 'Top 3 Alerts',
          highImpacting: true,
          display: 'none',
          aggregates: [],
          tableFontSize: Math.max(10, Math.min(24, Number(tableFontSize) || 13)),
        })}>
          {initialConfig ? 'Save table' : 'Add table'}
        </button>
      </div>
      {!severityColumn && <p className="cw-upload-error">A SeverityID column is required for this table.</p>}
    </main>
  )
}

function TenantSelector({ file, tenant, onChange }) {
  const tenantColumn = getTenantColumn(file.columns)
  const tenants = tenantColumn
    ? [...new Set(file.rows.map((row) => String(row[tenantColumn] ?? '').trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }))
    : []

  return (
    <label className="cw-select-field">
      <span>Tenant</span>
      <select value={tenant} onChange={(event) => onChange(event.target.value)} disabled={!tenantColumn}>
        <option value="">All tenants</option>
        {tenants.map((tenantName) => <option key={tenantName} value={tenantName}>{tenantName}</option>)}
      </select>
    </label>
  )
}

function MetricCard({ file, config, dateFrom, dateTo }) {
  const tenantColumn = getTenantColumn(file.columns)
  const dateColumn = config.dateColumn ?? getDateColumn(file)
  const value = file.rows.filter((row) => (
    String(row[config.countColumn] ?? '').trim() !== ''
    && rowMatchesDateRange(row, dateColumn, dateFrom, dateTo)
    && (!config.tenant || normalizeComparableValue(getRowColumnValue(row, tenantColumn, (column) => column === 'tenant' || column === 'tenantname' || column === 'tenantid')) === normalizeComparableValue(config.tenant))
  )).length

  return (
    <section className="cw-metric-card" style={{ backgroundColor: config.valueBackground ?? '#000' }} aria-label={`${config.label} metric`}>
      <header className="cw-metric-header">{config.label}</header>
      <div className="cw-metric-value" style={{ color: config.valueColor ?? '#f8fafc', fontSize: `${config.valueFontSize ?? 42}px` }}>{value.toLocaleString()}</div>
    </section>
  )
}

function MetricConfigurationPage({ file, initialConfig, workspaces, activeWorkspaceId, onBack, onAdd }) {
  const [countColumn, setCountColumn] = useState(() => initialConfig?.countColumn ?? file.columns[0] ?? '')
  const [label, setLabel] = useState(() => initialConfig?.label ?? '')
  const [workspaceId, setWorkspaceId] = useState(() => initialConfig?.workspaceId ?? activeWorkspaceId)
  const [valueFontSize, setValueFontSize] = useState(() => initialConfig?.valueFontSize ?? 42)
  const [valueColor, setValueColor] = useState(() => initialConfig?.valueColor ?? '#f8fafc')
  const [valueBackground, setValueBackground] = useState(() => initialConfig?.valueBackground ?? '#000000')
  const [tenant, setTenant] = useState(() => initialConfig?.tenant ?? '')

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
        <TenantSelector file={file} tenant={tenant} onChange={setTenant} />
        <label className="cw-metric-label-field">
          <span>Metric label</span>
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={`Count of ${countColumn}`} />
        </label>
        <div className="cw-metric-style-fields">
          <label className="cw-metric-label-field">
            <span>Value font size</span>
            <input type="number" min="16" max="120" value={valueFontSize} onChange={(event) => setValueFontSize(event.target.value)} />
          </label>
          <label className="cw-metric-label-field cw-metric-color-field">
            <span>Value color</span>
            <input type="color" value={valueColor} onChange={(event) => setValueColor(event.target.value)} />
          </label>
          <label className="cw-metric-label-field cw-metric-color-field">
            <span>Value background</span>
            <input type="color" value={valueBackground} onChange={(event) => setValueBackground(event.target.value)} />
          </label>
        </div>
      </section>
      <div className="cw-editor-actions">
        <button type="button" className="cw-back-button" onClick={onBack}>Back</button>
        <button
          type="button"
          className="cw-add-metric-button"
          disabled={!countColumn}
          onClick={() => onAdd({
            countColumn,
            label: label.trim() || `Count of ${countColumn}`,
            workspaceId,
            tenant,
            valueColor,
            valueBackground,
            valueFontSize: Math.max(16, Math.min(120, Number(valueFontSize) || 42)),
          })}
        >
          {initialConfig ? 'Save metric' : 'Add metric'}
        </button>
      </div>
    </main>
  )
}

function SeverityMetricCard({ file, config, dateFrom, dateTo }) {
  const severityColumn = getSeverityIdColumn(file.columns)
  const tenantColumn = getTenantColumn(file.columns)
  const dateColumn = config.dateColumn ?? getDateColumn(file)
  const counts = [1, 2, 3, 4].map((severity) => ({
    severity,
    count: file.rows.filter((row) => {
      const severityValue = getRowColumnValue(row, severityColumn, (column) => column.includes('severityid') || column.startsWith('severity'))
      const tenantValue = getRowColumnValue(row, tenantColumn, (column) => column === 'tenant' || column === 'tenantname' || column === 'tenantid')
      return getSeverityLevel(severityValue) === severity
        && rowMatchesDateRange(row, dateColumn, dateFrom, dateTo)
        && (!config.tenant || normalizeComparableValue(tenantValue) === normalizeComparableValue(config.tenant))
    }).length,
  }))

  return (
    <section className="cw-severity-card" aria-label="Severity metric">
      <header className="cw-severity-header">{config.label ?? 'Severity Metrics'}</header>
      <div className="cw-severity-counts">
        {counts.map(({ severity, count }) => (
          <div key={severity} className={`cw-severity-count cw-severity-${severity}`}>
            <span>Severity {severity}</span>
            <strong>{count.toLocaleString()}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}

function SeverityMetricConfigurationPage({ file, initialConfig, workspaces, activeWorkspaceId, onBack, onAdd }) {
  const [label, setLabel] = useState(() => initialConfig?.label ?? 'Severity Metrics')
  const [workspaceId, setWorkspaceId] = useState(() => initialConfig?.workspaceId ?? activeWorkspaceId)
  const [tenant, setTenant] = useState(() => initialConfig?.tenant ?? '')

  return (
    <main className="cw-metric-editor">
      <div className="cw-page-heading">
        <p className="cw-eyebrow">Add visualization / Severity Metric</p>
        <h1>Configure severity counts</h1>
        <p>Count each SeverityID value from 1 through 4.</p>
      </div>
      <section className="cw-metric-editor-panel">
        <label className="cw-select-field">
          <span>Dashboard workspace</span>
          <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
            {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select>
        </label>
        <TenantSelector file={file} tenant={tenant} onChange={setTenant} />
        <label className="cw-metric-label-field">
          <span>Metric label</span>
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Severity Metrics" />
        </label>
      </section>
      <div className="cw-editor-actions">
        <button type="button" className="cw-back-button" onClick={onBack}>Back</button>
        <button type="button" className="cw-add-metric-button" onClick={() => onAdd({
          label: label.trim() || 'Severity Metrics',
          workspaceId,
          tenant,
        })}>
          {initialConfig ? 'Save severity metric' : 'Add severity metric'}
        </button>
      </div>
    </main>
  )
}

function LabelCard({ config }) {
  return (
    <section className={`cw-label-card${config.pillBorder ? ' is-pill' : ''}`} aria-label={`${config.text} label`}>
      <span style={{ color: config.color ?? '#fff', fontFamily: config.fontFamily ?? 'system-ui, sans-serif', fontSize: `${config.fontSize ?? 28}px` }}>{config.text}</span>
    </section>
  )
}

function LabelConfigurationPage({ initialConfig, workspaces, activeWorkspaceId, onBack, onAdd }) {
  const [text, setText] = useState(() => initialConfig?.text ?? '')
  const [workspaceId, setWorkspaceId] = useState(() => initialConfig?.workspaceId ?? activeWorkspaceId)
  const [fontFamily, setFontFamily] = useState(() => initialConfig?.fontFamily ?? 'system-ui, sans-serif')
  const [fontSize, setFontSize] = useState(() => initialConfig?.fontSize ?? 28)
  const [color, setColor] = useState(() => initialConfig?.color ?? '#ffffff')
  const [pillBorder, setPillBorder] = useState(() => initialConfig?.pillBorder ?? false)

  return (
    <main className="cw-label-editor">
      <div className="cw-page-heading">
        <p className="cw-eyebrow">Add visualization / Label</p>
        <h1>Configure your label</h1>
        <p>Add formatted text to your dashboard or presentation.</p>
      </div>
      <section className="cw-metric-editor-panel">
        <label className="cw-select-field">
          <span>Dashboard workspace</span>
          <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
            {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select>
        </label>
        <label className="cw-metric-label-field">
          <span>Label text</span>
          <input autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder="Label text" />
        </label>
        <div className="cw-label-style-fields">
          <label className="cw-metric-label-field">
            <span>Font style</span>
            <select value={fontFamily} onChange={(event) => setFontFamily(event.target.value)}>
              <option value="system-ui, sans-serif">Sans serif</option>
              <option value="Georgia, serif">Serif</option>
              <option value="Consolas, monospace">Monospace</option>
            </select>
          </label>
          <label className="cw-metric-label-field">
            <span>Font size</span>
            <input type="number" min="12" max="120" value={fontSize} onChange={(event) => setFontSize(event.target.value)} />
          </label>
          <label className="cw-metric-label-field cw-metric-color-field">
            <span>Font color</span>
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
          </label>
        </div>
        <label className="cw-label-pill-option">
          <input type="checkbox" checked={pillBorder} onChange={(event) => setPillBorder(event.target.checked)} />
          <span>Use pill border</span>
        </label>
      </section>
      <div className="cw-editor-actions">
        <button type="button" className="cw-back-button" onClick={onBack}>Back</button>
        <button
          type="button"
          className="cw-add-metric-button"
          disabled={!text.trim()}
          onClick={() => onAdd({
            text: text.trim(),
            workspaceId,
            fontFamily,
            color,
            pillBorder,
            fontSize: Math.max(12, Math.min(120, Number(fontSize) || 28)),
          })}
        >
          {initialConfig ? 'Save label' : 'Add label'}
        </button>
      </div>
    </main>
  )
}

function DateLabelCard({ config }) {
  const date = formatDateLabel(config.date)
  return (
    <section className="cw-label-card" aria-label={`Date label ${date}`}>
      <span style={{ color: config.color ?? '#fff', fontFamily: config.fontFamily ?? 'system-ui, sans-serif', fontSize: `${config.fontSize ?? 28}px` }}>{date}</span>
    </section>
  )
}

function DateLabelConfigurationPage({ initialConfig, workspaces, activeWorkspaceId, onBack, onAdd }) {
  const [date, setDate] = useState(() => initialConfig?.date ?? getTodayIsoDate())
  const [workspaceId, setWorkspaceId] = useState(() => initialConfig?.workspaceId ?? activeWorkspaceId)
  const [fontFamily, setFontFamily] = useState(() => initialConfig?.fontFamily ?? 'system-ui, sans-serif')
  const [fontSize, setFontSize] = useState(() => initialConfig?.fontSize ?? 28)
  const [color, setColor] = useState(() => initialConfig?.color ?? '#ffffff')

  return (
    <main className="cw-label-editor">
      <div className="cw-page-heading">
        <p className="cw-eyebrow">Add visualization / Date Label</p>
        <h1>Configure date label</h1>
        <p>Dates display as MM-DD-YYYY.</p>
      </div>
      <section className="cw-metric-editor-panel">
        <label className="cw-select-field">
          <span>Dashboard workspace</span>
          <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
            {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select>
        </label>
        <label className="cw-metric-label-field">
          <span>Date</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <div className="cw-label-style-fields">
          <label className="cw-metric-label-field">
            <span>Font style</span>
            <select value={fontFamily} onChange={(event) => setFontFamily(event.target.value)}>
              <option value="system-ui, sans-serif">Sans serif</option>
              <option value="Georgia, serif">Serif</option>
              <option value="Consolas, monospace">Monospace</option>
            </select>
          </label>
          <label className="cw-metric-label-field">
            <span>Font size</span>
            <input type="number" min="12" max="120" value={fontSize} onChange={(event) => setFontSize(event.target.value)} />
          </label>
          <label className="cw-metric-label-field cw-metric-color-field">
            <span>Font color</span>
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
          </label>
        </div>
      </section>
      <div className="cw-editor-actions">
        <button type="button" className="cw-back-button" onClick={onBack}>Back</button>
        <button type="button" className="cw-add-metric-button" onClick={() => onAdd({
          date,
          workspaceId,
          fontFamily,
          color,
          fontSize: Math.max(12, Math.min(120, Number(fontSize) || 28)),
        })}>
          {initialConfig ? 'Save date label' : 'Add date label'}
        </button>
      </div>
    </main>
  )
}

function ShapeCard({ config }) {
  const color = config.color ?? '#facc15'
  const strokeWidth = config.strokeWidth ?? 2

  if (config.type === 'line') {
    const direction = config.direction ?? 'horizontal'
    const coordinates = direction === 'vertical'
      ? { x1: '50%', y1: '0', x2: '50%', y2: '100%' }
      : direction === 'diagonal'
        ? { x1: '0', y1: '100%', x2: '100%', y2: '0' }
        : { x1: '0', y1: '50%', x2: '100%', y2: '50%' }
    return (
      <svg className="cw-line-shape" aria-label={`${direction} line`} role="img" preserveAspectRatio="none">
        <line {...coordinates} stroke={color} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
      </svg>
    )
  }

  const backgroundColor = config.backgroundColor ?? '#facc15'
  const backgroundOpacity = Math.max(0, Math.min(100, Number(config.backgroundOpacity) || 4))
  const hex = backgroundColor.replace('#', '')
  const red = Number.parseInt(hex.slice(0, 2), 16)
  const green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16)
  const fill = Number.isFinite(red) && Number.isFinite(green) && Number.isFinite(blue)
    ? `rgba(${red}, ${green}, ${blue}, ${backgroundOpacity / 100})`
    : 'transparent'

  return <div className="cw-rectangle-shape" aria-label="Grouping rectangle" role="img" style={{ borderColor: color, borderWidth: strokeWidth, backgroundColor: fill }} />
}

function ShapeConfigurationPage({ initialConfig, type, workspaces, activeWorkspaceId, onBack, onAdd }) {
  const [workspaceId, setWorkspaceId] = useState(() => initialConfig?.workspaceId ?? activeWorkspaceId)
  const [color, setColor] = useState(() => initialConfig?.color ?? '#facc15')
  const [strokeWidth, setStrokeWidth] = useState(() => initialConfig?.strokeWidth ?? 2)
  const [direction, setDirection] = useState(() => initialConfig?.direction ?? 'horizontal')
  const [backgroundColor, setBackgroundColor] = useState(() => initialConfig?.backgroundColor ?? '#facc15')
  const [backgroundOpacity, setBackgroundOpacity] = useState(() => initialConfig?.backgroundOpacity ?? 4)
  const isLine = type === 'line'

  return (
    <main className="cw-metric-editor">
      <div className="cw-page-heading">
        <p className="cw-eyebrow">Add visualization / {isLine ? 'Line' : 'Rectangle'}</p>
        <h1>Configure {isLine ? 'line' : 'rectangle'}</h1>
        <p>{isLine ? 'Use lines to divide or guide groups of visualizations.' : 'Use a transparent frame to group related visualizations.'}</p>
      </div>
      <section className="cw-metric-editor-panel">
        <label className="cw-select-field">
          <span>Dashboard workspace</span>
          <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
            {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select>
        </label>
        {isLine && (
          <label className="cw-select-field">
            <span>Line direction</span>
            <select value={direction} onChange={(event) => setDirection(event.target.value)}>
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
              <option value="diagonal">Diagonal</option>
            </select>
          </label>
        )}
        <div className="cw-metric-style-fields">
          <label className="cw-metric-label-field cw-metric-color-field">
            <span>Stroke color</span>
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
          </label>
          <label className="cw-metric-label-field">
            <span>Stroke width</span>
            <input type="number" min="1" max="12" value={strokeWidth} onChange={(event) => setStrokeWidth(event.target.value)} />
          </label>
          {!isLine && (
            <>
              <label className="cw-metric-label-field cw-metric-color-field">
                <span>Background color</span>
                <input type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} />
              </label>
              <label className="cw-metric-label-field">
                <span>Background opacity</span>
                <input type="number" min="0" max="100" value={backgroundOpacity} onChange={(event) => setBackgroundOpacity(event.target.value)} />
              </label>
            </>
          )}
        </div>
      </section>
      <div className="cw-editor-actions">
        <button type="button" className="cw-back-button" onClick={onBack}>Back</button>
        <button type="button" className="cw-add-metric-button" onClick={() => onAdd({
          workspaceId,
          color,
          direction: isLine ? direction : undefined,
          strokeWidth: Math.max(1, Math.min(12, Number(strokeWidth) || 2)),
          backgroundColor: isLine ? undefined : backgroundColor,
          backgroundOpacity: isLine ? undefined : Math.max(0, Math.min(100, Number(backgroundOpacity) || 0)),
        })}>
          {initialConfig ? `Save ${isLine ? 'line' : 'rectangle'}` : `Add ${isLine ? 'line' : 'rectangle'}`}
        </button>
      </div>
    </main>
  )
}

function DashboardShell({ file, onReset }) {
  const [view, setView] = useState('dashboard')
  const [persistedDashboard] = useState(() => loadPersistedDashboard(file))
  const [workspaces, setWorkspaces] = useState(() => (
    persistedDashboard?.workspaces ?? [{
      id: 'workspace-1',
      name: 'My Dashboard',
      visualizations: [],
    }]
  ))
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => persistedDashboard?.activeWorkspaceId ?? 'workspace-1')
  const [isWorkspaceDialogOpen, setIsWorkspaceDialogOpen] = useState(false)
  const [workspaceDraft, setWorkspaceDraft] = useState({
    name: '',
    customerLogo: '',
    programManager: '',
    teamMembers: '',
  })
  const [editingVisualizationId, setEditingVisualizationId] = useState(null)
  const [selectedVisualizationId, setSelectedVisualizationId] = useState(null)
  const [gridInteraction, setGridInteraction] = useState(null)
  const [isPresenting, setIsPresenting] = useState(false)
  const [workspaceSaveStatus, setWorkspaceSaveStatus] = useState('')
  const workspaceGridRef = useRef(null)
  const workspaceInfoRef = useRef(null)
  const gridItemRefs = useRef(new Map())
  const pendingGridLayoutRef = useRef(null)
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0]
  const editingVisualization = workspaces
    .flatMap((workspace) => workspace.visualizations)
    .find((visualization) => visualization.id === editingVisualizationId)
  const selectedVisualization = activeWorkspace.visualizations.find((visualization) => visualization.id === selectedVisualizationId)

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
        fileKey: getDashboardKey(file),
        workspaces,
        activeWorkspaceId,
      }))
    } catch {}
  }, [activeWorkspaceId, file, workspaces])

  function saveWorkspace() {
    try {
      window.localStorage.setItem(dashboardStorageKey, JSON.stringify({
        fileKey: getDashboardKey(file),
        workspaces,
        activeWorkspaceId,
      }))
      setWorkspaceSaveStatus('Saved')
    } catch {
      setWorkspaceSaveStatus('Unable to save')
    }
  }

  function setWorkspaceDateRange(dateFrom, dateTo) {
    setWorkspaces((current) => current.map((workspace) => (
      workspace.id === activeWorkspaceId ? { ...workspace, dateFrom, dateTo } : workspace
    )))
  }

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
          hasWorkspaceIdentity(workspace) ? 40 : 0,
          ...workspace.visualizations.map((item) => (item.gridY ?? 0) + (item.gridHeight ?? 64)),
        ),
        gridWidth: type === 'metric' ? 32 : type === 'severity' ? 64 : type === 'label' || type === 'date-label' ? 24 : type === 'daily-wu-count' || type === 'weekly-wu-count' ? 64 : type === 'line' ? 48 : type === 'rectangle' ? 64 : 96,
        gridHeight: type === 'metric' ? 32 : type === 'severity' ? 32 : type === 'label' || type === 'date-label' ? 16 : type === 'daily-wu-count' || type === 'weekly-wu-count' ? 48 : type === 'line' ? 2 : type === 'rectangle' ? 40 : 64,
      }
      const layout = existingLayout ?? defaultLayout
      return workspace.id === config.workspaceId
        ? { ...workspace, visualizations: [...withoutEditedVisualization, { ...visualization, ...layout }] }
        : { ...workspace, visualizations: withoutEditedVisualization }
    }))
    setActiveWorkspaceId(config.workspaceId)
    setEditingVisualizationId(null)
    setSelectedVisualizationId(null)
    setView('dashboard')
  }

  function deleteVisualization(id) {
    setWorkspaces((current) => current.map((workspace) => (
      workspace.id === activeWorkspaceId
        ? { ...workspace, visualizations: workspace.visualizations.filter((visualization) => visualization.id !== id) }
        : workspace
    )))
    setSelectedVisualizationId(null)
  }

  function editSelectedVisualization() {
    if (!selectedVisualization) return
    setEditingVisualizationId(selectedVisualization.id)
    setView(selectedVisualization.type === 'metric' ? 'metric-config' : selectedVisualization.type === 'severity' ? 'severity-config' : selectedVisualization.type === 'label' ? 'label-config' : selectedVisualization.type === 'date-label' ? 'date-label-config' : selectedVisualization.type === 'daily-wu-count' || selectedVisualization.type === 'weekly-wu-count' ? 'weekly-wu-count-config' : selectedVisualization.type === 'high-impacting-work-units' ? 'high-impacting-work-units-config' : isGroupingShape(selectedVisualization) ? 'shape-config' : 'table-config')
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

  function getWorkspaceIdentityLayout(grid) {
    if (!hasWorkspaceIdentity(activeWorkspace)) return null
    const gridRect = grid.getBoundingClientRect()
    const infoRect = workspaceInfoRef.current?.getBoundingClientRect()
    if (!infoRect) return { gridX: 0, gridY: 0, gridWidth: 32, gridHeight: 40 }
    const gridColumnWidth = gridRect.width / 96
    return {
      gridX: Math.max(0, Math.floor((infoRect.left - gridRect.left) / gridColumnWidth)),
      gridY: Math.max(0, Math.floor((infoRect.top - gridRect.top) / 8)),
      gridWidth: Math.min(96, Math.ceil((infoRect.right - gridRect.left) / gridColumnWidth)),
      gridHeight: Math.ceil((infoRect.bottom - gridRect.top) / 8),
    }
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
      type: visualization.type,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      gridWidth: rect.width / 96,
      gridHeight: 8,
      blockedLayouts: isGroupingShape(visualization) ? [] : [
        ...activeWorkspace.visualizations
          .filter((item) => item.id !== visualization.id && !isGroupingShape(item))
          .map((item) => ({
            gridX: item.gridX ?? 0,
            gridY: item.gridY ?? 0,
            gridWidth: item.gridWidth ?? 96,
            gridHeight: item.gridHeight ?? 64,
          })),
        getWorkspaceIdentityLayout(grid),
      ].filter(Boolean),
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
        gridY: Math.max(0, original.gridY + deltaY),
      }
      : {
        ...original,
        gridWidth: Math.max(gridInteraction.type === 'metric' || gridInteraction.type === 'severity' || gridInteraction.type === 'line' ? 1 : gridInteraction.type === 'label' || gridInteraction.type === 'date-label' || gridInteraction.type === 'rectangle' ? 8 : 24, original.gridWidth + deltaX),
        gridHeight: Math.max(gridInteraction.type === 'metric' || gridInteraction.type === 'severity' || gridInteraction.type === 'line' ? 1 : gridInteraction.type === 'label' || gridInteraction.type === 'date-label' || gridInteraction.type === 'rectangle' ? 8 : 24, original.gridHeight + deltaY),
      }

    if (gridInteraction.blockedLayouts.some((blockedLayout) => layoutsOverlap(layout, blockedLayout))) return

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
      {isPresenting ? <header className="cw-nav cw-presentation-nav">
        <img src="/mer_logo2.png" alt="CloudFit Software" className="cw-nav-cloudfit-logo" />
      </header> : <header className="cw-nav">
        <div className="cw-nav-left">
          <span className="cw-brand-radar">RADAR</span>
          <span className="cw-brand-sep"> | Continuous Wave</span>
        </div>
        <img src="/mer_logo2.png" alt="CloudFit Software" className="cw-nav-cloudfit-logo" />
      </header>}
      {view === 'select' ? (
        <VisualizationSelectionPage
          onBack={() => setView('dashboard')}
          onSelectTable={() => {
            setEditingVisualizationId(null)
            setView('table-select')
          }}
          onSelectMetric={() => {
            setEditingVisualizationId(null)
            setView('metric-select')
          }}
          onSelectBarChart={() => {
            setEditingVisualizationId(null)
            setView('bar-chart-select')
          }}
          onSelectLabel={() => {
            setEditingVisualizationId(null)
            setView('label-config')
          }}
          onSelectDateLabel={() => {
            setEditingVisualizationId(null)
            setView('date-label-config')
          }}
          onSelectShape={(type) => {
            setEditingVisualizationId(null)
            setView(`shape-config:${type}`)
          }}
        />
      ) : view === 'metric-select' ? (
        <MetricSelectionPage
          onBack={() => setView('select')}
          onSelectMetric={() => {
            setEditingVisualizationId(null)
            setView('metric-config')
          }}
          onSelectSeverityMetric={() => {
            setEditingVisualizationId(null)
            setView('severity-config')
          }}
        />
      ) : view === 'bar-chart-select' ? (
        <BarChartSelectionPage
          onBack={() => setView('select')}
          onSelectWeeklyWuCount={() => {
            setEditingVisualizationId(null)
            setView('weekly-wu-count-config')
          }}
        />
      ) : view === 'table-select' ? (
        <TableSelectionPage
          onBack={() => setView('select')}
          onSelectTable={() => {
            setEditingVisualizationId(null)
            setView('table-config')
          }}
          onSelectHighImpactingWorkUnits={() => {
            setEditingVisualizationId(null)
            setView('high-impacting-work-units-config')
          }}
        />
      ) : view === 'table-config' ? (
        <TableConfigurationPage
          file={file}
          initialConfig={editingVisualization}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onBack={() => setView(editingVisualizationId ? 'dashboard' : 'table-select')}
          onAdd={saveVisualization}
        />
      ) : view === 'high-impacting-work-units-config' ? (
        <HighImpactingWorkUnitsConfigurationPage
          file={file}
          initialConfig={editingVisualization}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onBack={() => setView(editingVisualizationId ? 'dashboard' : 'table-select')}
          onAdd={(config) => saveVisualization(config, 'high-impacting-work-units')}
        />
      ) : view === 'metric-config' ? (
        <MetricConfigurationPage
          file={file}
          initialConfig={editingVisualization}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onBack={() => setView(editingVisualizationId ? 'dashboard' : 'metric-select')}
          onAdd={(config) => saveVisualization(config, 'metric')}
        />
      ) : view === 'severity-config' ? (
        <SeverityMetricConfigurationPage
          file={file}
          initialConfig={editingVisualization}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onBack={() => setView(editingVisualizationId ? 'dashboard' : 'metric-select')}
          onAdd={(config) => saveVisualization(config, 'severity')}
        />
      ) : view === 'label-config' ? (
        <LabelConfigurationPage
          initialConfig={editingVisualization}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onBack={() => setView('select')}
          onAdd={(config) => saveVisualization(config, 'label')}
        />
      ) : view === 'date-label-config' ? (
        <DateLabelConfigurationPage
          initialConfig={editingVisualization}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onBack={() => setView(editingVisualizationId ? 'dashboard' : 'select')}
          onAdd={(config) => saveVisualization(config, 'date-label')}
        />
      ) : view === 'weekly-wu-count-config' ? (
        <WeeklyWuCountConfigurationPage
          file={file}
          initialConfig={editingVisualization}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onBack={() => setView(editingVisualizationId ? 'dashboard' : 'bar-chart-select')}
          onAdd={(config) => saveVisualization(config, 'weekly-wu-count')}
        />
      ) : view.startsWith('shape-config') ? (
        <ShapeConfigurationPage
          initialConfig={editingVisualization}
          type={editingVisualization?.type ?? view.split(':')[1]}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onBack={() => setView('select')}
          onAdd={(config) => saveVisualization(config, editingVisualization?.type ?? view.split(':')[1])}
        />
      ) : (
        <main className="cw-dashboard-placeholder">
          {!isPresenting && <div className="cw-dashboard-content">
            <div className="cw-workspace-topbar">
              <div className="cw-workspace-summary">
                <div className="cw-workspace-identity">
                  <div className="cw-placeholder-heading">
                    <h1><span className="cw-workspace-label">Workspace:</span> {activeWorkspace.name}</h1>
                  </div>
                </div>
              </div>
              <div className="cw-workspace-actions">
                <label className="cw-workspace-switcher">
                  <span>Workspace</span>
                  <select value={activeWorkspaceId} onChange={(event) => {
                    setActiveWorkspaceId(event.target.value)
                    setSelectedVisualizationId(null)
                  }}>
                    {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                  </select>
                </label>
                <DateRangePicker
                  dateFrom={activeWorkspace.dateFrom ?? ''}
                  dateTo={activeWorkspace.dateTo ?? ''}
                  onChange={setWorkspaceDateRange}
                  onClear={() => setWorkspaceDateRange('', '')}
                />
                <button type="button" className="cw-new-workspace-button" onClick={() => setIsWorkspaceDialogOpen(true)}>New workspace</button>
                <button type="button" className="cw-nav-edit" onClick={() => setView('select')}>Add visualization</button>
                <button type="button" className="cw-nav-save" onClick={saveWorkspace}>Save workspace</button>
                {workspaceSaveStatus && <span className="cw-workspace-save-status" role="status">{workspaceSaveStatus}</span>}
                <button type="button" className="cw-nav-present" onClick={enterPresentation}>Present</button>
                <button type="button" className="cw-nav-reset" onClick={onReset}>New CSV</button>
              </div>
            </div>
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
          {(activeWorkspace.visualizations.length > 0 || (!isPresenting && (activeWorkspace.customerLogo || activeWorkspace.programManager || activeWorkspace.teamMembers?.length > 0))) && (
            <section className={`cw-presentation-preview${isPresenting ? ' is-presenting' : ''}`}>
              {!isPresenting && (activeWorkspace.customerLogo || activeWorkspace.programManager || activeWorkspace.teamMembers?.length > 0) && (
                <div ref={workspaceInfoRef} className="cw-layout-workspace-info">
                  {activeWorkspace.customerLogo && <img src={customerLogoUrl(activeWorkspace.customerLogo)} alt="" className="cw-grid-customer-logo" />}
                  {(activeWorkspace.programManager || activeWorkspace.teamMembers?.length > 0) && (
                    <div className="cw-layout-workspace-team">
                      {activeWorkspace.programManager && <span><b>Program manager</b>{activeWorkspace.programManager}</span>}
                      {activeWorkspace.teamMembers?.length > 0 && <span><b>Engineering team</b>{activeWorkspace.teamMembers.join(', ')}</span>}
                    </div>
                  )}
                </div>
              )}
              <div
                ref={workspaceGridRef}
                className={`cw-workspace-grid${gridInteraction ? ' is-editing-layout' : ''}`}
                onPointerMove={handleGridPointerMove}
                onPointerUp={endGridInteraction}
                onPointerCancel={endGridInteraction}
                onClick={(event) => {
                  if (!isPresenting && event.target === event.currentTarget) setSelectedVisualizationId(null)
                }}
              >
                {activeWorkspace.visualizations.map((visualization) => (
                  <div
                    key={visualization.id}
                    ref={(node) => {
                      if (node) gridItemRefs.current.set(visualization.id, node)
                      else gridItemRefs.current.delete(visualization.id)
                    }}
                    className={`cw-grid-item${isGroupingShape(visualization) ? ' is-grouping-shape' : ''}${selectedVisualizationId === visualization.id ? ' is-selected' : ''}`}
                    onClick={() => !isPresenting && setSelectedVisualizationId(visualization.id)}
                    style={{
                      gridColumn: `${(visualization.gridX ?? 0) + 1} / span ${visualization.gridWidth ?? 96}`,
                      gridRow: `${(visualization.gridY ?? 0) + 1} / span ${visualization.gridHeight ?? 64}`,
                    }}
                  >
                    {!isPresenting && selectedVisualizationId === visualization.id && (
                      <div
                        className="cw-grid-drag-handle"
                        onPointerDown={(event) => beginGridInteraction(event, visualization, 'move')}
                        title="Drag to move"
                      >
                        <span>Drag to move</span>
                        <div className="cw-grid-item-actions">
                          <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={editSelectedVisualization}>Edit</button>
                          <button type="button" className="is-delete" onPointerDown={(event) => event.stopPropagation()} onClick={() => deleteVisualization(visualization.id)}>Delete</button>
                        </div>
                      </div>
                    )}
                    {visualization.type === 'metric' ? (
                      <MetricCard
                        file={file}
                        config={visualization}
                        dateFrom={activeWorkspace.dateFrom}
                        dateTo={activeWorkspace.dateTo}
                      />
                    ) : visualization.type === 'severity' ? (
                      <SeverityMetricCard file={file} config={visualization} dateFrom={activeWorkspace.dateFrom} dateTo={activeWorkspace.dateTo} />
                    ) : visualization.type === 'label' ? (
                      <LabelCard config={visualization} />
                    ) : visualization.type === 'date-label' ? (
                      <DateLabelCard config={visualization} />
                    ) : visualization.type === 'daily-wu-count' || visualization.type === 'weekly-wu-count' ? (
                      <WeeklyWuCountBarChart file={file} config={visualization} dateFrom={activeWorkspace.dateFrom} dateTo={activeWorkspace.dateTo} />
                    ) : isGroupingShape(visualization) ? (
                      <ShapeCard config={visualization} />
                    ) : (
                      <DataTable
                        file={file}
                        config={visualization}
                        dateFrom={activeWorkspace.dateFrom}
                        dateTo={activeWorkspace.dateTo}
                      />
                    )}
                    {!isPresenting && selectedVisualizationId === visualization.id && (
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
            </section>
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
  const [file, setFile] = useState(() => loadSessionFile())

  function handleData(data) {
    saveSessionFile(data)
    setFile(data)
  }

  function handleReset() {
    clearSessionFile()
    setFile(null)
  }

  return (
    <>
      {!file && <img src="/cloudfit-logo.png" alt="CloudFit Software" className="cw-cloudfit-logo" />}
      {file
        ? <DashboardShell file={file} onReset={handleReset} />
        : <CsvSelectionPage onData={handleData} />}
    </>
  )
}

export default App
