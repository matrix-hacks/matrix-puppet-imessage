const Promise = require('bluebird');
const readFile = Promise.promisify(require('simple-plist').readFile);
const spawn = require('child_process').spawn;
const path = require('path');
const ichat2json = path.join(__dirname, 'bin', 'ichat2json');
const JSONStream = require('JSONStream');
const crypto = require('crypto');
const createHash = (input) => 
  crypto.createHash('md5').update(input).digest("hex")

const normalize = ({message, date, sender, subject}) => ({
  hash: createHash(message+date+sender+subject),
  isMe: sender.match(/^e:/),
  message, date, sender, subject
})

module.exports = function(ichatFilePath) {
  return {
    getMessages: () => {
      return new Promise(function(resolve, reject) {
        var messages = [];
        var errors = [];
        var proc = spawn(ichat2json, [ichatFilePath]);
        proc.stdout
          .pipe(JSONStream.parse())
          .on('data', msg => messages.push(normalize(msg)))
        proc.stderr
          .on('data', data => errors.push(data.toString()))
        proc.on('exit', function(status) {
          if (status != 0) {
            reject(errors.join());
          } else {
            resolve(messages);
          }
        });
      });
    }
  }
}
