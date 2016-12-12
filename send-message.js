const exec = require('child_process').exec;

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
var escapeString = require('escape-string-applescript');
module.exports = function(to, _message, _method) {
  let message = escapeString(_message);
  let method = _method === 'sms' ? sms : imessage;
  let command;

  // If string contains letters, it must be a contact name so
  // find the relevant phone number first
  if (/[a-z]/i.test(to)) {
    command = `/usr/bin/osascript -e 'tell application "Contacts"
    set i to value of phone 1 of (person 1 whose name = "${to}")
    end tell
    tell application "Messages"
    send "${message}" to buddy i of ${method}
    end tell'`;
  } else {
    command = `/usr/bin/osascript -e 'tell application "Messages"
    send "${message}" to buddy "${to}" of ${method}
    end tell'`;
  }
  
  return new Promise(function(resolve, reject) {
    // Check user input
    if (!to) reject(new Error('You didn\'t enter a recipient!'));
    else if (!message) reject(new Error('You didn\'t enter a message!'));
    else {
      exec(command, (err, stdout, stderr) => {
        if (err) {
          if (/-1719/.test(err)) reject(new Error(`Couldn't find a number for ${to}`));
          else reject(new Error(err));
        }
        else resolve({ to, message, method, status: 'sent' })
      });
    }
  });
}
