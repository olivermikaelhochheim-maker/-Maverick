/** Errors that are safe to show to Oliver. Anything else is shown as a generic failure. */
export class UserFacingError extends Error {
  /** Marker that survives being bundled twice (instanceof doesn't across bundles). */
  readonly userFacing = true;
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "UserFacingError";
  }
}

export class BudgetExceededError extends UserFacingError {
  constructor(message: string) {
    super(message, "budget_exceeded", 402);
    this.name = "BudgetExceededError";
  }
}

/** True for a UserFacingError from any copy of this module. */
export function isUserFacing(err: unknown): err is UserFacingError {
  return err instanceof UserFacingError || (typeof err === "object" && err !== null && (err as { userFacing?: unknown }).userFacing === true);
}
