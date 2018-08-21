import {WritableStreamBuffer} from 'stream-buffers';

/**
 * Mock implementation of a Writable stream. Simply stores all written data in memory.
 */
export class MockWritableStream extends WritableStreamBuffer {

  /**
   * Initializes a new stream that will read the specified data.
   * @param {string} [data] Data to be read.
   */
  constructor() {
    super();

    this.writeCallback = (chunk, encoding, callback) => true;
  }

  /**
   * Specifies a callback that will be invoked each time the stream writes data.
   * @param {function} callback Called before the stream writes data. Should return a value indicating whether or not the write should continue.
   */
  registerWriteCallback(callback) {
    this.writeCallback = callback;
  }

  /**
   * Retrieves the stream's current content as a string.
   * @returns {string} The stream's written content.
   */
  getContent() {
    return this.getContentsAsString('utf8');
  }

  /**
   * Overridden to call the registered write callback.
   * @private
   */
  _write() {
    const proceed = this.writeCallback.apply(null, arguments);

    if (proceed) {
      super._write.apply(this, arguments);
    }
  }
}
