import {HttpServer} from './http-server';
import URL from 'url';
import Path from 'path';
import {MockFs} from './mock-fs';

const API_ASSETS = '/api/assets';
const CONTENT_DAM = '/content/dam';

export class MockAemServer extends HttpServer {

  constructor(host, user) {
    super();

    const self = this;
    this.setRequestCallback((options, done) => {
      self.processRequest(options, done);
    });
    // using a mock file system to keep track of assets
    this.assets = new MockFs();
    this.user = user;
    this.host = host;
  }

  /**
   * Registers additional data (including .json URLs) when creating assets.
   * @param {object} options The request options.
   * @param {function} done Shares the same signature as the callback for registerRequestCallback().
   */
  processRequest(options, done) {
    const {url, form={}, headers={}} = options;
    const parsedUrl = URL.parse(url);

    const self = this;

    _runFirstTimeSetup.call(self, (err) => {
      if (err) {
        done(err);
        return;
      }

      let assetPath = parsedUrl.pathname;
      const parsed = URL.parse(url);
      if (_isAssetsApiPath(parsed.pathname)) {
        // request came to the assets api. strip /api/assets out of the path so it can be replaced
        // with /content/dam later
        assetPath = _convertAssetsApiPath(parsed.pathname);
      } else if (parsed.pathname.indexOf('.createasset.html') >= 0) {
        // request came to the create asset servlet. build asset path and change method accordingly
        let directoryPath = parsed.pathname.substr(0, parsed.pathname.indexOf('.createasset.html'));

        if (directoryPath === '/') {
          directoryPath = '';
        }

        const parsedPath = Path.parse(form.file.path);

        assetPath = `${directoryPath}/${parsedPath.base}`;

        if (form.replaceAsset) {
          options.method = 'PUT';
        }
      } else if (parsed.pathname === '/bin/wcmcommand') {
        // request came to wcmcommand. retrieve path and update method accordingly
        assetPath = form.path;

        options.method = 'DELETE';
      }

      const fullHost = `${parsed.protocol}//${parsed.host}`;
      const fullAssetUrl = `${fullHost}${assetPath}`;
      options.url = fullAssetUrl;

      function _doRegisterJsonUrl(method, registerUrl) {
        const parsed = URL.parse(registerUrl);
        self.registerUrl(method, `${registerUrl}.json`, (options, done) => {
          const {responseOptions, body} = _getAssetResponse.call(self, method, parsed.pathname, registerUrl);
          done(null, responseOptions, body);
        });
      }

      function _doUnregisterJsonUrl(method, unregisterUrl) {
        self.unregisterUrl(method, `${unregisterUrl}.json`);
      }

      const {method} = options;
      if (method === 'POST') {
        // for posts, register GET and HEAD for .json URLs
        try {
          if (headers['Content-Type'] === 'application/json; charset=utf-8') {
            this.assets.addDirectory(assetPath);
          } else {
            this.assets.addFile(assetPath, {}, JSON.stringify({}), {noCreateParents: true});
          }
        } catch (e) {
          done(null, options, {statusCode: 404}, e.toString());
          return;
        }
        _doRegisterJsonUrl('GET', fullAssetUrl);
        _doRegisterJsonUrl('HEAD', fullAssetUrl);
      } else if (method === 'PUT') {
        // touch the info file to update its dates
        try {
          self.assets.touchFile(assetPath);
        } catch (e) {
          done(null, options, {statusCode: 404}, e.toString());
          return;
        }
      } else if (method === 'DELETE') {
        try {
          this.assets.removePath(assetPath);
          _doUnregisterJsonUrl('GET', fullAssetUrl);
          _doUnregisterJsonUrl('HEAD', fullAssetUrl);
        } catch (e) {
          done(null, options, {statusCode: 404}, e.toString());
          return;
        }
      } else if (method === 'MOVE') {
        let destUrl;
        try {
          destUrl = HttpServer.getDestinationUrl(options);
        } catch (e) {
          done(e);
          return;
        }

        const parsedDest = URL.parse(destUrl);
        if (_isAssetsApiPath(parsedDest.pathname)) {
          parsedDest.pathname = _convertAssetsApiPath(parsedDest.pathname);
          destUrl = `${parsedDest.protocol}//${parsedDest.host}${parsedDest.pathname}`;
          headers[HttpServer.DESTINATION_HEADER] = destUrl;
        }

        try {
          // move info entity
          this.assets.renameSync(assetPath, parsedDest.pathname);

          // unregister old path
          _doUnregisterJsonUrl('GET', fullAssetUrl);
          _doUnregisterJsonUrl('HEAD', fullAssetUrl);

          // register new path
          _doRegisterJsonUrl('GET', destUrl);
          _doRegisterJsonUrl('HEAD', destUrl);
        } catch (e) {
          done(null, options, {statusCode: 404}, e.toString());
          return;
        }
      }
      done(null, options);
    });
  }

  /**
   * Converts a timestamp to a date string specific to the aem server.
   * @param {number} timestamp A timestamp value to convert.
   * @returns {string} Converted date string.
   */
  static toDateString(timestamp) {
    return new Date(timestamp).toISOString();
  }
}

function _isAssetsApiPath(path) {
  return (path.length > API_ASSETS.length && path.substr(0, API_ASSETS.length + 1) === `${API_ASSETS}/`);
}

function _convertAssetsApiPath(toConvert) {
  if (_isAssetsApiPath(toConvert)) {
    return `${CONTENT_DAM}${toConvert.substr(API_ASSETS.length)}`;
  }
  return toConvert;
}

function _runFirstTimeSetup(callback) {
  const self = this;

  function _createDirectory(directory, cb) {
    self.getResponse({
      url: `${self.host}${directory}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    }, '', cb);
  }

  if (!this.setupComplete) {
    this.setupComplete = true;
    _createDirectory('/content', (err, res) => {
      if (err) {
        callback(err);
        return;
      }

      if (res.statusCode !== 201) {
        callback(`unexpected status code attempting to create /content: ${res.statusCode}`);
        return;
      }

      _createDirectory('/content/dam', (err, res) => {
        if (err) {
          callback(err);
          return;
        }

        if (res.statusCode !== 201) {
          callback(`unexpected status code attempting to create /content/dam: ${res.statusCode}`);
          return;
        }
        callback();
      });
    });
  } else {
    callback();
  }
}

function _getAssetResponse(method, path, contentUrl) {
  let entityData;
  try {
    entityData = _getEntityData.call(this, path, contentUrl, true);
  } catch (e) {
    return {responseOptions: {statusCode: 500}, body: e.toString()};
  }
  let body = JSON.stringify(entityData);
  return {responseOptions: {statusCode: 200, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length
  }}, body: method === 'GET' ? body : ''};
}

function _getEntityData(path, contentUrl, includeChildren=false) {
  let stats = this.assets.statSync(path);
  let entityData = {};

  const parsedPath = Path.parse(path);
  const name = decodeURI(parsedPath.base);

  if (stats.isFile()) {
    const rawEntityData = this.assets.getFileContent(path);
    entityData = JSON.parse(rawEntityData);

    entityData['class'] = ['assets/asset'];
    entityData['properties'] = {
      'jcr:created': MockAemServer.toDateString(stats.birthtimeMs),
      'jcr:lastModified': MockAemServer.toDateString(stats.mtimeMs),
      name,
      'asset:size': this.getUrlResponseBody(contentUrl).length
    };
  } else {
    entityData['class'] = ['assets/folder'];
    entityData['properties'] = {
      'jcr:created': MockAemServer.toDateString(stats.birthtimeMs),
      name
    };

    if (includeChildren) {
      entityData['entities'] = this.assets.readdirSync(path).map(name => {
        return _getEntityData.call(this, Path.join(path, name), `${contentUrl}/${name}`, false);
      });
    }
  }

  return entityData;
}
