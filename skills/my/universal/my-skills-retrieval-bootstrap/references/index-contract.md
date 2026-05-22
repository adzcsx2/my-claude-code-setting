# Index Contract

## Use this file when

- Stage 0 responsibilities are unclear
- human-readable and machine-readable indexes are being mixed up
- retrieval logic is reading the wrong source

## Facts / Rules

- `INDEX.json` is the machine-readable package index
- `ERROR-INDEX.json` is the machine-readable error fingerprint index
- `INDEX.md` and `ERROR-INDEX.md` are human-facing, not the first-pass runtime source
- Stage 0 retrieval should score candidates from machine indexes only

## Edge cases

- If a package exists on disk but not in indexes, retrieval should treat it as absent until rebuild
- If machine and human indexes disagree, machine indexes control Stage 0 behavior

## Failure modes

- package never matches because index entries are missing
- package matches by generic text because trigger terms are too broad
- runtime reads markdown indexes first, wasting context budget
