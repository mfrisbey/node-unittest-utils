import {request, setHttpServer, printAllRegisteredUrls} from '../src/lib/mock-request';
import {MockAemServer, MockReadableStream} from "../src";
import expect from 'expect.js';

const HOST = 'http://unittest';
const USER = 'tester';

function _getUrl(path) {
  return `${HOST}${path}`;
}

function _getContentDamUrl(path) {
  const fullPath = `/content/dam${path}`;
  return _getUrl(fullPath);
}

function _getAssetsApiUrl(path) {
  const fullPath = `/api/assets${path}`;
  return _getUrl(fullPath);
}

function _createDirectory(fullUrl, callback) {
  request({
    url: fullUrl,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  }, (err, res) => {
    expect(err).not.to.be.ok();
    expect(res).to.be.ok();
    expect(res.statusCode).to.be(201);
    callback();
  });
}

function _verifyInfo(fullUrl, exists, callback) {
  request({
    url: fullUrl,
    method: 'HEAD'
  }, (err, res) => {
    expect(err).not.to.be.ok();
    expect(res).to.be.ok();
    if (exists) {
      expect(res.statusCode).to.be(200);
    } else {
      expect(res.statusCode).to.be(404);
    }
    callback();
  });
}

describe('mock aem server tests', () => {
  beforeEach(() => {
    setHttpServer(new MockAemServer(HOST, USER));
  });

  it('test asset info url', done => {
    const data = new MockReadableStream('hello world');
    const req = request({
      url: _getAssetsApiUrl('/test-asset.jpg'),
      method: 'POST'
    });

    req.on('response', res => {
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(201);

      request(_getAssetsApiUrl('/test-asset.jpg.json'), (err, res, body) => {
        expect(err).not.to.be.ok();
        expect(res).to.be.ok();
        expect(res.statusCode).to.be(200);
        expect(body).to.be.ok();

        const parsedBody = JSON.parse(body);
        const {properties} = parsedBody;
        expect(parsedBody['class'].length).to.be(1);
        expect(parsedBody['class'][0]).to.be('assets/asset');
        expect(properties['jcr:created']).to.be.ok();
        expect(properties['jcr:lastModified']).to.be.ok();
        expect(properties.name).to.be('test-asset.jpg');
        expect(properties['asset:size']).to.be(11);

        request({
          method: 'HEAD',
          url: _getAssetsApiUrl('/test-asset.jpg.json?requestOptions=1')
        }, (err, res, body) => {
          expect(err).not.to.be.ok();
          expect(res).to.be.ok();
          expect(res.statusCode).to.be(200);
          expect(body).not.to.be.ok();
          done();
        });
      });
    });

    data.pipe(req);
  });

  it('test folder info url', done => {
    request({
      url: _getAssetsApiUrl('/folderinfo'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    }, (err, res) => {
      expect(err).not.to.be.ok();
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(201);

      request({
        url: _getAssetsApiUrl('/folderinfo/subdir'),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        }
      }, (err, res) => {
        expect(err).not.to.be.ok();
        expect(res).to.be.ok();
        expect(res.statusCode).to.be(201);

        const read = new MockReadableStream('hello info world!');
        const req = request({
          url: _getAssetsApiUrl('/folderinfo/testfile.jpg'),
          method: 'POST'
        });

        req.on('response', res => {
          expect(res).to.be.ok();
          expect(res.statusCode).to.be(201);

          request(_getAssetsApiUrl('/folderinfo.json'), (err, res, body) => {
            expect(err).not.to.be.ok();
            expect(res).to.be.ok();
            expect(res.statusCode).to.be(200);
            expect(body).to.be.ok();

            const folderInfo = JSON.parse(body);
            const {properties, entities} = folderInfo;
            expect(folderInfo['class'].length).to.be(1);
            expect(folderInfo['class'][0]).to.be('assets/folder');
            expect(properties['jcr:created']).to.be.ok();
            expect(properties.name).to.be('folderinfo');
            expect(entities).to.be.ok();
            expect(entities.length).to.be(2);
            expect(entities[0].properties.name).to.be('subdir');
            expect(entities[0].entities).not.to.be.ok();
            expect(entities[1].properties.name).to.be('testfile.jpg');

            request({
              method: 'HEAD',
              url: _getAssetsApiUrl('/folderinfo.json?requestOptions=1')
            }, (err, res, body) => {
              expect(err).not.to.be.ok();
              expect(res).to.be.ok();
              expect(res.statusCode).to.be(200);
              expect(body).not.to.be.ok();
              done();
            });
          });
        });

        read.pipe(req);
      });
    });
  });

  it('test create with asset servlet', (done) => {
    _createDirectory(_getAssetsApiUrl('/directory'), () => {
      const read = new MockReadableStream('hello asset servlet');
      read.path = '/testfile.jpg';
      const req = request({
        url: _getContentDamUrl('/directory.createasset.html'),
        method: 'POST'
      });

      req.on('response', (res) => {
        expect(res).to.be.ok();
        expect(res.statusCode).to.be(201);

        request(_getAssetsApiUrl('/directory/testfile.jpg'), (err, res, body) => {
          expect(err).not.to.be.ok();
          expect(res).to.be.ok();
          expect(res.statusCode).to.be(200);
          expect(body).to.be('hello asset servlet');

          _verifyInfo(_getAssetsApiUrl('/directory/testfile.jpg.json'), true, done);
        });
      });

      const form = req.form();
      form.append('_charset_', 'utf-8');

      form.append('file', read, {
        filename: '/testfile.jpg'
      });
    });
  });

  it('test create parent no exist', (done) => {
    request({
      url: _getAssetsApiUrl('/some/path'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    }, (err, res) => {
      expect(err).not.to.be.ok();
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(404);
      _verifyInfo(_getAssetsApiUrl('/some/path'), false, done);
    });
  });

  it('test update with create asset servlet', (done) => {
    _createDirectory(_getAssetsApiUrl('/directory'), () => {
      const read = new MockReadableStream('test update');
      const updateRead = new MockReadableStream('hello updated');
      read.path = '/testupdate.jpg';
      updateRead.path = '/testupdate.jpg';
      const req = request({
        url: _getAssetsApiUrl('/directory/testupdate.jpg'),
        method: 'POST'
      });

      req.on('response', res => {
        expect(res).to.be.ok();
        expect(res.statusCode).to.be(201);

        const update = request({
          url: _getContentDamUrl('/directory.createasset.html'),
          method: 'POST'
        })

        update.on('response', res => {
          expect(res).to.be.ok();
          expect(res.statusCode).to.be(200);

          request(_getContentDamUrl('/directory/testupdate.jpg'), (err, res, body) => {
            expect(err).not.to.be.ok();
            expect(res).to.be.ok();
            expect(res.statusCode).to.be(200);
            expect(body).to.be('hello updated');

            _verifyInfo(_getContentDamUrl('/directory/testupdate.jpg.json'), true, done);
          });
        });

        const form = update.form();
        form.append('replaceAsset', true);
        form.append('file', updateRead);
      });

      read.pipe(req);
    });
  });

  it('test create, update, delete with assets api', done => {
    const read = new MockReadableStream('hello assets api');
    const updateRead = new MockReadableStream('updated assets api');
    const req = request({
      url: _getAssetsApiUrl('/createassetsapi.jpg'),
      method: 'POST'
    });

    req.on('response', res => {
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(201);

      request(_getContentDamUrl('/createassetsapi.jpg'), (err, res, body) => {
        expect(err).not.to.be.ok();
        expect(res).to.be.ok();
        expect(res.statusCode).to.be(200);
        expect(body).to.be('hello assets api');

        const update = request({
          url: _getAssetsApiUrl('/createassetsapi.jpg'),
          method: 'PUT'
        });

        update.on('response', res => {
          expect(res).to.be.ok();
          expect(res.statusCode).to.be(200);

          request(_getAssetsApiUrl('/createassetsapi.jpg'), (err, res, body) => {
            expect(err).not.to.be.ok();
            expect(res).to.be.ok();
            expect(res.statusCode).to.be(200);
            expect(body).to.be('updated assets api');

            _verifyInfo(_getAssetsApiUrl('/createassetsapi.jpg.json'), true, () => {
              request({
                url: _getAssetsApiUrl('/createassetsapi.jpg'),
                method: 'DELETE'
              }, (err, res) => {
                expect(err).not.to.be.ok();
                expect(res).to.be.ok();
                expect(res.statusCode).to.be(200);

                request(_getAssetsApiUrl('/createassetsapi.jpg'), (err, res) => {
                  expect(err).not.to.be.ok();
                  expect(res).to.be.ok();
                  expect(res.statusCode).to.be(404);

                  _verifyInfo(_getAssetsApiUrl('/createassetapi.jpg.json'), false, done);
                });
              });
            });
          });
        });

        updateRead.pipe(update);
      });
    });

    read.pipe(req);
  });

  it('test delete wcmcommand', (done) => {
    _createDirectory(_getAssetsApiUrl('/wcmcommand'), () => {
      const req = request({
        url: _getUrl('/bin/wcmcommand'),
        method: 'POST'
      });

      req.on('response', (res) => {
        expect(res).to.be.ok();
        expect(res.statusCode).to.be(200);

        _verifyInfo(_getAssetsApiUrl('/wcmcommand'), false, done);
      });

      const form = req.form();
      form.append('path', '/content/dam/wcmcommand');
      form.append('cmd', 'deletePage');
      form.append('force', 'true');
    });
  });

  it('test move', (done) => {
    _createDirectory(_getAssetsApiUrl('/move_dir'), () => {
      request({
        url: _getAssetsApiUrl('/move_dir'),
        method: 'MOVE',
        headers: {
          'X-Destination': _getAssetsApiUrl('/moved_dir')
        }
      }, (err, res) => {
        expect(err).not.to.be.ok();
        expect(res).to.be.ok();
        expect(res.statusCode).to.be(201);

        _verifyInfo(_getAssetsApiUrl('/move_dir.json'), false, () => {
          _verifyInfo(_getAssetsApiUrl('/moved_dir.json'), true, done);
        });
      });
    });
  });

  it('test move with subdirs', (done) => {
    _createDirectory(_getAssetsApiUrl('/move_subdir'), () => {
      _createDirectory(_getAssetsApiUrl('/move_subdir/subdir'), () => {
        const read = new MockReadableStream('move... me...');
        const req = request({
          url: _getAssetsApiUrl('/move_subdir/subdir/moveme.jpg'),
          method: 'POST'
        });

        req.on('response', res => {
          expect(res).to.be.ok();
          expect(res.statusCode).to.be(201);

          request({
            url: _getAssetsApiUrl('/move_subdir'),
            method: 'MOVE',
            headers: {
              'X-Destination': _getAssetsApiUrl('/new_subdir')
            }
          }, (err, res) => {
            expect(err).not.to.be.ok();
            expect(res).to.be.ok();
            expect(res.statusCode).to.be(201);

            _verifyInfo(_getAssetsApiUrl('/new_subdir/subdir'), true, () => {
              _verifyInfo(_getAssetsApiUrl('/move_subdir/subdir'), false, () => {
                _verifyInfo(_getAssetsApiUrl('/new_subdir/subdir/moveme.jpg'), true, () => {
                  _verifyInfo(_getAssetsApiUrl('/move_subdir/subdir/'), false, done);
                });
              });
            });
          });
        });

        read.pipe(req);
      });
    });
  });

  it('test put', (done) => {
    const read = new MockReadableStream('test put');
    const updateRead = new MockReadableStream('updated');
    const req = request({
      url: _getAssetsApiUrl('/testput.jpg'),
      method: 'POST'
    });

    req.on('response', res => {
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(201);

      request(_getAssetsApiUrl('/testput.jpg.json'), (err, res, body) => {
        expect(err).not.to.be.ok();
        expect(res).to.be.ok();
        expect(res.statusCode).to.be(200);
        expect(body).to.be.ok();

        const prevProperties = JSON.parse(body).properties;

        const update = request({
          url: _getAssetsApiUrl('/testput.jpg'),
          method: 'PUT'
        });

        update.on('response', res => {
          expect(res).to.be.ok();
          expect(res.statusCode).to.be(200);

          request(_getAssetsApiUrl('/testput.jpg.json'), (err, res, body) => {
            expect(err).not.to.be.ok();
            expect(res).to.be.ok();
            expect(res.statusCode).to.be(200);

            const currProperties = JSON.parse(body).properties;
            const prevLastModified = prevProperties['jcr:lastModified'];
            const currLastModified = currProperties['jcr:lastModified'];
            expect(prevLastModified).to.be.ok();
            expect(currLastModified).to.be.ok();
            expect(prevLastModified).not.to.be(currLastModified);

            done();
          });
        });
        updateRead.pipe(update);
      });
    });

    read.pipe(req);
  });
});
