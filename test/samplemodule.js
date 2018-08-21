var request = require('request');
var mime = require('mime');

module.exports = function sample(callback) {
  request('http://www.samplemoduleunittest.com', (err, res, body) => {
    callback(err, res, body, mime.getType('/test.jpg'));
  });
}
