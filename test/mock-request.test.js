import expect from 'expect.js';
import {request} from '../src/lib/mock-request';
import {
  registerRequestCallback,
  registerUrlCallback,
  resetRequestState,
  getRequestedUrlCount,
  getRequestedUrlOptions} from '../src/lib/mock-request';

import {MockWritableStream} from '../src/lib/mock-writable-stream';
import {MockReadableStream} from '../src/lib/mock-readable-stream';

describe('mock request tests', () => {
  beforeEach(() => {
    resetRequestState();

    registerRequestCallback((options, callback) => {
      const {url} = options;
      if (url === 'http://www.adobe.com/request.jpg') {
        callback(null, options, {statusCode: 200}, 'Hello World!');
      } else {
        callback();
      }
    });

    registerUrlCallback('GET', 'http://www.adobe.com/get.jpg', (options, callback) => {
      callback(null, {statusCode: 200}, 'Hello There!');
    });
  });

  it('test get url no callback', (done) => {
    const req = request('http://www.adobe.com/request.jpg');
    req.on('response', (res) => {
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(200);

      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        expect(body).to.be('Hello World!');
        done();
      })
    });
  });

  it('test get url callback', (done) => {
    request('http://www.adobe.com/get.jpg', (err, res, body) => {
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(200);
      expect(body).to.be('Hello There!');
      done();
    });
  });

  it('test get pipe', (done) => {
    const write = new MockWritableStream();

    write.on('finish', () => {
      done();
    });

    const req = request('http://www.adobe.com/get.jpg');
    req.on('response', (res) => {
      res.pipe(write);
    });
  });

  it('test get url not found no callback', (done) => {
    const req = request('http://www.adobe.com');
    req.on('response', (res) => {
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(404);
      done();
    });
  });

  it('test get url not found callback', (done) => {
    request('http://www.adobe.com', (err, res, body) => {
      expect(err).not.to.be.ok();
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(404);
      expect(body).not.to.be.ok();
      done();
    });
  });

  it('test post url no callback', (done) => {
    const read = new MockReadableStream('Hello World...');

    const req = request({
      url: 'http://www.adobe.com/test.jpg',
      method: 'POST'
    });
    req.on('response', (res) => {
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(201);
      request('http://www.adobe.com/test.jpg', (err, res, body) => {
        expect(err).not.to.be.ok();
        expect(res).to.be.ok();
        expect(res.statusCode).to.be(200);
        expect(res.headers['Content-Type']).to.be('image/jpeg');
        expect(res.headers['Content-Length']).to.be(14);
        expect(body).to.be('Hello World...');
        done();
      });
    });
    read.pipe(req);
  });

  function submitRequestWithBody(options, body, callback) {
    const read = new MockReadableStream(body);

    const req = request(options, callback);
    read.pipe(req);
  }

  it('test post url conflict', (done) => {
    const options = {
      url: 'http://www.adobe.com/testconflict.jpg',
      method: 'POST'
    };
    submitRequestWithBody(options, 'Conflicting!', (err, res) => {
      expect(err).not.to.be.ok();
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(201);

      submitRequestWithBody(options, 'Conflict2', (err, res) => {
        expect(err).not.to.be.ok();
        expect(res).to.be.ok();
        expect(res.statusCode).to.be(409);

        request('http://www.adobe.com/testconflict.jpg', (err, res, body) => {
          expect(err).not.to.be.ok();
          expect(res).to.be.ok();
          expect(res.statusCode).to.be(200);
          expect(body).to.be('Conflicting!');
          done();
        });
      });
    });
  });

  it('test post url registered conflict', (done) => {
    submitRequestWithBody({
      url: 'http://www.adobe.com/get.jpg',
      method: 'POST'
    }, 'Hello Conflict!', (err, res) => {
      expect(err).to.be.ok();
      expect(res).not.to.be.ok();
      done();
    });
  });

  it('test post url parent no exist', (done) => {
    submitRequestWithBody({
      url: 'http://www.adobe.com/noexist/post.jpg',
      method: 'POST'
    }, 'missing!', (err, res) => {
      expect(err).not.to.be.ok();
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(404);
      done();
    });
  });

  it('test delete not found', (done) => {
    request({
      url: 'http://www.adobe.com/missing.jpg',
      method: 'DELETE'
    }, (err, res) => {
      expect(err).not.to.be.ok();
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(404);
      done();
    });
  });

  it('test delete', (done) => {
    submitRequestWithBody({
      url: 'http://www.adobe.com/deleteme.jpg',
      method: 'POST'
    }, 'Delete... me...', (err, res) => {
      expect(err).not.to.be.ok();
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(201);

      request({
        url: 'http://www.adobe.com/deleteme.jpg',
        method: 'DELETE'
      }, (err, res) => {
        expect(err).not.to.be.ok();
        expect(res).to.be.ok();
        expect(res.statusCode).to.be(200);

        request('http://www.adobe.com/deleteme.jpg', (err, res) => {
          expect(err).not.to.be.ok();
          expect(res).to.be.ok();
          expect(res.statusCode).to.be(404);
          done();
        });
      });
    });
  });

  it('test put not found', (done) => {
    submitRequestWithBody({
      url: 'http://www.adobe.com/missing.jpg',
      method: 'PUT'
    }, 'Missing', (err, res) => {
      expect(err).not.to.be.ok();
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(404);
      done();
    });
  });

  it('test put', (done) => {
    submitRequestWithBody({
      url: 'http://www.adobe.com/updateme.jpg',
      method: 'POST'
    }, 'init data', (err, res) => {
      expect(err).not.to.be.ok();
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(201);

      submitRequestWithBody({
        url: 'http://www.adobe.com/updateme.jpg',
        method: 'PUT'
      }, 'updated', (err, res) => {
        expect(err).not.to.be.ok();
        expect(res).to.be.ok();
        expect(res.statusCode).to.be(200);

        request('http://www.adobe.com/updateme.jpg', (err, res, body) => {
          expect(err).not.to.be.ok();
          expect(res).to.be.ok();
          expect(res.statusCode).to.be(200);
          expect(body).to.be('updated');
          done();
        });
      });
    });
  });

  it('test move not found', (done) => {
    request({
      url: 'http://www.adobe.com/source.jpg',
      method: 'MOVE',
      headers: {
        'X-Destination': '/target.jpg'
      }
    }, (err, res) => {
      expect(err).not.to.be.ok();
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(404);
      done();
    });
  });

  it('test move conflict', (done) => {
    submitRequestWithBody({
      url: 'http://www.adobe.com/source.jpg',
      method: 'POST'
    }, 'move content', (err, res) => {
      expect(err).not.to.be.ok();
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(201);

      submitRequestWithBody({
        url: 'http://www.adobe.com/target.jpg',
        method: 'POST'
      }, 'conflict', (err, res) => {
        expect(err).not.to.be.ok();
        expect(res).to.be.ok();
        expect(res.statusCode).to.be(201);

        request({
          url: 'http://www.adobe.com/source.jpg',
          method: 'MOVE',
          headers: {
            'X-Destination': '/target.jpg'
          }
        }, (err, res) => {
          expect(err).not.to.be.ok();
          expect(res).to.be.ok();
          expect(res.statusCode).to.be(409);
          done();
        });
      });
    });
  });

  it('test move', (done) => {
    submitRequestWithBody({
      url: 'http://www.adobe.com/source.jpg',
      method: 'POST'
    }, 'move me!', (err, res) => {
      expect(err).not.to.be.ok();
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(201);

      request({
        url: 'http://www.adobe.com/source.jpg',
        method: 'MOVE',
        headers: {
          'X-Destination': 'http://www.adobe.com/target.jpg'
        }
      }, (err, res) => {
        expect(err).not.to.be.ok();
        expect(res).to.be.ok();
        expect(res.statusCode).to.be(201);

        request('http://www.adobe.com/source.jpg', (err, res) => {
          expect(err).not.to.be.ok();
          expect(res).to.be.ok();
          expect(res.statusCode).to.be(404);

          request('http://www.adobe.com/target.jpg', (err, res, body) => {
            expect(err).not.to.be.ok();
            expect(res).to.be.ok();
            expect(res.statusCode).to.be(200);
            expect(body).to.be('move me!');
            done();
          });
        });
      });
    });
  });

  it('test move bad destination', (done) => {
    request({
      url: 'http://www.adobe.com/target.jpg',
      method: 'MOVE'
    }, (err, res) => {
      expect(err).not.to.be.ok();
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(400);
      done();
    });
  });

  it('test move subdirs', (done) => {
    request({
      url: 'http://www.adobe.com/move_dir',
      method: 'POST'
    }, (err, res) => {
      expect(err).not.to.be.ok();
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(201);

      request({
        url: 'http://www.adobe.com/move_dir/subdir',
        method: 'POST'
      }, (err, res) => {
        expect(err).not.to.be.ok();
        expect(res).to.be.ok();
        expect(res.statusCode).to.be(201);

        registerUrlCallback('GET', 'http://www.adobe.com/move_dir/subdir/testfile.jpg', (options, callback) => {
          callback(null, {statusCode: 200});
        });

        request({
          url: 'http://www.adobe.com/move_dir',
          method: 'MOVE',
          headers: {
            'X-Destination': 'http://www.adobe.com/new_dir'
          }
        }, (err, res) => {
          expect(err).not.to.be.ok();
          expect(res).to.be.ok();
          expect(res.statusCode).to.be(201);

          request('http://www.adobe.com/new_dir/subdir', (err, res) => {
            expect(err).not.to.be.ok();
            expect(res).to.be.ok();
            expect(res.statusCode).to.be(200);

            request('http://www.adobe.com/move_dir/subdir', (err, res) => {
              expect(err).not.to.be.ok();
              expect(res).to.be.ok();
              expect(res.statusCode).to.be(404);

              request('http://www.adobe.com/new_dir/subdir/testfile.jpg', (err, res) => {
                expect(err).not.to.be.ok();
                expect(res).to.be.ok();
                expect(res.statusCode).to.be(200);

                request('http://www.adobe.com/move_dir/subdir/testfile.jpg', (err, res) => {
                  expect(err).not.to.be.ok();
                  expect(res).to.be.ok();
                  expect(res.statusCode).to.be(404);
                  done();
                });
              });
            });
          });
        });
      });
    });
  });

  it('test registered url error callback', done => {
    registerUrlCallback('GET', 'http://www.adobe.com/error.jpg', (options, callback) => {
      callback('there was an error');
    });

    request('http://www.adobe.com/error.jpg', (err, res) => {
      expect(err).to.be.ok();
      expect(res).not.to.be.ok();
      done();
    });
  });

  it('test registered url error event', done => {
    registerUrlCallback('GET', 'http://www.adobe.com/errorevent.jpg', (options, callback) => {
      callback('we have a problem');
    });

    var req = request('http://www.adobe.com/errorevent.jpg');
    req.on('error', err => {
      expect(err).to.be.ok();
      done();
    });
  });

  it('test registered request error callback', done => {
    registerRequestCallback((options, callback) => {
      callback('we got issues');
    });

    request('http://www.adobe.com', (err, res) => {
      expect(err).to.be.ok();
      expect(res).not.to.be.ok();
      done();
    });
  });

  it('test registered request error event', done => {
    registerRequestCallback((options, callback) => {
      callback('events are fun');
    });

    var req = request('http://www.adobe.com');
    req.on('error', err => {
      expect(err).to.be.ok();
      done();
    });
  });

  it('test registered url modify data', done => {
    registerUrlCallback('GET', 'http://www.adobe.com/registered.jpg', (options, callback) => {
      expect(options).to.be.ok();

      const {url, method, myCustomOption} = options;
      expect(url).to.be('http://www.adobe.com/registered.jpg');
      expect(method).to.be('GET');
      expect(myCustomOption).to.be('hello');

      callback(null, {statusCode: 206, headers: {'my-header': 'world!'}}, 'response, yo!');
    });

    request({
      url: 'http://www.adobe.com/registered.jpg',
      method: 'GET',
      myCustomOption: 'hello'
    }, (err, res, body) => {
      expect(err).not.to.be.ok();
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(206);
      expect(res.headers['my-header']).to.be('world!');
      expect(body).to.be('response, yo!');
      done();
    });
  });

  it('test register request modify data', done => {
    registerRequestCallback((options, callback) => {
      expect(options).to.be.ok();

      const {url, method, myCustomOption} = options;
      expect(url).to.be('http://www.adobe.com');
      expect(method).to.be('WHOA');
      expect(myCustomOption).to.be('hello');

      options.url = 'http://www.adobe.com/modified.jpg';
      options.method = 'GET';

      callback(null, options, {statusCode: 206, headers: {'my-header': 'worldses!'}}, 'my response');
    });

    request({
      url: 'http://www.adobe.com',
      method: 'WHOA',
      myCustomOption: 'hello'
    }, (err, res, body) => {
      expect(err).not.to.be.ok();
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(206);
      expect(res.headers['my-header']).to.be('worldses!');
      expect(body).to.be('my response');
      done();
    });
  });

  it('test get requested url information', done => {
    request('http://www.adobe.com/get.jpg', () => {
      expect(getRequestedUrlCount('GET', 'http://www.adobe.com/get.jpg')).to.be(1);

      const {url} = getRequestedUrlOptions('GET', 'http://www.adobe.com/get.jpg');
      expect(url).to.be('http://www.adobe.com/get.jpg');

      submitRequestWithBody({
        url: 'http://www.adobe.com/count.jpg',
        method: 'POST'
      }, 'hello', () => {
        expect(getRequestedUrlCount('GET', 'http://www.adobe.com/count.jpg')).to.be(0);
        expect(getRequestedUrlCount('POST', 'http://www.adobe.com/count.jpg')).to.be(1);

        const {url, method} = getRequestedUrlOptions('POST', 'http://www.adobe.com/count.jpg', 0);
        expect(url).to.be('http://www.adobe.com/count.jpg');
        expect(method).to.be('POST');

        expect(getRequestedUrlOptions('POST', 'http://www.adobe.com/count.jpg', 1)).not.to.be.ok();

        done();
      });
    });
  });
});
