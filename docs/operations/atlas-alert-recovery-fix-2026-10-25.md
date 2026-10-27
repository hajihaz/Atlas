# Atlas background-alert recovery fix — 25 October 2026

Concurrent cold-start recovery could invalidate notification setup. The old
lock used a shared file pathname. Two callers could inspect the same dead-owner
record, then one could remove the other caller's newly acquired lock. An
isolated reproduction returned a public notification key different from the
key actually saved to that disposable store. No device subscription or real
notification was involved in the reproduction.

## Resulting behavior

`frontend/private-lock.js` prepares a private, nonempty lease directory with a
unique owner marker, then atomically publishes it as the operation lock. An
existing nonempty lease cannot be replaced. Recovery requires both a suitably
old marker and a confirmed dead process, and removes only that exact marker.
A successor's distinct marker cannot be deleted by an older recoverer.

Acquisition and release can safely hand over an empty directory: a successor
already contains its owner marker before publication, so an earlier `rmdir`
cannot remove the successor. A live process's old lease is retained. Corrupt,
legacy-file and symlink leases fail closed.

This changes the mutex, not the keys, subscriptions or delivery journal. Push
attempts are still reserved before network calls; uncertain delivery is not
silently retried. Provider acceptance still does not prove device delivery.

## Upgrade and verification

[Machine-readable acceptance](atlas-alert-recovery-fix-2026-10-25.json) records the isolated reproduction, final tests and owner service checks.

The owner-local UI and observer were stopped using their exact user LaunchAgent
labels before switching lock formats. A legacy regular lock file may be removed
only while these services are stopped and its recorded process is confirmed
dead. A live or unsafe lock is never force-removed. The approved service installer
then reloads both agents. The separate market recorder stays running.

The acceptance receipt records preservation of the existing notification key,
a matching API public key, healthy service readback and the original recorder
identity. It contains no private key or subscription endpoint.

Six new tests cover 12 rounds of concurrent orphan recovery (24 callers per
round), live-owner preservation, failed-action cleanup, controlled legacy
migration, symlink rejection and non-overlapping contention. The original push
tests continue to cover endpoint allowlists, private permissions, source
freshness, durable reservations and uncertain-delivery behavior.

All 430 Node tests pass. The production build and owner-browser checks pass.
The earlier HHC command change has 602 passing Python tests, 137 strictly typed
modules and a verified chat-to-Mac readback. One LEAN-data test remains skipped.
No UI component was changed by this lock fix.

Background sending remains disabled pending permitted fresh IPO data, owner
device permission and an actual delivery test. This repair does not authorize
applications, orders, spending or removal of paper risk latches. Hosted CI is
separately blocked by the GitHub account restriction, so main/production remain
gated.
