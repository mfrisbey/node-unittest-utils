import {MockReadableStream} from './mock-readable-stream';

/**
 * Implementation of a mock http.IncomingMessage. Note that the class doesn't inherit from http.IncomingMessage, it simply
 * provides the same methods and events (so it can be used interchangeably). The mock implementation is a readable
 * stream that stores its data in memory.
 */
export class MockIncomingMessage extends MockReadableStream {

  /**
   * Initializes a new instance of a response containing the given configuration.
   * @param {object} options Values to use as the response's data.
   * @param {number} [options.statusCode] The status code of the response.
   * @param {object} [options.headers] Headers to send with the response.
   * @param {Buffer} [body] Value to use as the response's body.
   */
  constructor({statusCode=501, headers={}}, body=null) {
    super(body);

    this.statusCode = statusCode;
    this.headers = headers;
    this.piping = false;
    this.body = body;
  }

  /**
   * Retrieves the response's body content.
   * @returns {Buffer} A response body.
   */
  getBody() {
    return this.body;
  }

  /**
   * Retrieves the response's body content as a utf8 string.
   * @returns {string} A response body.
   */
  getBodyAsString() {
    const body = this.getBody();
    return body ? this.getBody().toString() : '';
  }

  /**
   * Overridden to prevent multiple calls.
   */
  pipe() {
    if (!this.piping) {
      this.piping = true;
      super.pipe.apply(this, arguments);
    }
  }
}
