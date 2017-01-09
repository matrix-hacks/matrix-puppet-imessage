const Promise = require('bluebird');
const path = require('path');
const ichat2json = path.join(__dirname, '..', 'bin', 'ichat2json');
const JSONStream = require('JSONStream');
const spawn = require('child_process').spawn;
const crypto = require('crypto');

const createHash = (input) =>
  crypto.createHash('md5').update(input).digest("hex");

const normalize = (msg) => {
  const {message, date, sender, subject, service} = msg;
  return Object.assign({},{
    hash: createHash(message+date+sender+subject+service),
    senderIsMe: sender.match(/^e:/),
  }, msg);
};

module.exports = function(ichatFilePath) {
  return {
    getMessages: () => {
      return new Promise(function(resolve, reject) {
        var messages = [];
        var errors = [];
        var proc = spawn(ichat2json, [ichatFilePath]);
        console.log('spawning');
        proc.stdout
          .pipe(JSONStream.parse())
          .on('data', msg => messages.push(normalize(msg)));
        proc.stderr
          .on('data', data => errors.push(data.toString()));
        proc.on('exit', function(status) {
          if (status != 0) {
            console.error(errors);
            reject(errors.join());
          } else {
            resolve(messages);
          }
        });
      });
    }
  };
};
