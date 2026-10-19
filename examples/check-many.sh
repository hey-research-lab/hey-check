#!/usr/bin/env bash
# Run hey-check over a list of Robinhood Chain tokens or projects and print one tab-separated row
# each: the input, HEY's outcome, the activity status, the last meaningful ship and the HEY page.
#
#   examples/check-many.sh examples/inputs.txt
#   examples/check-many.sh my-list.txt > dev-check.tsv
#
# Needs bash and jq. Runs `npx -y github:hey-research-lab/hey-check` unless HEY_CHECK names
# another command (for a local build: HEY_CHECK="node dist/cli.js"). One check at a time, one
# second apart: HEY's public API allows 120 requests a minute per client without a key.
set -euo pipefail

list=${1:?usage: check-many.sh <file with one input per line>}
read -r -a hey_check <<<"${HEY_CHECK:-npx -y github:hey-research-lab/hey-check}"
command -v jq >/dev/null || { echo "check-many.sh needs jq (https://jqlang.org)" >&2; exit 2; }

printf 'input\toutcome\tstatus\tlast_ship\tpage\n'
first=1
while IFS= read -r line || [[ -n "$line" ]]; do
  input=${line%$'\r'}
  [[ -z "${input// /}" || "$input" == \#* ]] && continue
  ((first)) || sleep 1
  first=0
  # Exit 0 answered, 4 not published, 7 several matches: each still prints one JSON document.
  # Any other code is an error that document describes (see the README's exit codes).
  set +e
  doc=$("${hey_check[@]}" "$input" --json --no-card 2>/dev/null)
  code=$?
  set -e
  if [[ -z "$doc" ]]; then
    printf '%s\terror (exit %s)\t\t\t\n' "$input" "$code"
    continue
  fi
  jq -r --arg input "$input" '
    [ $input,
      (if .ok then .outcome else "error: " + (.error.code // "unknown") end),
      ( if .outcome == "answered" then (.builder.activityLabel // "")
        elif .outcome == "ambiguous" then
          "\(.candidatesTotal.count)\(if .candidatesTotal.atLeast then "+" else "" end) matches; pass a slug or the contract"
        elif .outcome == "not_found" then "not a published project on HEY"
        else "" end ),
      ((.builder.lastMeaningfulShipAt // "") | .[0:10]),
      (.page // .notFound.scanUrl // "")
    ] | @tsv' <<<"$doc"
done <"$list"
