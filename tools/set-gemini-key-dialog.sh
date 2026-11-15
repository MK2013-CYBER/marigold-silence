#!/bin/zsh
# Same as set-gemini-key.sh, but asks in a Mac pop-up window (hidden text box) instead of the terminal.
# The key goes straight into .env.local (ignored by git) and is never printed.
cd "$(dirname "$0")/.." || exit 1
for try in 1 2 3; do
  key=$(osascript -e 'text returned of (display dialog "Paste your Google AI Studio (Gemini) key, then click Save. It stays hidden." default answer "" with hidden answer buttons {"Cancel", "Save"} default button "Save" with title "The Marigold Silence: voices")' 2>/dev/null) || { print "cancelled"; exit 1; }
  key="${key//[[:space:]]/}"; key="${key//\"/}"; key="${key//\'/}"
  if (( ${#key} >= 30 )); then
    print -r -- "GEMINI_API_KEY=$key" > .env.local
    print "saved (${#key} characters, starts with ${key[1,4]})"
    unset key
    exit 0
  fi
  osascript -e "display dialog \"That was only ${#key} characters. A Gemini key is about 39 and starts with AIza. In AI Studio, click the copy icon next to the key and try again.\" buttons {\"OK\"} default button \"OK\" with title \"The Marigold Silence: voices\"" >/dev/null 2>&1
done
unset key
print "no key saved"
exit 1
