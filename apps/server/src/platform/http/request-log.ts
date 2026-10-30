/** What the log says of a request, as Fastify hands it to its serializer. */
interface LoggedRequest {
  method: string;
  url: string;
  host: string;
  ip: string;
  socket?: { remotePort?: number | undefined } | undefined;
}

/**
 * A request as the log says it: its path, never its query, where a service calling a plugin may
 * put its token and a person their search.
 */
export function requestForLog(request: LoggedRequest) {
  const port = request.socket?.remotePort;
  return {
    method: request.method,
    url: request.url.replace(/\?.*$/su, ''),
    host: request.host,
    remoteAddress: request.ip,
    ...(port === undefined ? {} : { remotePort: port }),
  };
}
