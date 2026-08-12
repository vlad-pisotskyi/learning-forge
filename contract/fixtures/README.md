# Fixtures

`tiny-topic/` is the reference topic the validator is tested against. It is the
smallest thing that satisfies the contract: two chapters, three concepts, three
excerpts, one challenge.

Its subject is invented and its sources point at `example.com` with synthetic
quotes. That is deliberate. A fixture needs stable text that never rots, and
attributing invented quotes to a real paper would be worse than inventing the paper
too. Nothing here is teaching material, and the faithfulness auditor does not run
over `contract/fixtures/`.

Check it after any contract change:

```
npm run validate -- contract/fixtures/tiny-topic --strict
```

That command must print `contract satisfied`. If it does not, either the contract
moved and the fixture has not caught up, or the validator has a bug.
