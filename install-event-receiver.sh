#!/bin/bash

SCRIPT_NAME="BridgeNotify.applescript"
SRC="$PWD/$SCRIPT_NAME"
SCRIPTS_DIR="$HOME/Library/Application Scripts/com.apple.iChat"
DEST="$SCRIPTS_DIR/$SCRIPT_NAME"

if [[ -f "$SRC" ]]; then
  if [[ -f "$DEST" ]]; then
    rm "$DEST"
    echo "deleted $DEST"
  fi
  cp "$SRC" "$DEST" && {
    echo "copied $SRC to $DEST"
    echo "configuring Messages.app to use the script as its event handler"
    if [[ -z $SKIP_CONFIGURE_MESSAGES ]]; then
      osascript set-messages-applescript.applescript
    fi
  }
else
  echo "missing $TARGET"
fi
