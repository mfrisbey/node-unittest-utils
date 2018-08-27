import {MockIncomingMessage} from './mock-incoming-message';
import URL from 'url';
import mime from 'mime';

/**
 * Implementation of a simple "mock" http server that stores data in memory and provides hooks into specific stages
 * of the http request/response lifecycle.
 *
 * setRequestCallback() allows consumers to plug into and influence every request sent to the server. registerUrl()
 * provides a similar function, but at an individual URL level.
 *
 * The server also tracks each request sent to it, and provides methods for retrieving that information. For example,
 * getRequestedUrlCount() reports how many times a given URL was requested.
 */
export class HttpServer {

  static DESTINATION_HEADER = 'X-Destination';

  /**
   * Initializes an empty server.
   */
  constructor() {
    this.resetState();
  }

  /**
   * Resets the server's state, including clearing out all registered URLs, callbacks, data,
   * and requested urls.
   */
  resetState() {
    this.registeredUrls = {};
    this.urlData = {};
    this.requestCallback = (options, callback) => {callback()};
    this.requestedUrls = {};
    this.chunkData = {};
  }

  /**
   * Sets the callback to be invoked for _every_ request that goes through the server.
   * @param {function} callback Will be invoked with request data.
   * @param {object} callback.options Request options that were submitted with the request. This will include such things as the URL and headers.
   * @param {function} callback.done Should be invoked when custom processing of the request is complete.
   * @param {string} [callback.done.err] If truthy, the server will generate a request error.
   * @param {object} [callback.done.requestOptions] If specified, the request's options will used as the request options used throughout the rest of the request/response lifecycle.
   * @param {object} [callback.done.responseOptions] If specified, will be used as the response's options, including such things as statusCode and headers.
   * @param {string} [callback.done.responseBody] If specified, will be used as the response's body.
   */
  setRequestCallback(callback) {
    this.requestCallback = callback;
  }

  /**
   * Sets the callback to be invoked when a request with a specified method is sent to a specified url.
   * @param {string} method An HTTP method.
   * @param {string} url Full HTTP URL.
   * @param {function} callback Will be invoked with request data.
   * @param {object} callback.options Request options that were submitted with the request. This will include such things as the URL and headers.
   * @param {function} callback.done Should be invoked when custom processing of the request is complete.
   * @param {string} [callback.done.err] If truthy, the server will generate a request error.
   * @param {object} [callback.done.responseOptions] If specified, will be used as the response's options, including such things as statusCode and headers.
   * @param {string} [callback.done.responseBody] If specified, will be used as the response's body.
   */
  registerUrl(method, url, callback) {
    if (!this.registeredUrls[method]) {
      this.registeredUrls[method] = {};
    }
    this.registeredUrls[method][_getUrlDataKey(url)] = callback;
  }

  /**
   * Removes the callback associated with a specified method/url combination.
   * @param {string} method An HTTP method.
   * @param {string} url Full HTTP URL.
   */
  unregisterUrl(method, url) {
    if (this.isUrlRegistered(method, url)) {
      delete this.registeredUrls[method][_getUrlDataKey(url)];
    }
  }

  /**
   * Returns a value indicating whether or not a given method/url combination has been registered with registerUrl().
   * @param {string} method An HTTP method.
   * @param {string} url Full HTTP URL.
   * @returns {boolean} True if the url is registered, false otherwise.
   */
  isUrlRegistered(method, url) {
    if (this.registeredUrls[method]) {
      return this.registeredUrls[method][_getUrlDataKey(url)];
    }
    return false;
  }

  /**
   * Sets the default request options and data that will be returned by the server when a GET/HEAD request is sent to a URL.
   * @param {string} url Full HTTP URL.
   * @param {object} requestOptions The options for the request that created the url data.
   * @param {object} responseOptions Will be used as the response's options, including such things as statusCode and headers.
   * @param {string|Buffer} responseBody Will be used as the response's body.
   */
  setUrlData(url, requestOptions={}, responseOptions={}, responseBody='') {
    if (responseBody) {
      if (!Buffer.isBuffer(responseBody)) {
        responseBody = Buffer.from(responseBody);
      }
    } else {
      responseBody = Buffer.alloc(0);
    }
    this.urlData[_getUrlDataKey(url)] = {responseOptions, responseBody};
  }

  /**
   * Returns a value indicating whether default values have been specified for a URL.
   * @param {string} url Full HTTP URL.
   * @returns {boolean} True if the url has default data, otherwise false.
   */
  urlExists(url) {
    return !!this.urlData[_getUrlDataKey(url)];
  }

  /**
   * Retrieves the default response options for a given url.
   * @param {string} url Full HTTP URL.
   * @returns {object} Response options, or null if the url has no default data.
   */
  getUrlResponseOptions(url) {
    const key = _getUrlDataKey(url);
    return this.urlData[key] ? this.urlData[key].responseOptions : null;
  }

  /**
   * Retrieves the default response body for a given url.
   * @param {string} url Full HTTP URL.
   * @returns {Buffer} Response body, or null if the url has no default data.
   */
  getUrlResponseBody(url) {
    const key = _getUrlDataKey(url);
    return this.urlData[key] ? this.urlData[key].responseBody : null;
  }

  /**
   * Deletes the default response data for a given url.
   * @param {string} url Full HTTP URL.
   */
  deleteUrlData(url) {
    const key = _getUrlDataKey(url);
    if (this.urlData[key]) {
      delete this.urlData[key];
    }
  }

  /**
   * Moves the default response data for a given url to a different url.
   * @param {string} sourceUrl URL whose default dat will be moved.
   * @param {string} targetUrl URL where the data will be moved.
   */
  moveUrl(sourceUrl, targetUrl) {

    function _isChildUrl(parent, child) {
      return child.startsWith(`${parent}/`);
    }

    function _getNewUrl(oldParent, newParent, child) {
      return `${newParent}${child.substr(oldParent.length)}`
    }

    if (this.urlExists(sourceUrl)) {
      this.setUrlData(targetUrl, {}, this.getUrlResponseOptions(sourceUrl), this.getUrlResponseBody(sourceUrl));
      this.deleteUrlData(sourceUrl);

      Object.keys(this.urlData).forEach(url => {
        if (_isChildUrl(sourceUrl, url)) {
          this.setUrlData(_getNewUrl(sourceUrl, targetUrl, url), this.getUrlResponseOptions(url), this.getUrlResponseBody(url));
          this.deleteUrlData(url);
        }
      });
      Object.keys(this.registeredUrls).forEach(method => {
        Object.keys(this.registeredUrls[method]).forEach(url => {
          if (_isChildUrl(sourceUrl, url)) {
            this.registerUrl(method, _getNewUrl(sourceUrl, targetUrl, url), this.registeredUrls[method][url]);
            this.unregisterUrl(method, url);
          }
        });
      });
    }
  }

  /**
   * Given request data, creates a response to the request.
   * @param {object} options Request options that were submitted with the request. This will include such things as the URL and headers.
   * @param {string} requestBody Body data that was submitted with the request.
   * @param {function} callback Invoked with the server's response.
   * @param {string} callback.err Truthy if the server encountered an error trying to generate the response.
   * @param {MockIncomingMessage} callback.response The response as generated by the server.
   */
  getResponse(options, requestBody, callback) {
    options.method = options.method || 'GET';
    const self = this;
    const {ignoreCount=false} = options;

    process.nextTick(() => {
      self.requestCallback(options, (err, requestOptions, responseOptions, responseBody) => {
        if (!requestOptions) {
          requestOptions = options;
        }

        if (responseBody) {
          if (!Buffer.isBuffer(responseBody)) {
            responseBody = Buffer.from(responseBody);
          }
        }

        const {url, method} = requestOptions;

        if (!ignoreCount) {
          if (!self.requestedUrls[method]) {
            self.requestedUrls[method] = {};
          }
          if (!self.requestedUrls[method][url]) {
            self.requestedUrls[method][url] = [];
          }
          self.requestedUrls[method][url].push(options);
        }

        const urlCallback = self.registeredUrls[method] ? self.registeredUrls[method][_getUrlDataKey(url)] : undefined;

        if (err) {
          callback(err);
        } else if (responseOptions) {
          callback(null, new MockIncomingMessage(responseOptions, responseBody));
        } else if (urlCallback) {
          urlCallback(requestOptions, (err, responseOptions, responseBody) => {
            if (err) {
              callback(err);
              return;
            }
            callback(null, new MockIncomingMessage(responseOptions, responseBody));
          });
        } else if (method === 'GET' || method === 'HEAD') {
          _getGetResponse.call(self, callback, requestOptions, responseBody, method === 'GET');
        } else if (method === 'DELETE') {
          _getDeleteResponse.call(self, callback, requestOptions, responseBody);
        } else if (method === 'POST') {
          _getPostResponse.call(self, callback, requestOptions, responseBody, requestBody);
        } else if (method === 'PUT') {
          _getPutResponse.call(self, callback, requestOptions, responseBody, requestBody);
        } else if (method === 'MOVE') {
          _getMoveResponse.call(self, callback, requestOptions, responseBody);
        } else {
          callback(null, new MockIncomingMessage({}));
        }
      });
    });
  }

  /**
   * Prints all default URL data (as specified via setUrlData()) to console.
   */
  printAllData() {
    console.log(`***** URL DATA *****`);
    console.log('');
    for (const url in this.urlData) {
      console.log(`- ${url}`);
      console.log(`  options: ${JSON.stringify(this.getUrlResponseOptions(url))}`);
      console.log(`  content: "${this.getUrlResponseBody(url).toString('utf8')}"`);
      console.log('');
    }
    console.log(`***** END URL DATA *****`);
    console.log('');
  }

  /**
   * Prints all URLs that have been requested and processed by the server.
   */
  printAllRequestedUrls() {
    console.log('***** REQUESTED URLS *****');
    console.log('');
    Object.keys(this.requestedUrls).forEach(method => {
      console.log(`----- ${method} -----`);
      Object.keys(this.requestedUrls[method]).forEach(url => {
        console.log(`- ${url}`);
        for (let i = 0; i < this.requestedUrls[method][url].length; i++) {
          console.log(`   ${JSON.stringify(this.requestedUrls[method][url][i])}`);
        }
      });
      console.log('');
    });
    console.log(`***** END REQUESTED URLS *****`);
    console.log('');
  }

  /**
   * Prints all URLs that have had a custom callback registered.
   */
  printAllRegisteredUrls() {
    console.log('***** REGISTERED URLS *****');
    console.log('');
    Object.keys(this.registeredUrls).forEach(method => {
      console.log(`----- ${method} -----`);
      Object.keys(this.registeredUrls[method]).forEach(url => {
        console.log(`- ${url}`);
      });
      console.log('');
    });
    console.log('***** END REGISTERED URLS *****');
    console.log('');
  }

  /**
   * Retrieves the number of times that a given method was requested of a specified url.
   * @param {string} method An HTTP method.
   * @param {string} url A full HTTP URL.
   * @returns {number} The number of times the given URL was requested.
   */
  getRequestedUrlCount(method, url) {
    if (this.requestedUrls[method]) {
      if (this.requestedUrls[method][url]) {
        return this.requestedUrls[method][url].length;
      }
    }
    return 0;
  }

  /**
   * Retrieves the request options that were submitted with a request to a given url.
   * @param {string} method An HTTP method.
   * @param {string} url A full HTTP URL.
   * @param {number} [index] If specified, the index of the request to retrieve. If not specified, the method will return the most recent request's data.
   * @returns {object} The request options supplied with an http request. Null if no requests were found or if the index is out of range.
   */
  getRequestedUrlOptions(method, url, index=-1) {
    if (this.requestedUrls[method]) {
      if (this.requestedUrls[method][url]) {
        const options = this.requestedUrls[method][url];
        if (index < 0 && options.length) {
          return options[options.length - 1];
        } else if (index >= 0 && index < options.length) {
          return options[index];
        }
      }
    }
    return null;
  }

  /**
   * Given request options from a MOVE request, retrieves the full destination URL target of the move.
   * @param {object} [options] HTTP request options.
   * @returns {string} The destination of a MOVE operation.
   */
  static getDestinationUrl(options) {
    const {url, headers} = options;
    const parsedSource = URL.parse(url);
    let parsedDest = URL.parse(headers[HttpServer.DESTINATION_HEADER]);

    if (!parsedDest.pathname) {
      throw 'destination path must be specified';
    }

    return `${parsedSource.protocol}//${parsedSource.host}${parsedDest.pathname}`;
  }
}

/**
 * Retrieves the key to use for a url.
 * @param {string} url URL to process.
 * @returns {string} A url key.
 * @private
 */
function _getUrlDataKey(url) {
  const parsed = URL.parse(url);
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
}

/**
 * Retrieves a value indicating whether a given URL exists in the server.
 * @param {string} url A full HTTP URL.
 * @param {function} callback Invoked with the result.
 * @param {boolean} callback.err Truthy if there were errors during the operation.
 * @param {string} callback.exists True if the URL exists, otherwise false.
 * @private
 */
function _urlExists(url, callback) {
  this.getResponse({url, ignoreCount: true}, '', (err, res) => {
    if (err) {
      callback(err);
      return;
    }
    if (res.statusCode === 200 && !this.urlExists(url)) {
      callback('not supported: cannot perform operations on a registered url');
      return;
    }
    callback(null, res.statusCode === 200);
  });
}

/**
 * Creates a new instance of a server response.
 * @param {number} statusCode The status code of the response.
 * @param {object} [headers] Headers of the response.
 * @param {Buffer} [body] Body content of the response.
 * @param {Buffer|string} [fallbackBody] Body content of the response if body parameter is falsy.
 * @returns {MockIncomingMessage} The newly created response instance.
 * @private
 */
function _createResponse(statusCode, headers={}, body, fallbackBody=null) {
  if (fallbackBody) {
    if (!Buffer.isBuffer(fallbackBody)) {
      fallbackBody = Buffer.from(fallbackBody);
    }
  }
  return new MockIncomingMessage({statusCode, headers}, body || fallbackBody);
}

/**
 * Retrieves the response to a GET request.
 * @param {function} callback Invoked with the response.
 * @param {string} callback.err Truthy if there were errors creating the response.
 * @param {MockIncomingMessage} callback.response The server's response.
 * @param {object} options Request options that were submitted with the request.
 * @param {Buffer} [responseBody] If specified, the body content to use in place of the server's default body.
 * @param {boolean} [includeBody] If true, includes the response body in the response. Otherwise only includes headers.
 * @private
 */
function _getGetResponse(callback, {url, headers={}}, responseBody=null, includeBody=true) {
  if (this.urlExists(url)) {
    let startByte = null;
    let endByte = null;
    let statusCode = 200;
    if (headers.range) {
      //options.headers.range = 'bytes=' + currChunk + '-' + endChunk;
      const regex = new RegExp('^bytes=([0-9]+)-([0-9]+)$', 'g');
      const match = regex.exec(headers.range);
      if (match) {
        startByte = parseInt(match[1], 10);
        endByte = parseInt(match[2], 10);
      } else {
        callback(null, _createResponse(400, {}, responseBody, 'unsupported range header'));
        return;
      }
    }
    let urlContent = responseBody || this.getUrlResponseBody(url);

    if (endByte) {
      if (startByte >= endByte || startByte < 0 || endByte < 0 || (endByte + 1) >= urlContent.length) {
        _createResponse(400, {}, responseBody, 'byte range is out of range');
        return;
      }

      statusCode = 206;

      const partialBuffer = Buffer.alloc(endByte - startByte + 1);
      urlContent.copy(partialBuffer, 0, startByte, endByte + 1);
      urlContent = partialBuffer;
    }

    callback(null, _createResponse(statusCode, {
      'Content-Type': mime.getType(url),
      'Content-Length': urlContent.length
    }, urlContent));
  } else {
    callback(null, _createResponse(404));
  }
}

/**
 * Retrieves the response to a DELETE request.
 * @param {function} callback Invoked with the response.
 * @param {string} callback.err Truthy if there were errors creating the response.
 * @param {MockIncomingMessage} callback.response The server's response.
 * @param {object} options Request options that were submitted with the request.
 * @param {Buffer} [responseBody] If specified, the body content to use in place of the server's default body.
 * @private
 */
function _getDeleteResponse(callback, {url}, responseBody=null) {
  _urlExists.call(this, url, (err, exists) => {
    if (err) {
      callback(err);
      return;
    }
    if (exists) {
      this.deleteUrlData(url);
      callback(null, _createResponse(200, {}, responseBody, 'path deleted'));
    } else {
      callback(null, _createResponse(404, {}, responseBody, `path to delete not found: ${url}`));
    }
  });
}

/**
 * Retrieves the response to a POST request.
 * @param {function} callback Invoked with the response.
 * @param {string} callback.err Truthy if there were errors creating the response.
 * @param {MockIncomingMessage} callback.response The server's response.
 * @param {object} options Request options that were submitted with the request.
 * @param {Buffer} [responseBody] If specified, the body content to use in place of the server's default body.
 * @param {string} [requestBody] If specified, the body content that was sent with the request.
 * @private
 */
function _getPostResponse(callback, options, responseBody=null, requestBody='') {
  const self = this;
  const {url, form=null} = options;
  const parent = url.substr(0, url.lastIndexOf('/'));

  function _getUrlExists(cb) {
    const parsedParent = URL.parse(parent);
    if (!parsedParent.pathname || parsedParent.pathname === '/') {
      // posting to root URL is always possible
      cb(null, true);
      return;
    }
    _urlExists.call(self, parent, cb);
  }

  _getUrlExists((err, exists) => {
    if (err) {
      callback(err);
      return;
    }

    if (!exists) {
      callback(null, _createResponse(404, {}, responseBody, 'parent not found'));
      return;
    }

    _urlExists.call(this, url, (err, exists) => {
      if (err) {
        callback(err);
        return;
      }
      if (exists) {
        callback(null, _createResponse(409, {}, responseBody, 'conflict: already exists'));
      } else {
        let fileOffset = 0;
        let chunkLength = 0;
        let fileLength = 0;
        if (form) {
          fileOffset = form['file@Offset'];
          chunkLength = form['chunk@Length'];
          fileLength = form['file@Length'];
        }

        if (chunkLength) {
          if (!this.chunkData[url]) {
            this.chunkData[url] = {content: Buffer.alloc(fileLength), currOffset: 0};
          }

          const currChunk = Buffer.from(requestBody);
          let {content, currOffset} = this.chunkData[url];

          if (!fileOffset) {
            fileOffset = currOffset;
          }

          if (fileOffset < 0 || fileOffset >= content.length || chunkLength != requestBody.length) {
            callback(null, _createResponse(400, {}, responseBody, 'chunk information is not valid'));
            return;
          }
          currChunk.copy(content, currOffset);
          currOffset += chunkLength;
          this.chunkData[url].currOffset = currOffset;

          if (currOffset >= fileLength) {
            this.setUrlData(url, options, {}, content.toString());
            delete this.chunkData[url];
          }

          callback(null, _createResponse(200, {}, responseBody, 'chunk uploaded'));
        } else {
          this.setUrlData(url, options, {}, requestBody);
          callback(null, _createResponse(201, {}, responseBody, 'path created'));
        }
      }
    });
  });
}

/**
 * Retrieves the response to a PUT request.
 * @param {function} callback Invoked with the response.
 * @param {string} callback.err Truthy if there were errors creating the response.
 * @param {MockIncomingMessage} callback.response The server's response.
 * @param {object} options Request options that were submitted with the request.
 * @param {Buffer} [responseBody] If specified, the body content to use in place of the server's default body.
 * @param {string} [requestBody] If specified, the body content that was sent with the request.
 * @private
 */
function _getPutResponse(callback, options, responseBody=null, requestBody='') {
  const {url} = options;
  _urlExists.call(this, url, (err, exists) => {
    if (err) {
      callback(err);
      return;
    }
    if (!exists) {
      callback(null, _createResponse(404, {}, responseBody, 'path to update not found'));
    } else {
      this.setUrlData(url, options, {}, requestBody);
      callback(null, _createResponse(200, {}, responseBody, 'path updated'));
    }
  });
}

/**
 * Retrieves the response to a MOVE request.
 * @param {function} callback Invoked with the response.
 * @param {string} callback.err Truthy if there were errors creating the response.
 * @param {MockIncomingMessage} callback.response The server's response.
 * @param {object} options Request options that were submitted with the request.
 * @param {Buffer} [responseBody] If specified, the body content to use in place of the server's default body.
 * @private
 */
function _getMoveResponse(callback, options, responseBody=null) {
  const {url, headers={}} = options;
  let destUrl;

  try {
    destUrl = HttpServer.getDestinationUrl(options);
  } catch (e) {
    callback(null, _createResponse(400, {}, responseBody, e.toString()));
    return;
  }

  _urlExists.call(this, url, (err, exists) => {
    if (err) {
      callback(err);
      return;
    }

    if (!exists) {
      callback(null, _createResponse(404, {}, responseBody, 'source path not found'));
      return;
    }

    _urlExists.call(this, destUrl, (err, exists) => {
      if (err) {
        callback(err);
        return;
      }
      if (exists) {
        callback(null, _createResponse(409, {}, responseBody, 'destination path already exists'));
        return;
      }
      this.moveUrl(url, destUrl);
      callback(null, _createResponse(201, {}, responseBody, 'move completed'));
    });
  });
}
