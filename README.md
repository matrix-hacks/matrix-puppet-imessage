# imessage-bridge

This is a Matrix bridge for Apple iMessage

## requirements

You need a Mac with a functional Messages.app, already authenticated.

The bridge uses applescripts for outbound messages and watches `~/Library/Containers/com.apple.iChat/Data/Library/Messages/Archive` for incoming messages.

## installation

clone this repo

cd into the directory

run `npm install`

## configure

Copy `config.sample.json` to `config.json` and update it to match your setup

## register the app service

Generate a yaml file with `node index.js -r -u "https://your.matrix.homeserver"`

Update `app_service_config_files` with the path to this yaml file.

# TODO

* Be able to originate conversations from the Matrix side.
* Use the roomStore and userStore features instead of node-persist

