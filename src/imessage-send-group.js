const spawn = require('child_process').spawn;

const escapeString = (str) => {
  return str.replace(/[\\"]/g, '\\$&');
};

module.exports = function(id, _message, file) {
  console.log(id);
  let message =  escapeString(_message);
  let args = ['-e'];

  const setAttachment = `
    tell application "System Events"
      set theAttachment to POSIX file "${file}"
    end tell
  `;

  const sendAttachment = `
    send theAttachment to thisChat
  `;

  const sendMessage = `
    send "${message}" to thisChat
  `;

  args.push(`
    ${file ? setAttachment : ''}

    tell application "Messages"
      activate
      set thisChat to a reference to chat id "iMessage;+;${id}"
      ${file ? sendAttachment : sendMessage}
    end tell
  `);

  console.log('full applescript', args[1]);

  return new Promise(function(resolve, reject) {
    // Check user input
    if (!id) reject(new Error('You didn\'t enter a chat id!'));
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
