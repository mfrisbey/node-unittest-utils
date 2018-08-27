import {MockReadableStream} from './mock-readable-stream';
import {MockWritableStream} from './mock-writable-stream';

/**
 * Dummy stream that simply provides methods for passing through data.
 */
class PassThroughStream extends  MockReadableStream {
  constructor(data) {
    super(data);
  }

  end() {

  }
}

/**
 * Mock implementation of a stream. Note that the class doesn't inherit from Stream, it simply
 * provides the same methods and events (so it can be used interchangeably).
 */
export class MockStream {

  /**
   * Instantiates an empty stream.
   */
  constructor() {
  }

  static Readable = MockReadableStream;
  static Writable = MockWritableStream;
  static Stream = MockReadableStream;
  static PassThrough = PassThroughStream;
};
