#!/bin/zsh
# Saves your Google AI Studio (Gemini) key into .env.local without showing it on screen.
# .env.local is ignored by git, so the key is never committed. Only tools/voices-gemini.mjs reads it.
cd "$(dirname "$0")/.." || exit 1
while true; do
  print -n "Paste your Gemini key (it won't show), then press Return: "
  read -rs key
  print
  key="${key//[[:space:]]/}"   # drop stray spaces or line breaks from the paste
  key="${key//\"/}"; key="${key//\'/}"
  if (( ${#key} >= 30 )); then break; fi
  print "That was only ${#key} characters. A Gemini key is about 39 and starts with AIza."
  print "In AI Studio, press the copy icon next to the key, then paste here again."
done
print -r -- "GEMINI_API_KEY=$key" > .env.local
print "saved (${#key} characters, starts with ${key[1,4]})"
unset key
