import {EventEmitter} from 'events';
import Path from 'path';
import Datastore from 'lokijs';

import {MockReadableStream} from './mock-readable-stream';
import {MockWritableStream} from "./mock-writable-stream";

const ID_FIELD = '$loki';

/**
 * Implementation of a mock FS. Note that the class doesn't inherit from fs, it simply provides the same methods and
 * events (so it can be used interchangeably). The mock implementation stores all data for the mock file system
 * in an in-memory database.
 */
export class MockFs extends EventEmitter {

  /**
   * Retrieves the path separator for the current file system.
   * @returns {string} A path separator.
   */
  static sep() {
    return Path.sep;
  }

  /**
   * Initializes a new, empty file system.
   */
  constructor() {
    super();
    this.resetFileSystem();
  }

  /**
   * Reverts the mock object to it's default, empty state.
   */
  resetFileSystem() {
    this.db = new Datastore();
    this.paths = this.db.addCollection('paths');
    this.openFds = {};

    this.addDirectory(MockFs.sep());
  }

  /**
   * Directly adds a new file (and all its parent directories) to the mock file system.
   * @param {string} fullPath Full file system path.
   * @param {object} [stats] Stat information to merge with default values.
   * @param {string} [content] Will be used as the file's content.
   * @param {object} [options] Controls how the directory is added.
   * @param {boolean} [options.noCreateParents] If true, the path's parent directories will not be created.
   */
  addFile(fullPath, stats={}, content='', options={}) {
    const fileStats = _buildRawStats(stats);
    return _addEntity.call(this, fullPath, fileStats, content, options);
  }

  /**
   * Directly adds a new directory (and all its parent directories) to the mock file system.
   * @param {string} fullPath Full file system path.
   * @param {object} [stats] Stat information to merge with the default values.
   * @param {object} [options] Controls how the directory is added.
   * @param {boolean} [options.noCreateParents] If true, the path's parent directories will not be created.
   */
  addDirectory(fullPath, stats={}, options={}) {
    const dirStats = _buildRawStats(stats, true);
    return _addEntity.call(this, fullPath, dirStats, '', options);
  }

  /**
   * Removes a path (and all of its children if a directory) from the file system.
   * @param {string} fullPath Full path to a file or directory.
   */
  removePath(fullPath) {
    _removeEntity.call(this, fullPath);
  }

  /**
   * Retrieves the current content for a file, as a string.
   * @param {string} fullPath Full path to the file.
   */
  getFileContent(fullPath) {
    const entity = _getFile.call(this, fullPath);
    return entity.getContent().toString('utf8');
  }

  /**
   * Updates the content of a file and changes its modified dates.
   * @param {string} fullPath Full path to the file.
   * @param {string|Buffer} content New content for a file.
   */
  setFileContent(fullPath, content) {
    _updateFileContent.call(this, fullPath, content);
  }

  /**
   * Merges a file's current stats with a given set of new stats.
   * @param {string} fullPath Full path to the file.
   * @param {object} stats File stat information.
   */
  updateFileStats(fullPath, stats) {
    const entity = _getFile.call(this, fullPath);
    _updateEntityStats.call(this, entity.getFullPath(), stats);
  }

  /**
   * Touches an existing file by updating its modified dates.
   * @param {string} fullPath Full path to a file.
   */
  touchFile(fullPath) {
    const entity = _getFile.call(this, fullPath);
    _updateEntityStats.call(this, entity.getFullPath(), {
      mtimeMs: new Date().getTime()
    });
  }

  /**
   * Prints the entire filesystem tree to the console.
   */
  printFileSystemTree() {
    function printEntry(path, depth) {
      let indent = '';

      for (let i = 0; i < depth; i++) {
        indent += '-';
      }

      const currItem = _getEntity.call(this, path);
      const stats = currItem.getStats();
      console.log(`${indent}${stats.isDirectory() ? '+' : '-'} ${currItem.getName()}`);

      if (stats.isDirectory()) {
        const children = _getDirectoryChildren.call(this, path);
        children.sort((a, b) => {
          const aName = a.getName();
          const bName = b.getName();

          return aName < bName ? -1 : 1;
        });

        // yes, recursion is bad in javascript. will need to be refactored if there are issues.
        children.forEach(child => printEntry.call(this, child.getFullPath(), depth + 1));
      }
    }

    console.log('**** FILE SYSTEM LIST ****');
    console.log('');

    printEntry.call(this, MockFs.sep(), 0);

    const entities = this.paths.find();
    let orphaned = false;

    entities.forEach(item => {
      const entity = new MockEntity(this, item);
      if (entity.getPath()) {
        const parent = _getEntity.call(this, entity.getPath());

        if (!parent) {
          if (!orphaned) {
            console.log('');
            console.log('---- ORPHANED NODES ----');
            console.log('');
            orphaned = true;
          }
          console.log(entity.getFullPath());
        }
      }
    });

    if (orphaned) {
      console.log('');
      console.log('---- END ORPHANED NODES ----');
    }

    console.log('');
    console.log('**** END FILE SYSTEM LIST ****');
    console.log('');
  }

  /**
   * Prints all information about a path to the console.
   * @param {string} path Full path to print.
   */
  printPathInformation(path) {
    const entity = _getEntity.call(this, path);
    if (entity) {
      const stats = entity.getRawStats();
      console.log('**** PATH %s INFORMATION ****', path);
      console.log('');
      console.log('---- RAW STATS ----');
      console.log(JSON.stringify(stats, null, 2));
      console.log('');
      if (!stats.isDir) {
        console.log('---- CONTENT ----');
        console.log(`"${entity.getContent()}"`);
        console.log('');
      }
      console.log('');
      console.log('**** END PATH %s INFORMATION ****', path);
      console.log('');
    } else {
      console.log('');
      console.log('**** PATH %s NOT FOUND ****', path);
      console.log('');
    }
  }

  /*
   * FS functionality. Please see node.js fs module documentation for information on methods and events.
   */

  close(fd, callback) {
    const self = this;
    process.nextTick(() => {
      try {
        self.closeSync(fd);
      } catch (e) {
        callback(e);
        return;
      }
      callback();
    });
  }

  closeSync(fd) {
    if (!this.openFds[fd]) {
      throw new Error(`fd ${fd} to close is not open`);
    }
    delete this.openFds[fd];
  }

  createReadStream(path, options={}) {
    let entity;

    if (path) {
      entity = _getFile.call(this, path);
    } else {
      entity = _getFile.call(this, options.fd);
    }

    let content = entity.getContent();
    if (options.start !== undefined) {
      let {start, end=0} = options;

      if (!end) {
        end = content.length - 1;
      }

      const subBuffer = Buffer.alloc(end - start + 1);
      content.copy(subBuffer, 0, start, end + 1);
      content = subBuffer;
    }

    const read = new MockReadableStream(content);
    read.path = path;
    return read;
  }

  createWriteStream(path, options={}) {
    let entity;
    const self = this;

    const exists = this.existsSync(path);

    if (!exists) {
      this.addFile(path, {}, '', {noCreateParents: true});
    } else {
      this.truncateSync(path);
    }

    if (path) {
      entity = _getFile.call(this, path);
    } else {
      entity = _getFile.call(this, options.fd);
    }

    const stream = new MockWritableStream();

    stream.on('finish', () => {
      _updateFileContent.call(self, entity.getFullPath(), stream.getContentsAsString());
    });

    stream.path = path;

    return stream;
  }

  exists(path, callback) {
    const self = this;
    process.nextTick(() => {
      let exists;
      try {
        exists = self.existsSync(path);
      } catch (e) {
        callback(e);
        return;
      }
      callback(null, exists);
    });
  }

  existsSync(path) {
    return !!_getEntity.call(this, path);
  }

  fstat(fd, options, callback) {
    const self = this;
    process.nextTick(() => {
      if (isFunc(options)) {
        callback = options;
        options = {};
      }

      let stats;
      try {
        stats = self.fstatSync(fd, options);
      } catch (e) {
        callback(e);
        return;
      }
      callback(null, stats);
    });
  }

  fstatSync(fd, options={}) {
    return _getFile.call(this, fd).getStats();
  }

  ftruncate(fd, len, callback) {
    process.nextTick(() => {
      if (isFunc(len)) {
        callback = len;
        len = 0;
      }
      try {
        this.ftruncateSync(fd, len);
      } catch (e) {
        callback(e);
        return;
      }
      callback();
    });
  }

  ftruncateSync(fd, len=0) {
    const entity = _getEntity.call(this, fd);
    this.truncateSync(entity.getFullPath(), len);
  }

  mkdir(path, mode, callback) {
    const self = this;
    process.nextTick(() => {
      if (isFunc(mode)) {
        callback = mode;
        mode = 0o777;
      }

      try {
        self.mkdirSync(path, mode);
      } catch (e) {
        callback(e);
        return;
      }
      callback();
    });
  }

  mkdirSync(path, mode=0o777) {
    this.addDirectory(path, {}, {noCreateParents: true});
  }

  mkdirp(path, mode, callback) {
    const self = this;
    process.nextTick(() => {
      if (isFunc(mode)) {
        callback = mode;
        mode = 0o777;
      }
      try {
        self.mkdirpSync(path, mode);
      } catch (e) {
        callback(e);
        return;
      }

      callback();
    });
  }

  mkdirpSync(path, mode=0o777) {
    path = _normalizePathSeparators(path);
    const paths = new String(path).split(MockFs.sep());

    if (paths.length > 1) {
      let prevPath = '';
      for (let i = 1; i < paths.length; i++) {
        prevPath += `${MockFs.sep()}${paths[i]}`;
        if (!this.existsSync(prevPath)) {
          this.mkdirSync(prevPath, mode);
        }
      }
    }
  }

  open(path, flags, mode, callback) {
    const self = this;
    process.nextTick(() => {
      if (isFunc(mode)) {
        callback = mode;
        mode = 0o666;
      }

      let fd;
      try {
        fd = self.openSync(path, flags, mode);
      } catch (e) {
        callback(e);
        return;
      }
      callback(null, fd);
    });
  }

  openSync(path, flags, mode=0o666) {
    if (flags === 'w' || flags === 'wx') {
      const exists = this.existsSync(path);

      if (exists && flags === 'wx') {
        callback(`path to open and create already exists ${path}`);
        return;
      } else if (exists) {
        this.truncateSync(path);
      }

      this.addFile(path, {}, '', {noCreateParents: true});
    }

    const fid = _getFile.call(this, path).getId();
    if (this.openFds[fid]) {
      throw new Error(`path is already open: ${path}`);
    }
    this.openFds[fid] = true;
    return fid;
  }

  read(fd, buffer, offset, length, position, callback) {
    const self = this;
    process.nextTick(() => {
      let bytesRead;
      let readBuffer;
      try {
        const entityRead = _readEntity.call(self, fd, buffer, offset, length, position);
        bytesRead = entityRead.bytesRead;
        readBuffer = entityRead.buffer;
      } catch (e) {
        callback(e);
        return;
      }
      callback(null, bytesRead, readBuffer);
    });
  }

  readSync(fd, buffer, offset, length, position) {
    const {bytesRead} = _readEntity.call(this, fd, buffer, offset, length, position);
    return bytesRead;
  }

  readdir(path, options, callback) {
    const self = this;
    process.nextTick(() => {
      if (isFunc(options)) {
        callback = options;
        options = {};
      }

      let dirContent;
      try {
        dirContent = self.readdirSync(path, options);
      } catch (e) {
        callback(e);
        return;
      }
      callback(null, dirContent);
    });
  }

  readdirSync(path, options={}) {
    return _getDirectoryChildren.call(this, path).map(item => item.getName());
  }

  readFile(path, options, callback) {
    const self = this;
    process.nextTick(() => {
      if (isFunc(options)) {
        callback = options;
        options = {};
      }

      let content;
      try {
        content = self.readFileSync(path, options);
      } catch (e) {
        callback(e);
        return;
      }

      callback(null, content);
    });
  }

  readFileSync(path, options={}) {
    const {encoding} = options;
    const entity = _getFile.call(this, path);
    const size = entity.getStats().size;

    const buffer = new Buffer(size);

    this.readSync(entity.getId(), buffer, 0, size, 0);

    return encoding ? buffer.toString(encoding) : buffer;
  }

  rename(oldPath, newPath, callback) {
    const self = this;
    process.nextTick(() => {
      try {
        self.renameSync(oldPath, newPath);
      } catch (e) {
        callback(e);
        return;
      }
      callback();
    });
  }

  renameSync(oldPath, newPath) {
    const source = _getEntity.call(this, oldPath);
    const exists = this.existsSync(newPath);

    if (exists) {
      this.removePath(newPath);
    }
    _moveEntity.call(this, source.getFullPath(), newPath);
  }

  rmdir(path, callback) {
    const self = this;
    process.nextTick(() => {
      try {
        self.rmdirSync(path);
      } catch (e) {
        callback(e);
        return;
      }
      callback();
    });
  }

  rmdirSync(path) {
    const entity = _getDirectoryByPath.call(this, path);
    _removeEntity.call(this, entity.getFullPath());
  }

  stat(path, options, callback) {
    const self = this;
    process.nextTick(() => {
      if (isFunc(options)) {
        callback = options;
        options = {};
      }

      let stats;
      try {
        stats = self.statSync(path, options);
      } catch (e) {
        callback(e);
        return;
      }
      callback(null, stats);
    });
  }

  statSync(path, options={}) {
    const entity = _getEntity.call(this, path);

    if (!entity) {
      throw {code: 'ENOENT', message: `path does not exist: ${path}`};
    }

    return entity.getStats();
  }

  truncate(path, len, callback) {
    const self = this;
    process.nextTick(() => {
      if (isFunc(len)) {
        callback = len;
        len = 0;
      }

      try {
        self.truncateSync(path, len);
      } catch (e) {
        callback(e);
        return;
      }
      callback();
    });
  }

  truncateSync(path, len=0) {
    const updateCount = _updateFileContentLength.call(this, path, len);
    if (updateCount !== 1) {
      throw new Error(`unexpected number of items truncated: ${updateCount}`);
    }
  }

  unlink(path, callback) {
    const self = this;
    process.nextTick(() => {
      try {
        self.unlinkSync(path);
      } catch (e) {
        callback(e);
        return;
      }
      callback();
    });
  }

  unlinkSync(path) {
    const entity = _getFile.call(this, path);
    _removeEntity.call(this, entity.getFullPath());
  }

  write(fd, bufferOrString, offsetOrPosition, lengthOrEncoding, positionOrCallback, callback) {
    const self = this;
    process.nextTick(() => {
      if (isFunc(offsetOrPosition)) {
        callback = offsetOrPosition;
        offsetOrPosition = 0;
        lengthOrEncoding = 0;
        positionOrCallback = 0;
      } else if (isFunc(lengthOrEncoding)) {
        callback = lengthOrEncoding;
        lengthOrEncoding = 0;
        positionOrCallback = 0;
      } else if (isFunc(positionOrCallback)) {
        callback = positionOrCallback;
        positionOrCallback = 0;
      }

      let written;
      let writtenData;
      try {
        const result = _writeEntity.call(self, fd, bufferOrString, offsetOrPosition, lengthOrEncoding, positionOrCallback);
        written = result.written;
        writtenData = result.writtenData;
      } catch (e) {
        callback(e);
        return;
      }
      callback(null, written, writtenData);
    });
  }

  writeSync(fd, bufferOrString, offsetOrPosition=0, lengthOrEncoding=0, position=0) {
    const result = _writeEntity.call(this, fd, bufferOrString, offsetOrPosition, lengthOrEncoding, position);

    return result.written;
  }

  writeFile(file, data, options, callback) {
    const self = this;
    process.nextTick(() => {
      if (isFunc(options)) {
        callback = options;
        options = {};
      }

      try {
        self.writeFileSync(file, data, options);
      } catch (e) {
        callback(e);
        return;
      }
      callback();
    });
  }

  writeFileSync(file, data, options={}) {
    const entity = _getFile.call(this, file);
    this.truncateSync(entity.getFullPath(), data.length);
    return this.writeSync(entity.getId(), data);
  }
}

function _defineDateStatProperty(propertyName) {
  const self = this;
  const targetProperty = `${propertyName}Ms`;
  Object.defineProperty(self.stats, propertyName, {
    get: function () {
      return new Date(self.stats[targetProperty]);
    }, set: function (modified) {
      self.stats[targetProperty] = modified.getTime();
    }, configurable: true
  });
};

class MockStats {
  constructor(fs, path, stats) {
    const self = this;
    this.fs = fs;
    this.path = path;
    this.rawStats = Object.assign({}, stats);
    this.stats = {};
    Object.keys(self.rawStats).forEach(key => {
      Object.defineProperty(self.stats, key, {
        get: function () {
          return self.rawStats[key];
        }, set: function (modified) {
          self.rawStats[key] = modified;
          const toModify = {};
          toModify[key] = modified;
          _updateEntityStats.call(self.fs, self.path, toModify);
        }, configurable: true
      });
    });

    _defineDateStatProperty.call(this, 'atime');
    _defineDateStatProperty.call(this, 'mtime');
    _defineDateStatProperty.call(this, 'ctime');
    _defineDateStatProperty.call(this, 'birthtime');

    this.stats.isFile = function () {
      return !self.stats.isDir;
    };

    this.stats.isDirectory = function () {
      return self.stats.isDir;
    };
  }

  getStats() {
    return this.stats;
  }

  get atime() {
    return new Date(this.atimeMs);
  }

  set atime(value) {
    this.atimeMs = value.getTime();
  }

  get mtime() {
    return new Date(this.mtimeMs);
  }

  set mtime(value) {
    this.mtimeMs = value.getTime();
    _updateEntityStats.call(this.fs, this.path, {mtimeMs: this.mtimeMs});
  }

  get ctime() {
    return new Date(this.ctimeMs);
  }

  set ctime(value) {
    this.ctimeMs = value.getTime();
  }

  get birthtime() {
    return new Date(this.birthtimeMs);
  }

  set birthtime(value) {
    this.birthtimeMs = value.getTime();
  }

  isDirectory() {
    return this.isDir;
  }

  isFile() {
    return !this.isDir;
  }
}

class MockEntity {
  constructor(fs, options) {
    this.fs = fs;
    this.options = options;
  }

  getId() {
    return this.options[ID_FIELD];
  }

  getPath() {
    return this.options.path;
  }

  getName() {
    return this.options.name;
  }

  getFullPath() {
    return Path.join(this.getPath(), this.getName());
  }

  getStats() {
    return new MockStats(this.fs, this.getPath(), this.getRawStats()).getStats();
  }

  getRawStats() {
    return this.options.stats;
  }

  getContent() {
    return this.options.content;
  }
}

function isFunc(toCheck) {
  return (typeof toCheck === 'function');
}

function _normalizePathSeparators(path) {
  if (path) {
    path = path.replace(/\//g, Path.sep);
    path = path.replace(/\\/g, Path.sep);

    if (path.charAt(path.length - 1) === Path.sep && path.length > 1) {
      path = path.substr(0, path.length - 1);
    }
  }

  return path;
}

function _buildRawStats(nonDefault, isDir=false) {
  const now = new Date().getTime();
  let stats = {
    dev: 0,
    ino: 0,
    mode: 33188,
    nlink: 1,
    uid: 85,
    gid: 100,
    rdev: 0,
    size: 0,
    atimeMs: now,
    mtimeMs: now,
    ctimeMs: now,
    birthtimeMs: now,
    isDir: isDir
  };
  if (!isDir) {
    stats.blksize = 4096;
    stats.blocks = 1;
  }
  return {
    ...stats,
    ...nonDefault
  };
}

function _splitPath(path) {
  path = _normalizePathSeparators(path);
  let dir = '';
  let name = path;
  if (path != MockFs.sep()) {
    const parsed = Path.parse(path);
    dir = parsed.dir;
    name = parsed.base;
  }
  return {dir, name};
}

function _addEntity(path, stats, content='', options={}) {
  const {dir, name} = _splitPath(path);
  const {noCreateParents} = options;

  if (!noCreateParents) {
    this.mkdirpSync(dir);
  }

  const exists = this.existsSync(path);
  const parentExists = this.existsSync(dir);

  if (exists) {
    throw new Error(`path to create already exists: ${path}`);
  }

  if (dir && !parentExists) {
    throw new Error(`parent of path to create does not exist: ${path}`);
  }

  const doc = this.paths.insert({
    path: dir,
    name,
    stats,
    content: Buffer.alloc(0)
  });

  if (content) {
    _updateFileContent.call(this, path, content);
  }

  return doc[ID_FIELD];
}

function _getDirectoryByPath(path) {
  const entity = _getEntity.call(this, path);

  if (!entity.getStats().isDirectory()) {
    throw new Error(`path is not a directory: ${path}`);
  }

  return entity;
}

function _getFile(pathOrId) {
  const entity = _getEntity.call(this, pathOrId);

  if (!entity || !entity.getStats().isFile()) {
    throw new Error(`path is not a file: ${pathOrId}`);
  }

  return entity;
}

function _getEntity(pathOrId) {
  if (typeof pathOrId === 'number') {
    let query = {};
    query[ID_FIELD] = pathOrId;
    return _findEntity.call(this, query);
  } else {
    const {dir, name} = _splitPath(pathOrId);

    return _findEntity.call(this, {path: dir, name});
  }
}

function _findEntity(query) {
  const entity = this.paths.find(query);

  if (entity.length > 1) {
    throw new Error(`duplicate entity found: ${path}`);
  } else {
    return entity.length > 0 ? new MockEntity(this, entity[0]) : false;
  }
}

function _getDirectoryChildren(path) {
  const entity = _getDirectoryByPath.call(this, path);
  return this.paths.find({path: entity.getFullPath()}).map(item => new MockEntity(this, item));
}

function _updateFileContent(path, content) {
  const entity = _getFile.call(this, path);
  const {dir, name} = _splitPath(entity.getFullPath());

  let bufferContent = content;

  if (!content) {
    bufferContent = Buffer.alloc(0);
  } else if (!Buffer.isBuffer(content)) {
    bufferContent = Buffer.from(content);
  }

  let updateCount = 0;
  this.paths.findAndUpdate({path: dir, name}, (toUpdate) => {
    updateCount++;
    toUpdate.content = bufferContent;
    toUpdate.stats.size = bufferContent.length;
    toUpdate.stats.mtimeMs = new Date().getTime();
    return toUpdate;
  });
  return updateCount;
}

function _updateEntityStats(path, stats) {
  const {dir, name} = _splitPath(path);
  let updateCount = 0;
  this.paths.findAndUpdate({path: dir, name}, (toUpdate) => {
    updateCount++;
    toUpdate.stats = {
      ...toUpdate.stats,
      ...stats
    };
    return toUpdate;
  });
  return updateCount;
}

function _updateFileContentLength(path, newLength) {
  const newBuffer = Buffer.alloc(newLength);
  const entity = _getFile.call(this, path);

  if (newLength) {
    const currBuffer = entity.getContent();

    if (currBuffer.length) {
      currBuffer.copy(newBuffer, 0, 0, newLength > currBuffer.length ? currBuffer.length : newLength);
    }
  }
  return _updateFileContent.call(this, path, newBuffer);
}

function _getDescendantRegex(path) {
  const regexSepReplace = new RegExp(`\\${MockFs.sep()}`, 'g');
  const regexPath = path.replace(regexSepReplace, `\\${MockFs.sep()}`);
  return new RegExp(`^${regexPath}\\${MockFs.sep()}`, 'g');
}

function _removeEntity(path) {
  path = _normalizePathSeparators(path);

  const {dir, name} = _splitPath(path);

  // remove actual entry
  this.paths.findAndRemove({path: dir, name});

  // remove direct children
  this.paths.findAndRemove({path});

  // remove all descendants
  this.paths.removeWhere((doc) => {
    return _getDescendantRegex(path).exec(doc.path) !== null;
  });
}

function _moveEntity(oldPath, newPath) {
  oldPath = _normalizePathSeparators(oldPath);
  newPath = _normalizePathSeparators(newPath);

  const {dir, name} = _splitPath(oldPath);
  const newSplit = _splitPath(newPath);
  const newDir = newSplit.dir;
  const newName = newSplit.name;

  if (!this.existsSync(newDir)) {
    throw new Error(`target directory does not exist: ${newDir}`);
  }

  // move actual entry
  this.paths.findAndUpdate({path: dir, name}, (toUpdate) => {
    toUpdate.path = newDir;
    toUpdate.name = newName;
    return toUpdate;
  });

  // move direct children
  this.paths.findAndUpdate({path: oldPath}, (toUpdate) => {
    toUpdate.path = newPath;
    return toUpdate;
  });

  this.paths.updateWhere((doc) => {
    return (_getDescendantRegex(oldPath).exec(doc.path) !== null);
  }, (toUpdate) => {
      const removedPrefix = toUpdate.path.substr(oldPath.length);
      toUpdate.path = newPath + removedPrefix;
    return toUpdate;
  });
}

function _readEntity(fd, buffer, offset, length, position) {
  const entity = _getFile.call(this, fd);
  const content = entity.getContent();

  content.copy(buffer, offset, position, position + length);

  const readBuffer = Buffer.alloc(length);
  content.copy(readBuffer, 0, position, position + length);

  return {bytesRead: length, buffer: readBuffer};
}

function _writeEntity(fd, bufferOrString, offsetOrPosition=0, lengthOrEncoding=0, position=0) {
  let encoding = 'utf8';
  let toWrite = bufferOrString;
  let offset = offsetOrPosition;
  let length = lengthOrEncoding;
  let isBuffer = true;

  if (!toWrite) {
    toWrite = Buffer.alloc(0);
  } else if (!Buffer.isBuffer(toWrite)) {
    isBuffer = false;
    toWrite = Buffer.from(toWrite);
  }

  if (typeof lengthOrEncoding === 'string') {
    encoding = lengthOrEncoding;
    position = offsetOrPosition;
    length = toWrite.length;
  }

  if (!length) {
    length = toWrite.length;
  }

  const entity = _getFile.call(this, fd);

  let content = entity.getContent();
  toWrite.copy(content, position, offset, offset + length);

  const actualWritten = Buffer.alloc(length);
  toWrite.copy(actualWritten, 0, offset, offset + length);

  _updateFileContent.call(this, entity.getFullPath(), content);

  return {written: length, writtenData: isBuffer ? actualWritten : actualWritten.toString(encoding)};
}
