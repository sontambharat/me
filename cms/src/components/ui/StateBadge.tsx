export function StateBadge({ state }: { state: string }) {
  return <span className={`chip border-transparent state-${state}`}>{state.replace('_', ' ')}</span>;
}
