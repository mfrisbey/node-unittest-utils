import Path from 'path';
import pq from 'proxyquire';

import {request} from './lib/mock-request';
import {MockFs} from './lib/mock-fs';
import {MockStream} from './lib/mock-stream';

const proxyquire = pq.noCallThru();

/**
 * Functionality for the testing framework. It's primary job is to handle injecting mock dependencies for specified
 * modules.
 *
 * This module will contain a singleton instance of this class.
 */
class TestFramework {

  /**
   * Initializes a default instance of the framework.
   */
  constructor() {
    this.mockFs = new MockFs();

    this.mocks = {};
    this.registerMock('request', request);
    this.registerMock('fs', this.mockFs);
    this.registerMock('stream', MockStream);
  }

  /**
   * See export definition for documentation.
   */
  registerMock(moduleName, mockObject) {
    if (moduleName && mockObject) {
      mockObject['@global'] = true;
      this.mocks[moduleName] = mockObject;
    }
  }

  /**
   * See export definition for documentation.
   */
  requireMocks(nameOrFullPath) {
    return proxyquire(nameOrFullPath, this.mocks);
  }
}

const framework = new TestFramework();

/**
 * Registers a mock object that will be injected whenever the specified module is required in any module (or its
 * submodules) required using requireMocks().
 * @param {string} moduleName The name of the module to inject.
 * @param {*} mockObject The object to return when the registered module is required.
 */
export function registerMock(moduleName, mockObject) {
  framework.registerMock(moduleName, mockObject);
}

/**
 * Requires a module, globally substituting all instances of any registered module with mock objects. For example,
 * assume the 'fs' module has a mock registered through registerMock(); whenever the target module (or any of its
 * submodules) require 'fs', then the module returned will be the mock object.
 *
 * The method will accept either a module name (i.e. requireMocks('some-module')) or a module's absolute path (i.e.
 * requireMocks('/full/path/to/some-module)'). Note that the path _must_ be the full, absolute path to the require,
 * not a relative path. For convenience, feel free to use getRequireMockPath().
 * @param {string} fullRequirePath The name of a module to require. If the value is a path, it _must_ be the full,
 *   absolute path to the require (for example, './lib/file' is invalid - it must be '/abolute/path/lib/file')
 */
export function requireMocks(nameOrFullPath) {
  const required = framework.requireMocks(nameOrFullPath);

  if (required) {
    if (required['default']) {
      return required['default'];
    }
  }
  return required;
}

/**
 * Builds an absolute file path given the calling file's __dirname value and a relative file path.
 * @param {string} dirName A __dirname value, or any absolute path.
 * @param {string} relativePath Path (relative to the dirname) for a module.
 */
export function getRequireMockPath(dirName, relativePath) {
  return Path.join(dirName, relativePath);
}

export * from './lib/mock-request';
export * from './lib/mock-readable-stream';
export * from './lib/mock-writable-stream';
export * from './lib/mock-fs';
export * from './lib/mock-aem-server';
