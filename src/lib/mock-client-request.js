import {MockWritableStream} from './mock-writable-stream';
import {HttpServer} from './http-server';

/**
 * Implementation of a mock http.ClientRequest. Note that the class doesn't inherit from http.ClientRequest, it simply
 * provides the same methods and events (so it can be used interchangeably). The mock implementation is a writable
 * stream that stores its data in memory.
 */
export class MockClientRequest extends MockWritableStream {

  /**
   * Initializes a new instance of a request.
   * @param {object} options The options submitted with the request.
   * @param {function} [responseCallback] If specified, will be invoked when a response to the request is available.
   * @param {string} [responseCallback.err] Truthy if there were errors processing the request.
   * @param {http.IncomingMessage} [responseCallback.res] The response to the request.
   * @param {string} [responseCallback.body] The body content of the response.
   * @param {HttpServer} [httpServer] If specified, the http server instance that the request will use to generate a response.
   */
  constructor(options, responseCallback, httpServer) {
    super();
    this.options = options;
    this.responseCallback = responseCallback;
    this.httpServer = httpServer;
    this.reqForm = null;
    this.ended = false;

    if (!this.httpServer) {
      this.httpServer = new HttpServer();
    }
  }

  /**
   * Overridden to do the work of generating a response to the request.
   */
  end(data, encoding, callback) {
    if (!this.ended) {
      this.ended = true;
      const self = this;
      if (data) {
        this.write(data, encoding);
      }
      const options = this.options;

      if (this.reqForm) {
        options.form = this.reqForm.data;
      }

      this.httpServer.getResponse(options, this.getContentsAsString(), (err, response) => {
        if (err) {
          self.emit('error', err);
          if (self.responseCallback) {
            self.responseCallback(err);
          }
          return;
        } else {
          response.on('end', () => {
            self.emit('end');
            super.end(null, null, callback);
          });

          self.emit('response', response);

          process.nextTick(() => {
            const dummyStream = new MockWritableStream();
            response.pipe(dummyStream);
          });
        }
        if (self.responseCallback) {
          self.responseCallback(err, response, response.getBodyAsString());
        }
      });
    }
  }

  /**
   * Overridden to prevent certain events from being sent.
   */
  emit() {
    const errorListeners = this.listenerCount('error');
    if (arguments[0] === 'error' && errorListeners === 0 && this.responseCallback) {
      // if a callback was specified, swallow the error emit so that the emitter doesn't throw an exception
      return;
    }
    if (arguments[0] === 'finish') {
      // client requests don't send finish event
      return;
    }
    super.emit.apply(this, arguments);
  }

  /**
   * Returns a new MockForm that is associated with the request.
   */
  form() {
    if (!this.reqForm) {
      this.reqForm = new MockForm(this);
    }
    return this.reqForm;
  }
}

class MockForm {

  constructor(req) {
    this.req = req;
    this.data = {};
  }

  append(name, value, options={}) {
    this.data[name] = value;
    if (value.pipe) {
      if (options.filename) {
        value.path = options.filename;
      }

      value.pipe(this.req)
    }
  }
}
