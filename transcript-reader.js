var Promise = require('bluebird');
var readFile = Promise.promisify(require('simple-plist').readFile);

module.exports = function(ichatFilePath) {
  return {
    read: () => readFile(ichatFilePath),
    parse: (data) => {
      return new Promise(function(resolve, reject) {
        console.log(data.$objects[2]);
        resolve([])
      });
    }
  }
}
