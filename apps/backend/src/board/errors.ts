import { GraphQLError } from 'graphql';

export class ApiError extends GraphQLError {
    constructor(
        message: string,
        code: string,
        public readonly status = 400
    ) {
        super(message, { extensions: { code } });
    }
}
export const badInput = (message: string) => new ApiError(message, 'BAD_USER_INPUT');
export const unauthenticated = () =>
    new ApiError('A valid user and organization are required', 'UNAUTHENTICATED', 401);
export const forbidden = () => new ApiError('Access denied', 'FORBIDDEN', 403);
export const unavailable = () => new ApiError('Service unavailable', 'INTERNAL_SERVER_ERROR', 503);
