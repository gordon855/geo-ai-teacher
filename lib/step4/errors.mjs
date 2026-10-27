export class Step4Error extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "Step4Error";
    this.code = code;
    this.httpStatus = Number(options.httpStatus || 500);
    this.retryAfter = options.retryAfter == null ? null : Number(options.retryAfter);
    this.publicMessage = options.publicMessage || "问答服务暂时不可用，请稍后重试。";
  }
}

export function isStep4Error(value) {
  return value instanceof Step4Error;
}
