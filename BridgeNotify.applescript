on notify_bridge(this_buddy, this_chat, the_text)
	set bridge_notify_target_path to "/Users/keyvan/Workspace/imessage-bridge/bin/bridge-notify-target"
	set endpoint to "http://localhost:4005/events"
	set {id:s_id, name:s_name, service:{id:svc_id, name:svc_name}, handle:s_handle} to this_buddy
	do shell script (bridge_notify_target_path & " <<EOF
Endpoint: " & endpoint & "
SenderId: " & s_id & "
SenderName: " & s_name & "
SenderHandle: " & s_handle & "
ServiceName: " & svc_name & "
Text: " & the_text & "
EOF")
end notify_bridge

using terms from application "Messages"
	on message received message from this_buddy for this_chat with the_text
		notify_bridge(this_buddy, this_chat, the_text)
		return true
	end message received
	
	on message sent
		
	end message sent
	
	on active chat message received message from this_buddy for this_chat with the_text
		notify_bridge(this_buddy, this_chat, the_text)
		return true
	end active chat message received
	
	on chat room message received message from this_buddy for this_chat with the_text
		notify_bridge(this_buddy, this_chat, the_text)
		return true
	end chat room message received
	
	on addressed chat room message received message from this_buddy for this_chat with the_text
		notify_bridge(this_buddy, this_chat, the_text)
		return true
	end addressed chat room message received
	
	on addressed message received message from this_buddy for this_chat with the_text
		notify_bridge(this_buddy, this_chat, the_text)
		return true
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
