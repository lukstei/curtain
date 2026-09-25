export function assertNever(x: never): never {
	throw new Error(`Never assertion failed: ${JSON.stringify(x)}`);
}
