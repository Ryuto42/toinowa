export class AuthRequiredError extends Error {
  readonly status = 401;

  constructor(message = '認証が必要です') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;

  constructor(message = 'この操作を行う権限がありません') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export function authErrorResponse(error: unknown): Response {
  if (error instanceof AuthRequiredError || error instanceof ForbiddenError) {
    return Response.json(
      { error: error.name, message: error.message },
      { status: error.status },
    );
  }
  return Response.json(
    { error: 'internal_error', message: '認証処理に失敗しました' },
    { status: 500 },
  );
}
