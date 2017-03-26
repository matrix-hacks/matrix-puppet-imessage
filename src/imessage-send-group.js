const spawn = require('child_process').spawn;

const escapeString = (str) => {
  return str.replace(/[\\"]/g, '\\$&');
};

module.exports = function(handles, _message, file) {
  let message =  escapeString(_message);
  let args = ['-e'];

  let buddyVars = [];
  let buddySetters = [];
  handles.forEach((handle, i)=>{
    const buddyVar = 'buddy'+i;
    buddyVars.push(buddyVar);
    buddySetters.push(`set ${buddyVar} to first buddy whose handle is "${handle}"`);
  });

  const tellBody = () => {
    if ( file ){
      return `
      set theAttachment1 to POSIX file "${file}"
      send theAttachment1 to thisChat
      `;
    } else {
      return `send "${message}" to thisChat`;
    }
  };

  args.push(`tell application "Messages"
    activate
    ${buddySetters.join('\n\t')}
    set thisChat to make new text chat with properties {participants:{${buddyVars.join(',')}}}
    ${tellBody()}
  end tell`);

  console.log('full applescript', args[1]);

  return new Promise(function(resolve, reject) {
    // Check user input
    if (!handles) reject(new Error('You didn\'t enter a recipient!'));
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

  const handles = [
    process.env.PHONE1,
    process.env.PHONE2
  ];

  module.exports(handles, "testing group send from javascript (no image)..");
  module.exports(handles, "testing group send from javascript (with image)..", __dirname+"/../mr-goldenfold.png");
}


