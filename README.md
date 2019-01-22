# matrix-puppet-imessage

This is a Matrix bridge for Apple iMessage

## requirements

You need a Mac with a functional Messages.app, already authenticated.

The bridge uses applescripts for outbound messages and watches `~/Library/Containers/com.apple.iChat/Data/Library/Messages/Archive` for incoming messages, parsed with [ichat2json](https://github.com/kfatehi/ichat2json).

## installation

clone this repo

cd into the directory

run `npm install`

## configure

Copy `config.sample.json` to `config.json` and update it to match your setup

## register the app service

Generate an `imessage-registration.yaml` file with `node index.js -r -u "http://your-bridge-server:8090"`

Note: The 'registration' setting in the config.json needs to set to the path of this file. By default, it already is.

Copy this `imessage-registration.yaml` file to your home server, then edit it, setting its url to point to your bridge server. e.g. `url: 'http://your-bridge-server.example.org:8090'`

Edit your homeserver.yaml file and update the `app_service_config_files` with the path to the `imessage-registration.yaml` file.

Launch the bridge with ```node index.js```.

Restart your HS.

# TODO
* Be able to originate conversations from the Matrix side.
