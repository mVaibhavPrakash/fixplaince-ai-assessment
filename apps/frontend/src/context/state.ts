export interface Remote<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
}
export const errorMessage = (error: unknown) =>
    error instanceof Error ? error.message : 'Something went wrong. Try again.';
