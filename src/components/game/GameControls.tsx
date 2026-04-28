import { Button } from '../ui/Button';

interface GameControlsProps {
  phase: 'playing' | 'paused';
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onEndGame: () => void;
}

export function GameControls({ phase, onPause, onResume, onReset, onEndGame }: GameControlsProps) {
  return (
    <div className="flex items-center gap-2">
      {phase === 'playing' ? (
        <Button variant="secondary" size="sm" onClick={onPause} title="Pause">
          ⏸ Pause
        </Button>
      ) : (
        <Button variant="primary" size="sm" onClick={onResume} title="Resume">
          ▶ Resume
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={onReset} title="Reset game">
        ↺ Reset
      </Button>
      <Button variant="ghost" size="sm" onClick={onEndGame} title="End game early">
        ⏹ End
      </Button>
    </div>
  );
}
