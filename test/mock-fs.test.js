import {MockFs} from '../src/lib/mock-fs';
import expect from 'expect.js';
import {MockReadableStream, MockWritableStream} from "../src";

describe('mock fs tests', () => {
  let fs;

  beforeEach(() => {
    fs = new MockFs();
  });

  it('test add file', () => {
    fs.addFile('/test.jpg', {}, 'Hello World!');
    expect(fs.existsSync('/test.jpg')).to.be.ok();
  });

  it('test add directory', () => {
    fs.addDirectory('/test/dir', {});
    expect(fs.existsSync('/test/dir')).to.be.ok();
  });

  it('test remove path', () => {
    fs.addFile('/testremove.jpg', {}, 'Hello remove!');
    expect(fs.existsSync('/testremove.jpg')).to.be.ok();
    fs.removePath('/testremove.jpg');
    expect(fs.existsSync('/testremove.jpg')).not.to.be.ok();
    fs.removePath('/testremove.jpg');
  });

  it('test get file content', () => {
    fs.addFile('/testfilecontent', {}, 'my content');
    expect(fs.getFileContent('/testfilecontent')).to.be('my content');
  });

  it('test touch file', (done) => {
    fs.addFile('/touchfile.jpg', {}, 'touched');
    const origStat = fs.statSync('/touchfile.jpg');
    process.nextTick(() => {
      fs.touchFile('/touchfile.jpg');
      const newStat = fs.statSync('/touchfile.jpg');
      expect(newStat.mtime).not.to.be(origStat.mtime);
      done();
    });
  });

  it('test remove path with sub directories', () => {
    fs.addDirectory('/test/path/with/sub');
    expect(fs.existsSync('/test')).to.be.ok();
    expect(fs.existsSync('/test/path')).to.be.ok();
    expect(fs.existsSync('/test/path/with')).to.be.ok();
    expect(fs.existsSync('/test/path/with/sub')).to.be.ok();

    fs.removePath('/test');
    expect(fs.existsSync('/test')).not.to.be.ok();
    expect(fs.existsSync('/test/path')).not.to.be.ok();
    expect(fs.existsSync('/test/path/with')).not.to.be.ok();
    expect(fs.existsSync('/test/path/with/sub')).not.to.be.ok();
  });

  it('test open close', (done) => {
    fs.addFile('/testopen.jpg', {}, 'Hello open!');
    fs.open('/testopen.jpg', 'r', (err, fd) => {
      expect(err).not.to.be.ok();
      expect(fd).not.to.be(undefined);

      fs.close(fd, (err) => {
        expect(err).not.to.be.ok();

        fs.close(fd, (err) => {
          expect(err).to.be.ok();

          fs.open('/idonotexist.jpg', 'r', (err, fd) => {
            expect(err).to.be.ok();
            expect(fd).not.to.be.ok();
            done();
          });
        });
      });
    });
  });

  it('test open create file', () => {
    fs.openSync('/opennoexist.jpg', 'w');
    expect(fs.existsSync('/opennoexist.jpg')).to.be.ok();
  });

  it('test create read write stream', (done) => {
    fs.addFile('/testwrite.jpg', {}, '');

    const read = new MockReadableStream('Hello write stream!');
    const write = fs.createWriteStream('/testwrite.jpg');
    read.pipe(write);

    write.on('finish', () => {
      const updatedRead = fs.createReadStream('/testwrite.jpg');
      const targetWrite = new MockWritableStream();
      targetWrite.on('finish', () => {
        expect(targetWrite.getContent()).to.be('Hello write stream!');
        done();
      });
      updatedRead.pipe(targetWrite);
    });
  });

  it('test create write stream no exist', () => {
    fs.createWriteStream('/doesnotexist.jpg');
    expect(fs.existsSync('/doesnotexist.jpg')).to.be.ok();

    let threw = false;
    try {
      fs.createWriteStream('/missingparent/doesnotexist.jpg');
    } catch (e) {
      threw = true;
    }
    expect(threw).to.be.ok();
  });

  it('test exists', (done) => {
    fs.addFile('/testexists.jpg', {}, '');

    fs.exists('/testexists.jpg', (err, exists) => {
      expect(err).not.to.be.ok();
      expect(exists).to.be.ok();

      fs.exists('/testnoexists.jpg', (err, exists) => {
        expect(err).not.to.be.ok();
        expect(exists).not.to.be.ok();
        done();
      });
    });
  });

  it('test fstat', (done) => {
    fs.addFile('/testfstat.jpg', {}, 'test file');

    fs.open('/testfstat.jpg', 'r', (err, fd) => {
      expect(err).not.to.be.ok();
      fs.fstat(fd, (err, stats) => {
        expect(err).not.to.be.ok();
        expect(stats).to.be.ok();

        const newTimestamp = new Date();
        const newTimestampMs = newTimestamp.getTime();

        setTimeout(() => {
          expect(stats.isFile()).to.be.ok();
          expect(stats.isDirectory()).not.to.be.ok();
          expect(stats.size).to.be(9);
          expect(stats.atime).to.be.ok();
          expect(stats.mtime).to.be.ok();
          expect(stats.ctime).to.be.ok();
          expect(stats.birthtime).to.be.ok();

          stats.atime = newTimestamp;
          stats.mtime = newTimestamp;
          stats.ctime = newTimestamp;
          stats.birthtime = newTimestamp;

          expect(stats.atimeMs).to.be(newTimestampMs);
          expect(stats.mtimeMs).to.be(newTimestampMs);
          expect(stats.ctimeMs).to.be(newTimestampMs);
          expect(stats.birthtimeMs).to.be(newTimestampMs);

          done();
        }, 10);
      });
    });
  });

  it('test ftruncate', (done) => {
    fs.addFile('/testftruncate.jpg', {}, 'test ftruncate');

    fs.open('/testftruncate.jpg', 'r', (err, fd) => {
      expect(err).not.to.be.ok();
      fs.fstat(fd, (err, stats) => {
        expect(err).not.to.be.ok();
        expect(stats).to.be.ok();
        expect(stats.size).to.be(14);

        fs.ftruncate(fd, 1, (err) => {
          expect(err).not.to.be.ok();

          fs.fstat(fd, (err, stats) => {
            expect(err).not.to.be.ok();
            expect(stats).to.be.ok();
            expect(stats.size).to.be(1);

            fs.ftruncate(fd, (err) => {
              expect(err).not.to.be.ok();

              fs.fstat(fd, (err, stats) => {
                expect(err).not.to.be.ok();
                expect(stats).to.be.ok();
                expect(stats.size).to.be(0);
                done();
              });
            });
          });
        });
      });
    });
  });

  it('test mkdir', (done) => {
    fs.mkdir('/testmkdir', (err) => {
      expect(err).not.to.be.ok();
      expect(fs.existsSync('/testmkdir')).to.be.ok();

      fs.mkdir('/testmkdir/target/no/exists', (err) => {
        expect(err).to.be.ok();
        done();
      });
    });
  });

  it('test mkdirp sync', () => {
    fs.mkdirpSync('/test/path/with/mkdirp');
    expect(fs.existsSync('/test')).to.be.ok();
    expect(fs.existsSync('/test/path')).to.be.ok();
    expect(fs.existsSync('/test/path/with')).to.be.ok();
    expect(fs.existsSync('/test/path/with/mkdirp')).to.be.ok();
  });

  it('test read', (done) => {
    fs.addFile('/testread.jpg', {}, 'test read content');
    fs.open('/testread.jpg', 'r', (err, fd) => {
      expect(err).not.to.be.ok();
      expect(fd).to.be.ok();

      const buffer = Buffer.alloc(8);
      fs.read(fd, buffer, 0, 6, 0, (err, bytesRead, readBuffer) => {
        expect(err).not.to.be.ok();
        expect(bytesRead).to.be(6);
        expect(readBuffer.toString('utf8')).to.be('test r');
        expect(buffer.toString('utf8').substr(0, 6)).to.be('test r');

        fs.read(fd, buffer, 6, 2, 6, (err, bytesRead, readBuffer) => {
          expect(err).not.to.be.ok();
          expect(bytesRead).to.be(2);
          expect(readBuffer.toString('utf8')).to.be('ea');
          expect(buffer.toString('utf8')).to.be('test rea');
          done();
        });
      });
    });
  });

  it('test readdir', (done) => {
    fs.addDirectory('/test');
    fs.addFile('/testfile.jpg');
    fs.addFile('/testfile2.jpg');

    fs.readdir('/', (err, list) => {
      expect(err).not.to.be.ok();
      expect(list).to.be.ok();
      expect(list.length).to.be(3);
      expect(list[0]).to.be('test');
      expect(list[1]).to.be('testfile.jpg');
      expect(list[2]).to.be('testfile2.jpg');

      fs.readdir('/test', (err, list) => {
        expect(err).not.to.be.ok();
        expect(list.length).to.be(0);

        fs.readdir('/testfile.jpg', (err, list) => {
          expect(err).to.be.ok();
          expect(list).not.to.be.ok();

          fs.readdir('/doesnotexist', (err, list) => {
            expect(err).to.be.ok();
            expect(list).not.to.be.ok();
            done();
          });
        });
      });
    });
  });

  it('test readFile', (done) => {
    fs.addFile('/testreadfile.jpg', {}, 'test read file');

    fs.readFile('/testreadfile.jpg', (err, contents) => {
      expect(err).not.to.be.ok();
      expect(contents).to.be.ok();
      expect((contents instanceof Buffer)).to.be.ok();
      done();
    });
  });

  it('test rename', () => {
    fs.addDirectory('/test/path/to/move');
    expect(fs.existsSync('/test')).to.be.ok();
    expect(fs.existsSync('/test/path')).to.be.ok();
    expect(fs.existsSync('/test/path/to')).to.be.ok();
    expect(fs.existsSync('/test/path/to/move')).to.be.ok();

    fs.renameSync('/test', '/new');
    expect(fs.existsSync('/test')).not.to.be.ok();
    expect(fs.existsSync('/test/path')).not.to.be.ok();
    expect(fs.existsSync('/test/path/to')).not.to.be.ok();
    expect(fs.existsSync('/test/path/to/move')).not.to.be.ok();

    expect(fs.existsSync('/new')).to.be.ok();
    expect(fs.existsSync('/new/path')).to.be.ok();
    expect(fs.existsSync('/new/path/to')).to.be.ok();
    expect(fs.existsSync('/new/path/to/move')).to.be.ok();
  });

  it('test rmdir', (done) => {
    fs.addDirectory('/test');
    fs.addFile('/testrmdir.jpg');

    expect(fs.existsSync('/test')).to.be.ok();

    fs.rmdir('/test', (err) => {
      expect(err).not.to.be.ok();
      expect(fs.existsSync('/test')).not.to.be.ok();

      fs.rmdir('/test', (err) => {
        expect(err).to.be.ok();

        fs.rmdir('/testrmdir.jpg', (err) => {
          expect(err).to.be.ok();
          done();
        });
      });
    });
  });

  it('test stat', (done) => {
    fs.addDirectory('/teststat');
    fs.addFile('/teststat.jpg');

    fs.stat('/teststat', (err, stats) => {
      expect(err).not.to.be.ok();
      expect(stats).to.be.ok();

      expect(stats.isDirectory()).to.be.ok();
      expect(stats.isFile()).not.to.be.ok();
      expect(stats.atime).to.be.ok();
      expect(stats.mtime).to.be.ok();
      expect(stats.ctime).to.be.ok();
      expect(stats.birthtime).to.be.ok();

      fs.stat('/teststat.jpg', (err, stats) => {
        expect(err).not.to.be.ok();
        expect(stats).to.be.ok();

        expect(stats.isFile()).to.be.ok();
        expect(stats.isDirectory()).not.to.be.ok();

        fs.stat('/idonotexist.jpg', (err, stats) => {
          expect(err).to.be.ok();
          expect(err.code).to.be('ENOENT');
          expect(stats).not.to.be.ok();
          done();
        });
      });
    });
  });

  it('test truncate', (done) => {
    fs.addFile('/teststat.jpg', {}, '');
    fs.addDirectory('/testtruncate');

    fs.truncate('/teststat.jpg', 2, (err) => {
      expect(err).not.to.be.ok();

      const stats = fs.statSync('/teststat.jpg');
      expect(stats.size).to.be(2);

      fs.truncate('/teststat.jpg', (err) => {
        expect(err).not.to.be.ok();

        const stats = fs.statSync('/teststat.jpg');
        expect(stats.size).to.be(0);

        fs.truncate('/idonotexist.jpg', (err) => {
          expect(err).to.be.ok();

          fs.truncate('/testtruncate', (err) => {
            expect(err).to.be.ok();
            done();
          });
        });
      });
    });
  });

  it('test unlink', (done) => {
    fs.addFile('/testunlink.jpg');
    fs.addDirectory('/testunlink');

    fs.unlink('/testunlink.jpg', (err) => {
      expect(err).not.to.be.ok();
      expect(fs.existsSync('/testunlink.jpg')).not.to.be.ok();

      fs.unlink('/testunlink', (err) => {
        expect(err).to.be.ok();
        fs.unlink('/idonotexist.jpg', (err) => {
          expect(err).to.be.ok();
          done();
        });
      });
    });
  });

  it('test write', (done) => {
    fs.addFile('/testwrite.jpg');

    const fd = fs.openSync('/testwrite.jpg');
    fs.truncateSync('/testwrite.jpg', 12);

    const buffer = Buffer.from('hello world!');

    fs.write(fd, 'hello', 0, 'ascii', (err, written, writtenString) => {
      expect(err).not.to.be.ok();
      expect(written).to.be(5);
      expect(writtenString).to.be('hello');
      expect(fs.getFileContent('/testwrite.jpg').substr(0, 5)).to.be('hello');

      fs.write(fd, buffer, 5, 7, 5, (err, written, writtenData) => {
        expect(err).not.to.be.ok();
        expect(written).to.be(7);
        expect(Buffer.isBuffer(writtenData)).to.be.ok();
        expect(writtenData.toString('utf8')).to.be(' world!');
        expect(fs.getFileContent('/testwrite.jpg')).to.be('hello world!');
        done();
      });
    });
  });

  it('test writeFile', (done) => {
    fs.addFile('/testwritefile.jpg');

    fs.writeFile('/testwritefile.jpg', 'test write file data', (err) => {
      expect(err).not.to.be.ok();
      expect(fs.getFileContent('/testwritefile.jpg')).to.be('test write file data');

      const stats = fs.statSync('/testwritefile.jpg');
      expect(stats.size).to.be(20);
      done();
    });
  });
});
