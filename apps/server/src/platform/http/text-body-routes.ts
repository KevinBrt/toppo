import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Registers routes whose body is text, kept whole as it came (JSON, a form, any text), for
     * what checks a signature of its very characters. Any other body answers 415.
     */
    textBodyRoutes(register: (routes: FastifyInstance) => void): void;
  }
}

/** The bodies a service signs: JSON, a form (GitHub's other choice), or text. */
const TEXT_TYPES = [['application/json', 'application/x-www-form-urlencoded'], /^text\//];

/** Lets features receive signed requests, through `app.textBodyRoutes`. */
export function registerTextBodyRoutes(app: FastifyInstance): void {
  app.decorate('textBodyRoutes', function textBodyRoutes(this: FastifyInstance, register) {
    void this.register((scope, _options, done) => {
      // No parsing here: JSON read and written again would no longer match its signature.
      scope.removeAllContentTypeParsers();
      for (const types of TEXT_TYPES) {
        scope.addContentTypeParser(types, { parseAs: 'string' }, (_request, body, parsed) =>
          parsed(null, body),
        );
      }
      register(scope);
      done();
    });
  });
}
