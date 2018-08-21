import expect from 'expect.js';
import {
  registerMock,
  requireMocks,
  getRequireMockPath,
  setUrlResponse,
  resetRequestState} from '../src';

registerMock('mime', {
  getType: () => {
    return 'you are being mocked!';
  }
});

const sample_es = requireMocks(getRequireMockPath(__dirname, './samplemodule'));
const sample = requireMocks(getRequireMockPath(__dirname, './samplemodule'));

describe('framework tests', () => {
  before(() => {
    resetRequestState();
    setUrlResponse('GET', 'http://www.samplemoduleunittest.com', {statusCode: 200}, 'Hello Testing World!');
  });

  it('test register es mock', (done) => {
    sample_es((err, res, body, mimeType) => {
      expect(err).not.to.be.ok();
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(200);
      expect(body).to.be('Hello Testing World!');
      expect(mimeType).to.be('you are being mocked!');
      done();
    });
  });

  it('test register mock', (done) => {
    sample((err, res, body, mimeType) => {
      expect(err).not.to.be.ok();
      expect(res).to.be.ok();
      expect(res.statusCode).to.be(200);
      expect(body).to.be('Hello Testing World!');
      expect(mimeType).to.be('you are being mocked!');
      done();
    });
  });
});
