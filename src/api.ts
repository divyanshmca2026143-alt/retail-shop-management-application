export async function callRetailApi<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/retail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await response.json();
  if (!response.ok || !json.ok) {
    throw new Error(json.error || 'Request failed');
  }
  return json.data as T;
}

export function formatINR(value: number): string {
  return `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
