# Governance Knowledge

To get the actual quorum for a proposal:

```bash
cast call $TREASURY_GOVERNOR "quorum(uint)(uint)" $(cast call $TREASURY_GOVERNOR "proposalSnapshot(uint)" 86654545843645364200491220873325841239317939837732580673532485559601859962180 -r $ARB_URL) -r $ARB_URL
```

To get the current quorum, use the second to last L1 block known to L2:

```bash
cast call $CORE_GOVERNOR "quorum(uint)(uint)" $(($(cast block --json -r $ARB_URL| jq -r '.l1BlockNumber') - 1)) -r $ARB_URL
```
