/** Thrown by every stub method until its real implementation is dropped in. */
export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`${method} is not yet implemented`)
    this.name = 'NotImplementedError'
  }
}
