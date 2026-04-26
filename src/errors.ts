/** Thrown when the Phrony API returns a non-2xx/3xx response. */
export class PhronyAPIError extends Error {
  readonly name = "PhronyAPIError";

  constructor(
    readonly status: number,
    message: string,
    readonly path: string,
    /** Response body as text (often JSON) when available. */
    readonly body: string,
  ) {
    super(message);
  }
}
