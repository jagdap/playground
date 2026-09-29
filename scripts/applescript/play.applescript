-- Resumes playback, or starts the named playlist (argument 1) if nothing is queued.
on run argv
	tell application "Music"
		if player state is playing then return "playing"
		if player state is stopped and (count of argv) > 0 and (item 1 of argv) is not "" then
			play playlist (item 1 of argv)
		else
			play
		end if
	end tell
	return "playing"
end run
