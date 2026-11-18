# Transcript language — 2026-10-24

## Asked
Summaries came out in Arabic for English videos (e.g. Naveen Rao interview `yAsrMA_ADPc`).

## Approach
Root cause: since `379107d`, `/api/summarize` passed the first listed caption track to the CLI. YouTube lists tracks alphabetically, auto-dubbing adds an ASR track per dubbed language, and TED-style talks carry dozens of manual translations, so English videos got Arabic or Afrikaans. The pre-`379107d` AI detection sampled that same first track, so reverting would not have helped.

Fix: the CLI picks the original-language track itself (`find_original_language`), and the web routes stop choosing one. Rules and evidence: `docs/brain/gotchas.md`.

## Decisions
- Selection lives in the CLI because only it can read YouTube's raw captions JSON; it drops one Python spawn per summary. YouTube requests per web summary stay at 5 (the CLI fetches the captions JSON twice); not deduplicated, to avoid more library internals.
- Manual-track-only videos (no speech signal) prefer English, the CLI's old default, before the alphabetical first track.
- Summaries stay in the video's spoken language, as the README promised; forcing English output is a separate prompt change, not done.
- Rejected `defaultTranslationSourceTrackIndices` as the primary signal: it chose an English AI dub for a Portuguese video and English subtitles for Korean/Hindi ones.
- CLI `-l` default changed from `en` to the original language for `summarize` and `transcript`.

## Validated
- Probed 29 real videos (dubbed, TED/Kurzgesagt, Korean/Hindi with English subs, Slovak/Czech/Polish ASR-only, mislabelled audio, manual-only music).
- `cli/test_youtube_summarizer.py`: 8 cases failed before, pass after.
- End-to-end through `next dev` and a stub OpenAI endpoint: before, Arabic (`yAsrMA_ADPc`) and Afrikaans (`iG9CE55wbtY`); after, English, English, Portuguese, Korean, Slovak and English for six shapes, plus the `/api/transcript` fallback.
- eslint and `tsc --noEmit` clean.
- Three-lens review with a skeptic per finding: 4 of 6 confirmed. Fixed the manual-tracks-only fallback (Con Calma `DiItGE3eAyQ` picked `zh-Hant`; now `en`), README overclaims and this journal's request-count claim. Accepted: English subtitles for manual-only Mandarin videos. 9 more live videos (human MrBeast dubs, Hebrew, Cantonese, Japanese/Spanish/French auto-dubs) picked correctly.
