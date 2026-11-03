// Helper for Promise types
export type Await<T> = T extends PromiseLike<infer U> ? U : T;
