import request from 'request';
import mime from 'mime';

export default function sample(callback) {
  request('http://www.samplemoduleunittest.com', (err, res, body) => {
    callback(err, res, body, mime.getType('/test.jpg'));
  });
}
