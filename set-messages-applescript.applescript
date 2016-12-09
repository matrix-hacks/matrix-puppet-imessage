tell application "Messages" to activate
tell application "System Events" to tell process "Messages"
	keystroke "," using command down
	delay 0.5
	set my_target to (pop up button 3 of group 1 of window "General")
	click my_target
	click menu item "BridgeNotify.applescript" of menu of my_target
	tell application "Messages" to close window "General"
	"Bridge notifier installed successfully!"
end tell
