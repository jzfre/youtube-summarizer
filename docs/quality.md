# Quality checks and operations

This application fetches existing YouTube captions, selects a likely original-language track, and sends the text to an OpenAI-compatible chat completion API. It does not download video, transcribe audio, persist results, or run a background queue. The browser calls authenticated Next.js routes; each processing request launches a bounded Python subprocess and reads JSON.

## Repeatable local checks

From the repository root:

```bash
python3 -m venv cli/.venv
cli/.venv/bin/python -m pip install -r cli/requirements-dev.txt
cli/.venv/bin/python -m pytest cli -q
cli/.venv/bin/python cli/eval_summary.py --offline
cd web-ui
npm ci
npm test
npm run lint
npx tsc --noEmit
npm run build
node scripts/smoke.mjs
node scripts/resilience.mjs
npx playwright install chromium
npm run test:e2e
```

Python tests include mocked units, the installed YouTube library with a transport adapter, and the actual OpenAI SDK against a local HTTP server. Web tests use requests and real child processes; browser tests exercise login, redirects, cancellation, results, clipboard, reset, session expiry, and logout. Production resilience checks verify concurrent load shedding, child termination, recovery, and stalled HTTP uploads. The web smoke script starts the production build on an ephemeral port and checks real HTTP authentication and processing routes using a local fixture runner. No credentials are needed and these checks do not spend API credit. CI runs Python on 3.11 and 3.12, Node on 22, and builds a container to check runtime imports, login-page liveness, non-root execution, and unauthenticated API rejection.

Runtime Python versions are pinned in `cli/requirements.lock`; development dependencies are in `cli/requirements-dev.txt`. Node installations use `npm ci` and the committed lockfile. To intentionally refresh the Python lock:

```bash
uv pip compile --universal --python-version 3.11 cli/requirements.txt -o cli/requirements.lock
```

Then install into a fresh virtual environment and rerun tests/evals. Original-language selection uses a private `youtube-transcript-api` metadata method; pinned dependencies and regression fixtures reduce upgrade risk but cannot prevent upstream YouTube changes. Run `npm audit` and an appropriate Python dependency scanner during dependency upgrades; tests alone do not establish dependency security.

## Summary evaluations

`python cli/eval_summary.py --offline` validates the fixture dataset and checks that deterministic graders accept reference summaries and reject known failures. It is a reproducible check of the evaluation machinery, not evidence that a live model currently produces good summaries.

`python cli/eval_summary.py --live --model <model> --output report.json` sends eight fixture transcripts to the configured provider and spends API credit. The cases cover all four summary styles, numeric caveats, negation, embedded instructions, Spanish, attribution, corrections, causation, and a long source with a final reversal. See [evaluation methodology](../cli/evals/README.md) for the case-level rubric and known grader limitations. `--responses summaries.json` instead grades saved responses shaped as `{ "case_id": "summary text" }`; all checks passing exits 0, any failed check exits 1. Set `OPENAI_API_KEY` and `OPENAI_MODEL` first; `OPENAI_BASE_URL` is optional. Run live evaluations when changing prompts, model, or provider, and review generated text for factual consistency, important omissions, preservation of uncertainty, style, and instructions embedded in captions. Keyword-based checks are useful regression signals but cannot prove factual correctness or prompt-injection resistance. These fixtures do not contact YouTube, so they cannot validate live caption retrieval.

The existing default model name is `gpt-5.6-sol`. Availability depends on your provider/account; configure a supported model explicitly rather than assuming that name is available. The web form's default uses the server configuration; custom model selection overrides it.

## API contract

All processing routes require the session cookie issued by `POST /api/auth/login`. Send JSON objects with `Content-Type: application/json`; the request body limit is 16 KiB. URLs are restricted to supported YouTube hosts and forms, or exact 11-character video IDs.

| Route | Request fields | Successful `data` |
| --- | --- | --- |
| `POST /api/summarize` | `video` (required), `model`, `summaryType`, `showTranscript`, `languages` | `videoId`, `transcriptLength`, `summary`, optional `transcript` |
| `POST /api/transcript` | `video` (required), optional `languages` array | `videoId`, `transcript` |
| `POST /api/list-transcripts` | `video` (required) | `videoId`, `transcripts` |

Successful responses have `success: true`; errors have `success: false`, a readable `error`, and a stable `code`. Processing responses include `X-Request-ID` and `Cache-Control: no-store`. The UI shows the reference ID on processing failures; correlate it with JSON server logs (`operation`, `status`, `code`, `durationMs`). Logs omit video IDs, captions, passwords, and upstream response text. Processing routes authenticate in `processingResponse` before consuming their bodies; add that wrapper to any new processing route. They deliberately bypass page middleware because Next middleware buffers request bodies before route execution. Summary styles are `concise`, `detailed`, `bullet-points`, and `key-insights`. Language preferences accept at most 10 codes. Omitted/empty language preferences use the original-language heuristic. Explicit language preferences are tried in order; missing preferred tracks produce an error instead of silently choosing an unrelated language.

| Status | Meaning |
| --- | --- |
| 400 | Malformed JSON, wrong field types, or invalid video/model/style/language |
| 401 | Missing, expired, or invalid session |
| 408 | Request body did not finish within 10 seconds |
| 413 | Request exceeds the body limit |
| 422 | No suitable transcript, or selected model context window exceeded |
| 429 | Login attempt limit reached; honor `Retry-After` |
| 499 | Client request cancelled |
| 500 | Unexpected internal failure |
| 502 | Python/upstream processing failure or invalid subprocess output |
| 503 | Processing concurrency exhausted, configuration invalid, YouTube blocked the server, or provider quota/rate limit |
| 504 | Processing exceeded the subprocess deadline |

## Bounds and failure behavior

| Limit | Default | Configuration |
| --- | --- | --- |
| Active Python processes | 4 per Node server process | `PYTHON_MAX_CONCURRENT` |
| Request body deadline | 10,000 ms | API constant |
| Browser request deadline | 600,000 ms; user can cancel earlier | UI constant |
| Process deadline | 600,000 ms | `PYTHON_TIMEOUT_MS` |
| Combined stdout/stderr | 4 MiB | `PYTHON_MAX_OUTPUT_BYTES` |
| Transcript size for summaries | 350,000 characters | CLI constant |
| YouTube connection/read timeouts | 10 / 30 seconds per request | CLI constants |
| OpenAI timeout/retries | 90 seconds / 1 retry | CLI constructor |
| Login attempts | 5 per minute per bucket | Server limiter |

Long transcripts are rejected, not truncated. YouTube bodies are buffered by the upstream library before the text limit is checked. Network timeouts are inactivity limits; the overall 600-second deadline belongs to the web subprocess wrapper. Standalone CLI use has no equivalent total deadline (use an external process deadline for automation). Character counts are not model token counts; a smaller transcript can still exceed a selected model's context window. Empty, refused, or incomplete model output must not be treated as a successful summary. Subprocess failures are sanitized before being returned to the browser. A lost client request aborts its subprocess when the server observes the cancellation; an upstream request already submitted may still incur provider charges.

Concurrency and login counters are in memory. They reset on restart and do not coordinate multiple replicas. There is no persistent work queue, retry queue, or distributed quota. For broader public deployment, add shared rate limits, suitable user authentication, and durable jobs before scaling out. Configure provider spend limits independently of app concurrency.

## Deployment and smoke checks

Use [the Docker guide](../README.docker.md). The default published port binds to loopback; terminate HTTPS at a reverse proxy. Keep `COOKIE_SECURE` enabled for HTTPS. The proxy timeout must exceed the processing deadline (the sample uses 610 seconds).

Login throttling ignores forwarded IP headers by default and uses a shared bucket. Enable `TRUST_PROXY=true` only when a trusted proxy overwrites `X-Forwarded-For` and direct client access to the app is blocked; accepting arbitrary forwarded values would let clients evade the limiter. Protect/rotate `APP_PASSWORD`, `AUTH_SECRET`, and the API key. Rotating either `APP_PASSWORD` or `AUTH_SECRET` and restarting all server processes invalidates existing sessions. The session-signing change in this audit also requires existing users to sign in again after upgrade.

Before promoting an image:

1. Build and run the image with production auth settings and inspect `/login` plus container health.
2. Confirm an unauthenticated `POST /api/summarize` returns JSON 401.
3. Log in, refresh, and log out; check Secure/HttpOnly/SameSite cookies over the intended HTTPS hostname.
4. If external calls are intended, fetch a captioned video and generate one summary with the deployment's selected model. Include a non-English video when changing transcript selection.
5. Review logs and provider usage; never use real summaries as health checks.

The health probe checks HTTP liveness only. It does not verify provider credentials, model access, caption availability, or outbound network access. YouTube may block datacenter IPs or change caption metadata; graceful errors and unit tests cannot guarantee availability. Keep transcripts and secrets out of routine logs. There is no application database to back up; retain deployment configuration securely and retain a previous known-good image for rollback.

## Audit evidence

See [the 2026-11-17 deep audit](audit-2026-11-17.md) for ranked findings, live YouTube measurements, production fault tests, and explicit release limitations. Live retrieval initially succeeded for five videos, then encountered a YouTube IP block while the machine was behind the user's VPN. After the user corrected that connection on 2026-11-18, direct English/Portuguese retrieval and authenticated HTTP English/Korean transcript and caption-list checks all passed. The earlier connection-specific block is no longer reproduced; ongoing upstream availability is still outside the application's control. No live-model quality claim is supported without configured provider credentials and reviewed outputs.
