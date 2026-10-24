# Pack transfer network policy — 24.10.2026, #931 / #935

Condition A: a running native transfer must stop when its connection is no longer allowed.
Condition F: architecture documents all learning languages and deliberately waiting for unknown cost.

## Automated proof

`packTransfer.test.ts`: five assertions failed with the former
`File.downloadFileAsync` transfer (network changes were ignored, no listener cleanup).
With the cancellable transfer, all nine cases pass: metered/disconnected/unknown changes,
unknown initial state, success/error cleanup, a stale initial fetch after a network event,
invalid/cancelled native results, and cellular connections reporting an unmetered plan. `pronunciationPackStorage.test.ts` additionally proves
that cancellation skips verification/publication and removes the partial directory only
after the transfer settles. Ten tests pass in total.

## POCO X3 proof

Existing installed development client, USB 35b1c1c; no native build or reinstall.
A temporary entry imported the production `downloadPack` helper unchanged. It downloaded a
40 MiB response from a local HTTP server through `adb reverse`, throttled to 64 KiB/100 ms.
The entry logged NetInfo events and file sizes; it did not load the application, contact its
backend or call a model. The machine test lock was held. The original entry was restored.

While bytes were arriving, Android's real network policy was changed to metered with
`adb shell cmd netpolicy set metered-network <connected-SSID> true`.
NetInfo emitted a disconnect/reconnect transition, then Wi-Fi with
`isConnectionExpensive: true`. The download rejected with `model_network_changed`;
the server observed its connection close at 2,490,368 bytes.
The local file stayed at exactly 2,490,368 bytes two seconds later and was deleted by the
harness. See `device.txt`. Thus cancellation was native, not merely an ignored JS result.
The setting was restored to `undefined` (its original value), the client stopped, both
reverse mappings removed and the temporary servers stopped.

**Limit:** both SIM slots report `ABSENT`; an actual Wi-Fi → cellular handover cannot be
verified on this device. The device run proves native cancellation on a real disallowed
network event, while the automated test supplies the metered-mobile network condition.
The harness verifies the transfer helper; partial-directory cleanup is covered by the
storage regression, not by a complete on-device pack installation.

No live model calls, production writes, deployment changes or native builds. Cost: $0.00.
