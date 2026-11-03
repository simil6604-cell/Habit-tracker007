#!/usr/bin/env sh
#
# What the host runs to bring the app up.
#
# It exists because the start command used to be
#
#   npx prisma db push --skip-generate && npm run start
#
# and that "&&" is a single point of failure for the entire site. Any reason
# the schema push fails — and the realistic one is that a deploy overlaps,
# with the old instance still holding the SQLite file while the new one starts
# — takes the whole app down with it. The visible result is a 502 on every
# page, which says nothing about a database and looks like the app is gone.
#
# So: try the push, retry it a couple of times because a lock is temporary,
# and start the app either way. A site that is up with a schema one column
# behind is recoverable, and the app says so on its own Settings page. A site
# that does not start is not recoverable by anyone but whoever reads the logs.

set -u

ATTEMPTS=3
WAIT=5

attempt=1
while [ "$attempt" -le "$ATTEMPTS" ]; do
  if npx prisma db push --skip-generate; then
    echo "[start] database schema is up to date"
    break
  fi

  if [ "$attempt" -lt "$ATTEMPTS" ]; then
    echo "[start] schema update failed (attempt $attempt of $ATTEMPTS) — retrying in ${WAIT}s."
    echo "[start] The usual cause is the previous instance still holding the database during a deploy."
    sleep "$WAIT"
  else
    echo "[start] WARNING: the database schema could not be updated after $ATTEMPTS attempts."
    echo "[start] Starting the app anyway so the site stays up. Anything needing a new column will"
    echo "[start] fail until this is sorted; open Settings — 'Is everything set up right?' names"
    echo "[start] exactly what is missing — and redeploy to try again."
  fi
  attempt=$((attempt + 1))
done

# exec, so the web server is PID 1 and gets the host's stop signals directly
# rather than having them swallowed by this script.
exec npm run start
