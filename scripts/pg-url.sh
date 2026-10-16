#!/usr/bin/env sh
# Host and port of a Postgres URL, for scripts that only need to know whether the server answers
# (issue #791). Source it (". scripts/pg-url.sh") and call `lb_pg_host_port "$url"`: it prints
# "host port". Every form the tests are given is read: with or without user and password (a
# password may hold an encoded or a bare "@"), with or without port (5432) and database, query
# parameters, and an IPv6 host in brackets. Tested in tools/guards/machine-lock.test.mjs.

lb_pg_host_port() {
  rest="${1#*://}"
  # The authority ends at the first "/" or "?": the database and its parameters are not read.
  rest="${rest%%/*}"
  rest="${rest%%\?*}"
  # The user (and password) end at the LAST "@": a bare "@" in a password stays on its side.
  case "$rest" in *@*) rest="${rest##*@}" ;; esac
  case "$rest" in
    \[*\]:*)
      host="${rest#\[}"
      host="${host%%\]*}"
      port="${rest##*\]:}"
      ;;
    \[*\])
      host="${rest#\[}"
      host="${host%\]}"
      port=''
      ;;
    *:*)
      host="${rest%%:*}"
      port="${rest##*:}"
      ;;
    *)
      host="$rest"
      port=''
      ;;
  esac
  echo "${host:-localhost} ${port:-5432}"
}
