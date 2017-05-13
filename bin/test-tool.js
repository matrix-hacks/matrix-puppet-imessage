#!/usr/bin/env node
const path = require('path');
const [_bin, script, cmd, ...rest] = process.argv;

function help() {
  const app = path.basename(script);
  return `
  Usage: ${app} [cmd] [args]
    Examples
      Send a message:
        ${app} send "555-555-5555" "hello world"
      Test the transcript reader:
        ${app} tr /path/to/transcript.ichat
  `;
}

if (cmd === "send") {
  const Client = require('../src/client');
  const client = new Client();
  const [to, body] = rest;
  client.sendMessage(to, 'iMessage', body);
} else if (cmd === "tr") {
  const TR = require('../src/transcript-reader');
  const [filepath] = rest;
  TR(filepath).getMessages().map((message)=>{
    console.log(message.message);
  });
} else {
  process.stdout.write(help());
}
