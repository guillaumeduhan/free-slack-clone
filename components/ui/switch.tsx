/** Pill toggle from the design (sizes: 36×20 in dialogs, 38×22 in settings). */
export function Switch({ on, size = 'md' }: { on: boolean; size?: 'sm' | 'md' }) {
  const [w, h, k] = size === 'sm' ? [36, 20, 16] : [38, 22, 18];
  return (
    <div className="flex flex-none rounded-full p-0.5" style={{ width: w, height: h, background: on ? 'var(--accent)' : 'var(--line3)', justifyContent: on ? 'flex-end' : 'flex-start' }}>
      <div className="rounded-full bg-white" style={{ width: k, height: k }} />
    </div>
  );
}
