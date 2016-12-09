using terms from application "Messages"
	on message received message from this_buddy for this_chat with this_text
		set this_name to the name of this_buddy
		(*do shell script "/bin/bash /Users/keyvan/Workspace/imessage-bridge/incoming-event.sh"*)
		do shell script "cat >>/Users/keyvan/Workspace/imessage-bridge/log <<BRIDGENOTIFY_EOF
" & this_text & "
" & this_text & "

BRIDGENOTIFY_EOF"
		return true
	end message received
	
	on message sent theMessage for theChat
		
	end message sent
	
	on active chat message received
		
	end active chat message received
	
	on chat room message received theMessage from theBuddy for theChat
		
	end chat room message received
	
	on addressed chat room message received theMessage from theBuddy for theChat
		
	end addressed chat room message received
	
	on addressed message received theMessage from theBuddy for theChat
		
	end addressed message received
	
	on av chat started
		
	end av chat started
	
	on av chat ended
		
	end av chat ended
	
	on login finished for theService
		
	end login finished
	
	on logout finished for theService
		
	end logout finished
	
	on buddy became available theBuddy
		
	end buddy became available
	
	on buddy became unavailable theBuddy
		
	end buddy became unavailable
	
	on completed file transfer
		
	end completed file transfer
end using terms from
