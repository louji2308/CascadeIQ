import './FiresPanel.css';

interface FireNode {
  id: string;
  name: string;
  lat: number;
  lon: number;
  frp_mw: number;
  severity: number;
  acq_date: string;
  confidence: string;
  region: string;
  brightness?: number;
  acq_time?: string;
  satellite?: string;
  place_name?: string;
}

interface FiresPanelProps {
  fires: FireNode[];
  selectedFireId: string | null;
  onFireSelect: (fireId: string, node: { id: string; name: string; label: string; severity?: number }) => void;
}

function severityColor(sev: number) {
  if (sev >= 8) return '#FF3D3D';
  if (sev >= 5) return '#FF9800';
  if (sev >= 3) return '#FFD740';
  return '#00E676';
}

function frpBarWidth(frp: number, maxFrp: number) {
  if (maxFrp === 0) return 0;
  return Math.max(8, (frp / maxFrp) * 100);
}

function formatLatLon(lat: number, lon: number) {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(3)}°${latDir} · ${Math.abs(lon).toFixed(3)}°${lonDir}`;
}

function confidenceLabel(c: string) {
  switch (c?.toLowerCase()) {
    case 'h': return 'HIGH';
    case 'n': return 'NOMINAL';
    case 'l': return 'LOW';
    default: return (c || '—').toUpperCase();
  }
}

export default function FiresPanel({ fires, selectedFireId, onFireSelect }: FiresPanelProps) {
  const maxFrp = Math.max(...fires.map(f => f.frp_mw), 1);

  return (
    <div className="fires-panel">
      <div className="fires-list">
        {fires.map((fire, index) => {
          const selected = fire.id === selectedFireId;
          const color = severityColor(fire.severity);
          return (
            <div
              key={fire.id}
              className={`fire-card ${selected ? 'selected' : ''}`}
              style={{
                animationDelay: `${index * 80}ms`,
                borderColor: selected ? color : 'var(--border-panel)',
              }}
              onClick={() => onFireSelect(fire.id, {
                id: fire.id,
                name: fire.place_name || fire.name,
                label: 'Hazard',
                severity: fire.severity,
              })}
            >
              <div className="fire-card-header">
                <div className="fire-card-name">
                  {fire.place_name || fire.name}
                </div>
                <div className="fire-card-region">{fire.region}</div>
              </div>

              <div className="fire-card-body">
                <div className="fire-card-grid">
                  <div className="fire-card-stat">
                    <span className="fire-stat-label">FRP</span>
                    <span className="fire-stat-value" style={{ color }}>{fire.frp_mw.toFixed(1)} MW</span>
                  </div>
                  <div className="fire-card-stat">
                    <span className="fire-stat-label">SEVERITY</span>
                    <span className="fire-stat-value" style={{ color }}>{fire.severity}/10</span>
                  </div>
                  <div className="fire-card-stat">
                    <span className="fire-stat-label">BRIGHTNESS</span>
                    <span className="fire-stat-value">{fire.brightness?.toFixed(1) || '—'} K</span>
                  </div>
                  <div className="fire-card-stat">
                    <span className="fire-stat-label">CONFIDENCE</span>
                    <span className="fire-stat-value">{confidenceLabel(fire.confidence)}</span>
                  </div>
                </div>

                <div className="fire-card-frp-bar">
                  <div className="fire-frp-track">
                    <div
                      className="fire-frp-fill"
                      style={{
                        width: `${frpBarWidth(fire.frp_mw, maxFrp)}%`,
                        background: `linear-gradient(90deg, ${color}88, ${color})`,
                      }}
                    />
                  </div>
                </div>

                <div className="fire-card-meta">
                  <div className="fire-meta-row">
                    <span className="fire-meta-key">COORDINATES</span>
                    <span className="fire-meta-val">{formatLatLon(fire.lat, fire.lon)}</span>
                  </div>
                  <div className="fire-meta-row">
                    <span className="fire-meta-key">ACQUIRED</span>
                    <span className="fire-meta-val">{fire.acq_date} {fire.acq_time || ''}</span>
                  </div>
                  {fire.satellite && (
                    <div className="fire-meta-row">
                      <span className="fire-meta-key">SATELLITE</span>
                      <span className="fire-meta-val">{fire.satellite === 'N' ? 'Suomi NPP (VIIRS)' : fire.satellite === 'J' ? 'NOAA-20 (VIIRS)' : fire.satellite}</span>
                    </div>
                  )}
                  <div className="fire-meta-row">
                    <span className="fire-meta-key">FIRE ID</span>
                    <span className="fire-meta-val fire-meta-id">{fire.id}</span>
                  </div>
                </div>
              </div>

              {selected && (
                <div className="fire-card-selected-indicator" style={{ background: color }}>
                  <span>SELECTED — READY FOR CASCADE SYNTHESIS</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
