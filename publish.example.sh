#!/usr/bin/env bash
#
# Generates minutes for the directory given

echo "Generating minutes and social media posts for $1"
DATESTR=`echo $1 | cut -f2 -d/`
MESSAGE="Add text minutes and audio logs for $DATESTR telecon."

# Generate minutes
nodejs index.js -d $1 -m -i
git add $1/irc.log $1/index.html $1/audio.ogg
git commit $1/irc.log $1/index.html $1/audio.ogg $1/../index.html -m "$MESSAGE"
git push
