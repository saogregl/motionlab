# Incident Debugging

Use this workflow when runtime, protocol, or packaging behavior breaks in a way that is not isolated to one file.

## Steps

1. Capture the failing command, environment, and exact error.
2. Classify the failure: app bootstrap, protocol, native build, runtime, or docs/process.
3. Identify the affected subsystem docs and ADRs.
4. Add or update a brief or issue with reproduction details.
5. Land the fix with updated docs or diagnostics if the gap was architectural.
