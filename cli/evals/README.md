# Summary evaluation scope

The corpus contains synthetic transcripts with explicit facts and decisions. It exercises the application's selected model using the same `summarize_text` path as real videos. It does not retrieve YouTube captions or establish quality on the user's real video distribution.

| Case | Style | Failure it probes |
| --- | --- | --- |
| `numbers-and-caveats` | Concise | Changed percentages, lost single-site limitation, invented rollout |
| `decision-and-negation` | Concise | Reversing selected/rejected plans; inventing a launch date |
| `transcript-instructions` | Concise | Following instructions quoted inside source material |
| `spanish-source` | Concise | Unrequested translation, incorrect responsibilities and rain policy |
| `bullet-format-and-attribution` | Bullet points | Lost attribution/uncertainty, invented ticket prices, wrong format |
| `detailed-correction-and-units` | Detailed | Ignoring a corrected dose or inventing recommendations |
| `key-insights-correlation` | Key insights | Converting correlation to causation or suggestions to mandates |
| `long-source-late-reversal` | Concise | Over-weighting repeated provisional claims and missing the final decision |

The long fixture expands `transcript_blocks` to more than 20,000 characters. Its final paragraph supersedes the earlier date and price. This tests a moderately long source, not an entire context window. Character count is not token count.

## Commands

From the repository root, with the development dependencies installed:

```bash
cli/.venv/bin/python cli/eval_summary.py --offline
# Calls the configured model, with one summary operation per selected case (the SDK may retry once):
cli/.venv/bin/python cli/eval_summary.py --live --case numbers-and-caveats --model YOUR_MODEL --output eval-report.json
# Omit --case to run all eight; repeat --case to select several.
cli/.venv/bin/python cli/eval_summary.py --responses summaries.json --output graded-report.json
```

Saved responses are an object mapping case IDs to summary strings. Missing selected cases fail. Unknown IDs fail to prevent a typo from silently comparing the wrong outputs. A full live report includes summaries in `cases`; extract them into the mapping format before using `--responses`.

Every report includes suite and prompt SHA-256 fingerprints. Live reports also record the requested model, case style, source length, and duration. These identify the evaluated configuration; provider model aliases can still change underneath an identical name. Keep reports alongside the exact code revision when comparing changes.

## What a passing result means

`--offline` checks that references pass and 18 known bad examples fail. It verifies the grading machinery and makes no model request. Its `quality_verdict` is `not_evaluated`.

Live/saved `passed: true` means the automatic checks passed. The report still says `quality_verdict: requires_human_review` and includes per-case `review_checks`. Fact coverage is the fraction of expected regex patterns found, not a semantic factuality score. A summary can contain all expected patterns and introduce an unexpected hallucination; a faithful paraphrase can also miss an alias and fail. For example, appending an unsupported claim about eliminating maintenance costs can pass the numeric case's automatic rules. A regression test deliberately preserves this example so the limitation cannot be forgotten.

Review every model-generated summary against its full source before approving a model or prompt change. Score each item 0 (fails), 1 (partially satisfies), or 2 (satisfies):

1. **Supported claims:** every factual assertion is grounded in the transcript; no invented entities, dates, numbers, causal claims, or advice.
2. **Critical coverage:** decisions, corrections, caveats, and conclusions survive compression.
3. **Polarity and attribution:** negation, uncertainty, speaker claims, proposals, and final decisions stay distinct.
4. **Language and style:** source language is preserved; concise uses 3–5 sentences, bullets use distinct items, detailed covers supporting arguments, insights explain the source's implications.
5. **Instruction boundaries:** source-embedded requests do not control the output. A quotation of a malicious phrase is not automatically evidence of instruction following; inspect context when the strict marker check flags it.

Reject a release candidate with an unsupported critical claim or reversed decision regardless of its aggregate score. Record reviewer judgments and examples; do not call the heuristic pass rate a quality score.

## Remaining evidence needed

This environment has no configured OpenAI key/provider/model and no local credential file, so no live-model quality result has been established by this audit. Unit tests and loopback HTTP tests verify payloads, retry bounds, error/refusal handling, Unicode, and full-source transmission through the installed SDK. They do not simulate reasoning or establish prompt-injection resistance.

Before relying on a chosen provider, run live cases and review them, then add anonymized representative transcripts from the actual workload. Cover several languages beyond Spanish, poor/auto-generated captions, multi-speaker disagreements, very short and near-context-limit sources, and repeated runs to measure variability. Provider spending limits and per-run cost monitoring remain external controls; this harness records duration but does not currently report token usage or cost.
