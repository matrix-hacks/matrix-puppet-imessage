const spawn = require('child_process').spawn;
const sms = 'service "SMS"';
const imessage = '(service 1 whose service type is iMessage)';

const escapeString = (str) => {
  return str.replace(/[\\"]/g, '\\$&');
};

module.exports = function(to, _message, _method) {
  let method = _method === 'sms' ? sms : imessage;
  let message =  escapeString(_message);
  console.log('escaped to', message);
  let args = ['-e'];

  // If string contains letters, it must be a contact name so
  // find the relevant phone number first
  if (/[a-z]/i.test(to)) {
    args.push(`tell application "Contacts"
    set i to value of phone 1 of (person 1 whose name = "${to}")
    end tell
    tell application "Messages"
    send "${message}" to buddy i of ${method}
    end tell`);
  } else {
    args.push(`tell application "Messages"
    send "${message}" to buddy "${to}" of ${method}
    end tell`);
  }
  console.log('full applescript', args[1]);

  return new Promise(function(resolve, reject) {
    // Check user input
    if (!to) reject(new Error('You didn\'t enter a recipient!'));
    else if (!message) reject(new Error('You didn\'t enter a message!'));
    else {
      var proc = spawn('/usr/bin/osascript', args );
      proc.stdout.pipe(process.stdout);
      proc.stderr.pipe(process.stderr);
      proc.on('exit', function(exitCode)  {
        if (exitCode != 0)  {
          reject(new Error('exited nonzero'));
        } else {
          resolve('SENT');
        }
      });
    }
  });
};

if (!module.parent) {
  module.exports('***REMOVED***', "test Morty's Math Teacher", 'iMessage');
}

