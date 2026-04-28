import { useState, useRef, useEffect, memo, type KeyboardEvent } from 'react';

type InputState = 'idle' | 'correct' | 'fuzzy' | 'wrong';

interface InputBarProps {
  onSubmit: (value: string) => void;
  promptType: 'country' | 'capital';
  disabled?: boolean;
  inputState: InputState;
  onStateReset: () => void;
}

export const InputBar = memo(function InputBar({ onSubmit, promptType, disabled, inputState, onStateReset }: InputBarProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  useEffect(() => {
    if (inputState === 'correct' || inputState === 'fuzzy') {
      setValue('');
      setTimeout(() => {
        onStateReset();
        inputRef.current?.focus();
      }, 350);
    } else if (inputState === 'wrong') {
      setValue('');
      setTimeout(() => {
        onStateReset();
        inputRef.current?.focus();
      }, 1800);
    }
  }, [inputState, onStateReset]);

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  }

  const borderColor =
    inputState === 'correct' ? 'border-leaf-500 ring-2 ring-leaf-200' :
    inputState === 'fuzzy'   ? 'border-leaf-400 ring-2 ring-leaf-100' :
    inputState === 'wrong'   ? 'border-red-500 ring-2 ring-red-100' :
    'border-bark-300 focus-within:border-leaf-400 focus-within:ring-2 focus-within:ring-leaf-100';

  const placeholder = promptType === 'country' ? 'Type the country name…' : 'Type the capital city…';

  return (
    <div className={`
      flex items-center gap-2 bg-bark-50 rounded-xl border-2 transition-all duration-200
      ${borderColor} ${inputState === 'wrong' ? 'animate-shake' : ''}
    `}>
      <span className="pl-4 text-bark-400 text-xl select-none">
        {promptType === 'country' ? '🗺' : '🏛'}
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKey}
        disabled={disabled}
        placeholder={placeholder}
        className="flex-1 bg-transparent py-4 pr-4 text-bark-800 placeholder-bark-300 font-dm text-lg outline-none disabled:opacity-50"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {value.trim() && !disabled && (
        <button
          onClick={() => { const t = value.trim(); if (t) onSubmit(t); }}
          className="mr-3 bg-leaf-500 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-leaf-600 transition-colors font-dm"
        >
          Enter ↵
        </button>
      )}
    </div>
  );
});
