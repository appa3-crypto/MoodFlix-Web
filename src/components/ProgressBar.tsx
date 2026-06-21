import type { Step } from '../types';

const STEPS_FULL: Step[] = ['mood', 'type', 'duration', 'platform', 'references'];
const STEPS_SHORT: Step[] = ['mood', 'type', 'duration', 'references'];

interface Props {
  currentStep: Step;
  skipPlatform?: boolean;
}

export function ProgressBar({ currentStep, skipPlatform = false }: Props) {
  const steps = skipPlatform ? STEPS_SHORT : STEPS_FULL;
  const index = steps.indexOf(currentStep);
  if (index === -1) return null;
  const percent = ((index + 1) / steps.length) * 100;

  return (
    <div className="progress-bar-container">
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="progress-label">{index + 1} / {steps.length}</span>
    </div>
  );
}
