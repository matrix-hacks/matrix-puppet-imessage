const Promise = require('bluebird');
const exec = require('child_process').exec;
const config = require('../config.json');

module.exports = function(id, name) {
  return new Promise(function(resolve, reject) {
    exec(`find ${config.attachmentsDir}/*/*/${name}/${id}`, function(err, stdout, stderr) {
      if (err) {
        console.error(stderr);
        return reject(err);
      } else {
        return resolve(stdout.trim());
      }
    });
  });
};
