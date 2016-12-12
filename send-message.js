const spawn = require('child_process').spawn;

const sms = 'service "SMS"';
const imessage = '(service 1 whose service type is iMessage)';

/**
 * A fork of 
 * https://github.com/tomhardman0/imailer/blob/610156a1e9187fa1c73848e800914eb4de5fb329/index.js
 * in order to be able to `require` it
 *
 * # Usage
 * 
 * `sendMessage(<to>, <message>, [<sms|imessage>])` => Promise
 * 
 * - `[<to>]`
 * - Phone number, contact, or email address for iMessages.
 * - Phone number only for sms.
 * - `[<message>]`
 * - Single words can be unquoted, otherwise the message should be surrounded by quotation marks.
 * - `[<sms|imessage>]`
 * - Specify sms to send via sms or leave blank to send iMessages.
 * 
 * ## Examples
 * 
 * `sendMessage("+447463 383 992", "Hi Jeff!")`
 * 
 * `sendMessage("07352009813", "Hi again Jeff!", "sms")`
 **/
var escapeString = (str) => {
  return str.replace(/[\\"]/g, '\\$&')
}
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
          resolve('SENT')
        }
      })
    }
  });
}
