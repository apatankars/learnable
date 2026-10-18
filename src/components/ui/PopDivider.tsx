const DOTS = ['#ff5a5f', '#ffd23f', '#7ed957', '#5cc3f5', '#c78bff'];

// Row of candy dots — the divider that replaces the old botanical flourish.
export function PopDivider() {
  return (
    <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {DOTS.map((color) => (
        <span
          key={color}
          style={{
            width: 11,
            height: 11,
            borderRadius: '50%',
            background: color,
            border: '2px solid var(--ink)',
          }}
        />
      ))}
    </div>
  );
}
