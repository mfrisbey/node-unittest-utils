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

  /**
   * Initializes an empty server.
   */
  constructor() {
    this.registeredUrls = {};
    this.urlData = {};
    this.requestCallback = (options, callback) => {callback()};
    this.requestedUrls = {};
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
    this.registeredUrls[method][url] = callback;
  }

  /**
   * Returns a value indicating whether or not a given method/url combination has been registered with registerUrl().
   * @param {string} method An HTTP method.
   * @param {string} url Full HTTP URL.
   * @returns {boolean} True if the url is registered, false otherwise.
   */
  isUrlRegistered(method, url) {
    if (this.requestedUrls[method]) {
      return !!this.registeredUrls[method][url];
    }
    return false;
  }

  /**
   * Sets the default request options and data that will be returned by the server when a GET/HEAD request is sent to a URL.
   * @param {string} url Full HTTP URL.
   * @param {object} responseOptions Will be used as the response's options, including such things as statusCode and headers.
   * @param {string} responseBody Will be used as the response's body.
   */
  setUrlData(url, responseOptions={}, responseBody='') {
    this.urlData[url] = {responseOptions, responseBody};
  }

  /**
   * Returns a value indicating whether default values have been specified for a URL.
   * @param {string} url Full HTTP URL.
   * @returns {boolean} True if the url has default data, otherwise false.
   */
  urlExists(url) {
    return !!this.urlData[url];
  }

  /**
   * Retrieves the default response options for a given url.
   * @param {string} url Full HTTP URL.
   * @returns {object} Response options, or null if the url has no default data.
   */
  getUrlResponseOptions(url) {
    return this.urlData[url] ? this.urlData[url].responseOptions : null;
  }

  /**
   * Retrieves the default response body for a given url.
   * @param {string} url Full HTTP URL.
   * @returns {string} Response body, or null if the url has no default data.
   */
  getUrlResponseBody(url) {
    return this.urlData[url] ? this.urlData[url].responseBody : null;
  }

  /**
   * Deletes the default response data for a given url.
   * @param {string} url Full HTTP URL.
   */
  deleteUrlData(url) {
    if (this.urlData[url]) {
      delete this.urlData[url];
    }
  }

  /**
   * Moves the default response data for a given url to a different url.
   * @param {string} sourceUrl URL whose default dat will be moved.
   * @param {string} targetUrl URL where the data will be moved.
   */
  moveUrl(sourceUrl, targetUrl) {
    if (this.urlExists(sourceUrl)) {
      this.setUrlData(targetUrl, this.getUrlResponseOptions(sourceUrl), this.getUrlResponseBody(sourceUrl));
      this.deleteUrlData(sourceUrl);
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
    const self = this;
    const {url, method='GET', ignoreCount=false} = options;
    const urlCallback = this.registeredUrls[method] ? this.registeredUrls[method][url] : undefined;

    this.requestCallback(options, (err, requestOptions, responseOptions, responseBody) => {
      if (!requestOptions) {
        requestOptions = options;
      }

      const requestedUrl = requestOptions.url;

      if (!ignoreCount) {
        if (!this.requestedUrls[method]) {
          this.requestedUrls[method] = {};
        }
        if (!this.requestedUrls[method][requestedUrl]) {
          this.requestedUrls[method][requestedUrl] = [];
        }
        this.requestedUrls[method][requestedUrl].push(requestOptions);
      }

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
      console.log(`  content: "${this.getUrlResponseBody(url)}"`);
      console.log('');
    }
    console.log(`***** END URL DATA *****`);
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
    });
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
 * @param {string} [body] Body content of the response.
 * @param {string} [fallbackBody] Body content of the response if body parameter is falsy.
 * @returns {MockIncomingMessage} The newly created response instance.
 * @private
 */
function _createResponse(statusCode, headers={}, body, fallbackBody='') {
  return new MockIncomingMessage({statusCode, headers}, body || fallbackBody);
}

/**
 * Retrieves the response to a GET request.
 * @param {function} callback Invoked with the response.
 * @param {string} callback.err Truthy if there were errors creating the response.
 * @param {MockIncomingMessage} callback.response The server's response.
 * @param {object} options Request options that were submitted with the request.
 * @param {string} [responseBody] If specified, the body content to use in place of the server's default body.
 * @param {boolean} [includeBody] If true, includes the response body in the response. Otherwise only includes headers.
 * @private
 */
function _getGetResponse(callback, {url}, responseBody='', includeBody=true) {
  if (this.urlExists(url)) {
    const urlContent = this.getUrlResponseBody(url);
    callback(null, _createResponse(200, {
      'Content-Type': mime.getType(url),
      'Content-Length': responseBody ? responseBody.length : urlContent.length
    }, responseBody, urlContent));
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
 * @param {string} [responseBody] If specified, the body content to use in place of the server's default body.
 * @private
 */
function _getDeleteResponse(callback, {url}, responseBody='') {
  _urlExists.call(this, url, (err, exists) => {
    if (err) {
      callback(err);
      return;
    }
    if (exists) {
      this.deleteUrlData(url);
      callback(null, _createResponse(200, {}, responseBody, 'path deleted'));
    } else {
      callback(null, _createResponse(404, {}, responseBody, 'path to delete not found'));
    }
  });
}

/**
 * Retrieves the response to a POST request.
 * @param {function} callback Invoked with the response.
 * @param {string} callback.err Truthy if there were errors creating the response.
 * @param {MockIncomingMessage} callback.response The server's response.
 * @param {object} options Request options that were submitted with the request.
 * @param {string} [responseBody] If specified, the body content to use in place of the server's default body.
 * @param {string} [requestBody] If specified, the body content that was sent with the request.
 * @private
 */
function _getPostResponse(callback, options, responseBody='', requestBody='') {
  const {url} = options;
  _urlExists.call(this, url, (err, exists) => {
    if (err) {
      callback(err);
      return;
    }
    if (exists) {
      callback(null, _createResponse(409, {}, responseBody, 'conflict: already exists'));
    } else {
      this.setUrlData(url, options, requestBody);
      callback(null, _createResponse(201, {}, responseBody, 'path created'));
    }
  });
}

/**
 * Retrieves the response to a PUT request.
 * @param {function} callback Invoked with the response.
 * @param {string} callback.err Truthy if there were errors creating the response.
 * @param {MockIncomingMessage} callback.response The server's response.
 * @param {object} options Request options that were submitted with the request.
 * @param {string} [responseBody] If specified, the body content to use in place of the server's default body.
 * @param {string} [requestBody] If specified, the body content that was sent with the request.
 * @private
 */
function _getPutResponse(callback, options, responseBody='', requestBody='') {
  const {url} = options;
  _urlExists.call(this, url, (err, exists) => {
    if (err) {
      callback(err);
      return;
    }
    if (!exists) {
      callback(null, _createResponse(404, {}, responseBody, 'path to update not found'));
    } else {
      this.setUrlData(url, options, requestBody);
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
 * @param {string} [responseBody] If specified, the body content to use in place of the server's default body.
 * @private
 */
function _getMoveResponse(callback, options, responseBody) {
  const {url, headers={}} = options;
  let parsedSource;
  let parsedDest;

  try {
    parsedSource = URL.parse(url);
  } catch (e) {
    callback(null, _createResponse(400, {}, responseBody, 'url is invalid'));
    return;
  }
  try {
    parsedDest = URL.parse(headers['x-destination']);
  } catch (e) {
    callback(null, _createResponse(400, {}, responseBody, 'destination url is invalid'));
    return;
  }

  if (!parsedDest.pathname) {
    callback(null, _createResponse(400, {}, responseBody, 'destination path must be specified'));
    return;
  }

  const destUrl = `${parsedSource.protocol}//${parsedSource.host}${parsedDest.pathname}`;

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