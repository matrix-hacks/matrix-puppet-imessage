#!/bin/bash
# This is what the applescript does
bin/bridge-notify-target <<EOF
Endpoint: http://localhost:4005/events
Name: hello this is a name
Summary: some stuff bla bla
EOF
