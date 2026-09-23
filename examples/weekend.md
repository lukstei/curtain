# Weekend Readiness Protocol

Decide whether it is safe to clock out for the weekend.

## If: Is it past Friday 4:00 PM?
Check the current day and local time.

### If: Is the git working directory clean?
Run `git status --porcelain` to check for unstaged or uncommitted changes.

#### Gate: Confirm Slack post
Ready to notify the team that you are heading out?

#### Announce on Slack
Use the Slack CLI to post "Happy weekend!" to #general.

#### No: Dirty working tree
Say: "Commit your changes before going home!"

### No: Still on the clock
Calculate the remaining time and say: "Sorry, you still have X days and X hours left to work."
