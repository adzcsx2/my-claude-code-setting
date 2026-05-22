# Load Stages

## Use this file when

- the package expansion path is unclear
- too many files are being read for one prompt
- Stage 2/3 boundaries are getting blurred

## Facts / Rules

- Stage 0 reads machine indexes only
- Stage 1 reads `SKILL.md` for top candidates
- Stage 2 reads one `default_read_next` for the selected package
- Stage 3 reads one exact `reference` or `examples` file only when needed
- Stage 4 stops expansion by default

## Edge cases

- single-file atoms may end after Stage 1 because `default_read_next` is `null`
- routers may route directly to a specific reference file instead of a playbook

## Failure modes

- reading multiple packages in Stage 2
- preloading whole directories
- continuing to read after a sufficient plan already exists
- using README content in the runtime path
