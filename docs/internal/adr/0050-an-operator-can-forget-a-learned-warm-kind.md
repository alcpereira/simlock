# 0050. An operator can forget a learned warm kind

- **Status:** Proposed
- **Date:** 2026-10-28
- **Issue:** none; opened as a draft PR from a lab worker's report.
- **Narrows:** [ADR 0038](0038-the-warm-pool-learns-its-kinds-from-leases-and-boots-for-every-queued-request.md)
  §4 (when a kind is forgotten) gains one way, the operator's
  `warm.forget`. Its rejected alternative "Forget a kind after a fixed
  time" stays rejected: nothing here expires a kind on its own.

## Context

A lab Mac worker has two managed Android slots. A quoting mistake leased
`--device Pixel` (avdmanager's generic `pixel` profile) instead of
`Pixel 9`. Both leases were released. Since then the stray "Pixel"
emulator has stayed booted: `status` shows `managed 2/2, running 2`, and
`simlock cleanup --dry-run` proposes nothing.

That is ADR 0038 working as written. The kind `android/Pixel/36/full` is
learned; `targetedDevices()` keeps one ready device of every learned kind,
so `idle-shutdown` spares it and `idle-destroy` never sees it. Leasing
evicts it when another model needs the slot, and a newer learned kind
displaces it (§3), so nothing is blocked. But the slot and its RAM are
spent on a kind nobody wants until then.

There is no supported way to undo one mistaken lease. `device remove` is
for physical devices only, no operation forgets one kind, and `nuke`
resets every lease and forgets every kind. The only workaround is to stop
the daemon and delete rows from `state.db` by hand.

```mermaid
stateDiagram-v2
  [*] --> Learned: lease.granted of a virtual device
  Learned --> Forgotten: simlock warm forget
  Learned --> Forgotten: catalog, 3 failed boots, 33rd kind, nuke (ADR 0038 §4)
  Forgotten --> Unkept: its device is no longer kept
  Unkept --> [*]: idle-shutdown, then idle-destroy
  Forgotten --> Learned: its next lease
```

## Decision

An admin operation, `warm.forget { platform, model, osVersion?, mode?,
imageTag? }`, forgets every learned kind of the model on the platform,
narrowed by each field given. It answers `{ forgotten: [...] }` with each
kind's platform, model, OS version, mode and image tag, logs one `info`
line per kind, and asks for a pass.

It does not act on a device. The device is no longer kept, so the reaper's
idle rules shut it down and delete it through `ManagedDeviceLifecycle`,
as for any idle device. A configured target is untouched. A gateway
refuses it with `UNSUPPORTED_IN_GATEWAY_MODE`, like `nuke.run`.

The CLI is `simlock warm forget <platform> <model> [<os>] [--mode]
[--image-tag] [--json]`; the admin client's method is `forgetWarmKind`.
The protocol version rises by one.

## Consequences

- Undoing a mistaken lease is one command. Both idle rules count from the
  lease's end, so a device whose lease ended long ago is shut down and
  deleted on the reaper's next runs.
- The next lease of the model learns the kind again.
- Nobody notices a stray kind on a worker nobody watches: it holds its
  slot until another kind needs it, as before.
- No HTTP route or MCP tool: the CLI and the admin client cover the
  operator, and an agent never needs it.

## Alternatives considered

- **Expire a learned kind after a time with no lease.** Deferred: ADR 0038
  rejected it, leasing's eviction already keeps a stray kind from blocking
  anything, and a kind leased less often than the time would pay a cold
  boot. It can be proposed again if workers show kinds piling up.
- **A virtual-device delete on `device remove`.** Rejected: the idle rules
  already delete an unkept device through the lifecycle, and a second
  delete path would need its own claim and revalidation.
- **Forget through `nuke`.** Rejected: it ends every lease and forgets
  every kind, iOS included.
