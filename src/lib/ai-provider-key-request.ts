export function hasSameOrigin(request: Pick<Request, "headers">, expectedOrigin: string): boolean {
  return request.headers.get("Origin") === expectedOrigin;
}

export function hasConfirmedAiProviderKeyRemoval(entries: Iterable<[string, unknown]>): boolean {
  const values = [...entries];

  return values.length === 1 && values[0]?.[0] === "confirm" && values[0][1] === "true";
}
