type Meta = Record<string, unknown>;

function format(level: string, message: string, meta?: Meta) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...meta
  });
}

export const logger = {
  info(message: string, meta?: Meta) {
    console.log(format("info", message, meta));
  },
  warn(message: string, meta?: Meta) {
    console.warn(format("warn", message, meta));
  },
  error(message: string, meta?: Meta) {
    console.error(format("error", message, meta));
  }
};
