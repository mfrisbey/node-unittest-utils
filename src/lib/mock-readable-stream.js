import {ReadableStreamBuffer} from 'stream-buffers';

/**
 * Mock implementation of a Readable stream. Allows data to be specified up-front and simply stores it in memory.
 */
export class MockReadableStream extends ReadableStreamBuffer {

  /**
   * Initializes a new stream that will read the specified data.
   * @param {string} [data] Data to be read.
   */
  constructor(data='') {
    super();

    this.readCallback = () => true;

    if (data) {
      this.put(data);
    }

    this.stop();
  }

  /**
   * Specifies a callback that will be invoked each time the stream reads data.
   * @param {function} callback Called before the stream reads data. Should return a value indicating whether or not the read should continue.
   */
  registerReadCallback(callback) {
    this.readCallback = callback;
  }

  /**
   * Overridden to call the mock's read callback.
   * @private
   */
  _read() {
    const proceed = this.readCallback.apply(null, arguments);

    if (proceed) {
      super._read.apply(this, arguments);
    }
  }
}
