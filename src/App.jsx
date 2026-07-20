import { useCallback, useRef, useState } from 'react'
import Papa from 'papaparse'
import './App.css'

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
  { name: 'Line chart', description: 'Track change and trends across a continuous range.' },
  { name: 'Bar chart', description: 'Compare values across discrete categories.' },
  { name: 'Scatter plot', description: 'Explore the relationship between two numeric fields.' },
  { name: 'Table', description: 'Inspect your source data in a structured view.' },
]

function VisualizationSelectionPage({ onBack }) {
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
            onClick={() => setSelectedType(visualization.name)}
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

function DashboardShell({ file, onReset }) {
  const [isEditing, setIsEditing] = useState(false)

  return (
    <div className="cw-app">
      <header className="cw-nav">
        <div className="cw-nav-left">
          <span className="cw-brand-radar">RADAR</span>
          <span className="cw-brand-sep"> | Continuous Wave</span>
        </div>
        <div className="cw-nav-center" aria-label="Continuous Wave dashboard">CONTINUOUS WAVE</div>
        <div className="cw-nav-right">
          <span className="cw-nav-file" title={file.name}>{file.name}</span>
          <button type="button" className="cw-nav-edit" onClick={() => setIsEditing(true)}>Edit</button>
          <button type="button" className="cw-nav-reset" onClick={onReset}>New CSV</button>
        </div>
      </header>
      {isEditing ? (
        <VisualizationSelectionPage onBack={() => setIsEditing(false)} />
      ) : (
        <main className="cw-dashboard-placeholder">
          <div className="cw-placeholder-heading">
            <p className="cw-eyebrow">CSV loaded</p>
            <h1>Continuous Wave Dashboard</h1>
            <p>The dashboard is ready for the first Continuous Wave visualizations.</p>
          </div>
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
        </main>
      )}
    </div>
  )
}

function App() {
  const [file, setFile] = useState(null)

  return file
    ? <DashboardShell file={file} onReset={() => setFile(null)} />
    : <CsvSelectionPage onData={setFile} />
}

export default App
