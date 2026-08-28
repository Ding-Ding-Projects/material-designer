# Emergency preservation index

This branch indexes unfinished source snapshots preserved on 2026-08-28. Each
entry is an exact remote branch ref and commit id. These refs prevent work from
being lost, but they do not mean that the source is complete, reviewed, tested,
packaged, released, or safe to merge.

Read the emergency section in `HANDOFF.md` on `main` before resuming any entry.
Create a separate working directory, inspect the recorded review findings, and
merge semantically only after the feature has passed independent review.

| Area | Remote branch | Exact commit |
|---|---|---:|
| Advanced regex | `preservation/advanced-regex-snapshot-20260828` | `01fa2e43fa8602d484c1633475964d5c149bf478` |
| Appearance deep repair | `preservation/appearance-deep-20260828` | `9327b0b0afdb0f6fb2b9543b2aab901400b02c53` |
| Appearance export schema | `preservation/appearance-export-schema-20260828` | `a13c58fd901d653e3476e9f4b021f857e48e5ef3` |
| Appearance state schema | `preservation/appearance-schema-20260828` | `64fdfb3c74af2d70d55d4b6c869736e0eb99befa` |
| Appearance source | `preservation/appearance-source-20260828` | `1860c895b9a2b7b9322882aff0e4f8438b5ac0bc` |
| Authenticator and lockout | `preservation/authenticator-lockout-20260828` | `88f3331765567514d7e199c71fe87b45bd423da8` |
| Browser downloads and confirmations | `preservation/browser-downloads-confirmations-20260828` | `794e3c5f953ebd8e2eaaa3f9440d77141be31514` |
| Build and updater | `preservation/build-updater-20260828` | `65538a62c15dee491f51445de976ff1980b3bc15` |
| Documentation evidence | `preservation/documentation-evidence-20260828` | `d7072bfbb844210e75670f935ab09261b302cd56` |
| Documentation-site parity | `preservation/documentation-site-parity-20260828` | `ad5250ebf2ba7622dd4a074dab6c38030d75754b` |
| File converter | `preservation/file-converter-snapshot-20260828` | `ac587f9bfe2fcb754b64bb2d022b7f3f061b0d76` |
| Front-screen provenance | `preservation/front-provenance-20260828` | `e9b40ad61581f30b548225fc49f896a0ed5e219c` |
| Logo customization | `preservation/logo-customization-20260828` | `cd30929bcf17a9f4c5a72f56cbdc760fa9a75b62` |
| Ollama suite | `preservation/ollama-suite-20260828` | `45df17da5e01e43b8c3da6417344d53617175702` |
| Personal vocabulary | `preservation/personal-vocabulary-snapshot-20260828` | `b5e7d76e2285f4c9855aa41ec54e913a50bf2ffb` |
| Release integrity | `preservation/release-integrity-20260828` | `7682e8a5f1980c698e68e436a1d12c9ceaa9f063` |
| Shared UI primitives | `preservation/shared-ui-primitives-20260828` | `9ed1d752178f15ff84a5365ea4c0fa6c45bffd94` |
| Tabs and history | `preservation/tabs-history-20260828` | `fd0744de4eb242169af0a68b65f2491cd880b20e` |
| Toy-lock integration | `preservation/toy-lock-integration-20260828` | `9b2e9fdda7b3fd8ac1db73087eca5a7b4d1e346d` |
| Earlier toy-lock source snapshot | `preservation/toy-lock-source-snapshot-20260828` | `941fe8bccf250a85446f081713b03bd6393b5b77` |
| Universal settings | `preservation/universal-settings-snapshot-20260828` | `9000bc2c8aba7bcaf4670846a8855e619613a6c0` |

## Verification

The index branch must be updated whenever a preservation ref changes. Verify an
entry directly with:

```sh
git ls-remote origin refs/heads/preservation/<name>
```

The returned commit must match this table exactly. A mismatch means this index
is stale and must be corrected before the ref is used.

## 廣東話摘要

呢個 branch 只係 unfinished source 嘅保存索引，唔代表完成、通過 review、測試、
打包或可以直接合併。下一手要先睇 `main` 入面 `HANDOFF.md` 嘅緊急交接段落，
再逐項核對 exact commit 同 review finding。
