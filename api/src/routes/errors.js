/**
 * An error a route throws on purpose: it carries the HTTP status and the
 * code the frontend translates. Never a sentence -- the panel owns wording,
 * and a message built here could carry a url or a token.
 */
export class RouteError extends Error {
  constructor(status, code) {
    super(code)
    this.name = 'RouteError'
    this.status = status
    this.code = code
  }
}

/** A settings payload that failed validation: every problem, as a path and a code. */
export class FieldErrors extends Error {
  constructor(errors) {
    super('INVALID_SETTINGS')
    this.name = 'FieldErrors'
    this.errors = errors
  }
}
