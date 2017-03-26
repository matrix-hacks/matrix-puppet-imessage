const spawn = require('child_process').spawn;
const sms = 'service "SMS"';
const imessage = '(service 1 whose service type is iMessage)';

const escapeString = (str) => {
  return str.replace(/[\\"]/g, '\\$&');
};

module.exports = function(to, _method, _message, file) {
  let method = _method === 'sms' ? sms : imessage;
  let message =  escapeString(_message);
  console.log('escaped to', message);
  let args = ['-e'];

  const tellBody = () => {
    if ( file ){
      return `
      set theAttachment1 to POSIX file "${file}"
      send theAttachment1 to buddy "${to}" of ${method}
      `;
    } else {
      return `send "${message}" to buddy "${to}" of ${method}`;
    }
  };

  args.push(`tell application "Messages"
    activate
    ${tellBody()}
    end tell`);

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
  module.exports(process.env.PHONE1, "iMessage", "test Morty's Math Teacher (no image)");
  module.exports(process.env.PHONE1, "iMessage", "test Morty's Math Teacher (with image)", __dirname+"/../mr-goldenfold.png");
}
