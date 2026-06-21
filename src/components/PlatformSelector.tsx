import type { Platform } from '../types';

interface PlatformOption {
  value: Platform;
  label: string;
  color: string;
  logo: string;
}

const PLATFORMS: PlatformOption[] = [
  { value: 'Netflix', label: 'Netflix', color: '#E50914', logo: 'N' },
  { value: 'Prime Video', label: 'Prime Video', color: '#00A8E1', logo: 'P' },
  { value: 'Disney+', label: 'Disney+', color: '#113CCF', logo: 'D+' },
  { value: 'Canal+', label: 'Canal+', color: '#000000', logo: 'C+' },
  { value: 'any', label: 'Peu importe', color: '#6B7280', logo: '∞' },
];

interface Props {
  selected: Platform[];
  onToggle: (platform: Platform) => void;
}

export function PlatformSelector({ selected, onToggle }: Props) {
  return (
    <div className="step-container">
      <div className="step-header">
        <h2 className="step-question">Tu as quelles plateformes ?</h2>
        <p className="step-subtitle">Plusieurs choix possibles</p>
      </div>
      <div className="platform-grid">
        {PLATFORMS.map((p) => {
          const isSelected = selected.includes(p.value);
          return (
            <button
              key={p.value}
              className={`platform-btn ${isSelected ? 'selected' : ''}`}
              onClick={() => onToggle(p.value)}
              style={isSelected ? { borderColor: p.color, boxShadow: `0 0 0 2px ${p.color}40` } : {}}
            >
              <span
                className="platform-logo"
                style={{ background: p.color }}
              >
                {p.logo}
              </span>
              <span className="platform-label">{p.label}</span>
              {isSelected && <span className="platform-check">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
