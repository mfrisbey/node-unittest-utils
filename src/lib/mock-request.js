import {MockClientRequest} from './mock-client-request';
import {HttpServer} from './http-server';
import {MockAemServer} from './mock-aem-server';

let httpServer = new HttpServer();

/**
 * Submits an http request.
 * @param {Object|string} urlOrOptions URL to GET, or options defining more fine-grained settings.
 * @param {function} [callback] If specified, invoked with the response of the request.
 * @param {string} [callback.err] Truthy if there was an error submitting the request.
 * @param {MockIncomingMessage} [callback.response] The response to an http request.
 * @param {string} [callback.body] The response body.
 * @returns {MockClientRequest} The http request to submit.
 */
export function request(urlOrOptions, callback) {
  if (typeof urlOrOptions === 'string') {
    urlOrOptions = {
      url: urlOrOptions
    };
  }

  let doEnd = true;
  const req = new MockClientRequest(urlOrOptions, callback, httpServer);
  req.on('pipe', () => {
    doEnd = false;
  });

  process.nextTick(() => {
    if (doEnd) {
      req.end();
    }
  });

  return req;
}

/**
 * Sets the callback to be invoked for _every_ request that goes through the module.
 * @param {function} callback Will be invoked with request data.
 * @param {object} callback.options Request options that were submitted with the request. This will include such things as the URL and headers.
 * @param {function} callback.done Should be invoked when custom processing of the request is complete.
 * @param {string} [callback.done.err] If truthy, the module will generate a request error.
 * @param {object} [callback.done.requestOptions] If specified, the request's options will used as the request options used throughout the rest of the request/response lifecycle.
 * @param {object} [callback.done.responseOptions] If specified, will be used as the response's options, including such things as statusCode and headers.
 * @param {string} [callback.done.responseBody] If specified, will be used as the response's body.
 */
export function registerRequestCallback(callback) {
  httpServer.setRequestCallback(callback);
}

/**
 * Sets the callback to be invoked when a request with a specified method is sent to a specified url.
 * @param {string} method An HTTP method.
 * @param {string} url Full HTTP URL.
 * @param {function} callback Will be invoked with request data.
 * @param {object} callback.options Request options that were submitted with the request. This will include such things as the URL and headers.
 * @param {function} callback.done Should be invoked when custom processing of the request is complete.
 * @param {string} [callback.done.err] If truthy, the module will generate a request error.
 * @param {object} [callback.done.responseOptions] If specified, will be used as the response's options, including such things as statusCode and headers.
 * @param {string} [callback.done.responseBody] If specified, will be used as the response's body.
 */
export function registerUrlCallback(method, url, callback) {
  httpServer.registerUrl(method, url, callback);
}

/**
 * Convenience method that sets a given URLs response to the specified values.
 * @param {string} method An HTTP method.
 * @param {string} url Full HTTP URL.
 * @param {object} responseOptions The response's options, including such things as statusCode and headers.
 * @param {string} responseBody The response's body.
 */
export function setUrlResponse(method, url, responseOptions, responseBody) {
  registerUrlCallback(method, url, (options, callback) => {
    callback(null, responseOptions, responseBody);
  });
}

/**
 * Convenience method that sets a given URLs response to a given status code.
 * @param {string} method An HTTP method.
 * @param {string} url Full HTTP URL.
 * @param {number} statusCode An HTTP status code.
 */
export function setUrlResponseStatusCode(method, url, statusCode) {
  registerUrlCallback(method, url, (options, callback) => {
    callback(null, {statusCode});
  });
}

/**
 * Sets the HTTP server that the mock request framework will use internally to handle requests.
 * @param {HttpServer} server Server instance for fulfilling requests.
 */
export function setHttpServer(server) {
  httpServer = server;
}

/**
 * Clears all registered callback, urls, and request counts.
 */
export function resetRequestState() {
  httpServer.resetState();
}

/**
 * Prints all URLs that have default response data associated with them.
 */
export function printAllUrlData() {
  httpServer.printAllData();
}

/**
 * Prints all URLs that have been requested through the module.
 */
export function printAllRequestedUrls() {
  httpServer.printAllRequestedUrls();
}

/**
 * Prints a list of all the URLs that have registered custom callbacks.
 */
export function printAllRegisteredUrls() {
  httpServer.printAllRegisteredUrls();
}

/**
 * Retrieves the number of times a request has been sent to a specified URL.
 * @param {string} method An HTTP method.
 * @param {string} url A full HTTP URL.
 * @returns {number} The number of times the URL was requested.
 */
export function getRequestedUrlCount(method, url) {
  return httpServer.getRequestedUrlCount(method, url);
}

/**
 * Retrieves the request options that were submitted with a request to a given url.
 * @param {string} method An HTTP method.
 * @param {string} url A full HTTP URL.
 * @param {number} [index] If specified, the index of the request to retrieve. If not specified, the method will return the most recent request's data.
 * @returns {object} The request options supplied with an http request. Null if no requests were found or if the index is out of range.
 */
export function getRequestedUrlOptions(method, url, index) {
  return httpServer.getRequestedUrlOptions(method, url, index);
}
