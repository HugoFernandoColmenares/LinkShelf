export class InvalidUrlError extends Error {
  constructor(message = 'URL ilegible') {
    super(message);
    this.name = 'InvalidUrlError';
  }
}

export class ResolveTimeoutError extends Error {
  constructor(message = 'Tiempo de espera agotado al resolver la URL') {
    super(message);
    this.name = 'ResolveTimeoutError';
  }
}
