// Async loader hooks are available on the declared minimum Node 22.13.
// Only this presentation test registers the project's TypeScript aliases.
export function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const suffix = specifier.endsWith('.mjs') ? '' : '.ts';
    return next(new URL('../../' + specifier.slice(2) + suffix, import.meta.url).href, context);
  }
  if (specifier === '../step8a/database') {
    return next(new URL('../../lib/step8a/database.ts', import.meta.url).href, context);
  }
  return next(specifier, context);
}
