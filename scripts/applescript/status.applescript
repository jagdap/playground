-- Prints: state, track name, artist (one per line). Never launches Music.
if application "Music" is not running then return "stopped"
tell application "Music"
	set s to player state as string
	if s is "stopped" then return "stopped"
	set t to current track
	return s & linefeed & (name of t) & linefeed & (artist of t)
end tell
