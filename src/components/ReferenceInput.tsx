interface Props {
  value: string;
  onChange: (val: string) => void;
  onSkip: () => void;
}

export function ReferenceInput({ value, onChange, onSkip }: Props) {
  return (
    <div className="step-container">
      <div className="step-header">
        <span className="optional-badge">Optionnel</span>
        <h2 className="step-question">Tu as des références ?</h2>
        <p className="step-subtitle">
          1 à 3 films ou séries que tu as aimés pour affiner les recommandations
        </p>
      </div>
      <div className="reference-input-wrap">
        <textarea
          className="reference-textarea"
          placeholder="Dark, Interstellar, From…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
        <p className="reference-hint">
          Sépare les titres par des virgules ou sauts de ligne
        </p>
      </div>
      <div className="reference-actions">
        <button className="btn-skip" onClick={onSkip}>
          Passer cette étape →
        </button>
      </div>
    </div>
  );
}
