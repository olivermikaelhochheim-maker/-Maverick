/** Errors that are safe to show to Oliver. Anything else is shown as a generic failure. */
export class UserFacingError extends Error {
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
