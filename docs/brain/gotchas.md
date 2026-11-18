# Gotchas

## The first listed caption track is not the video's language

YouTube lists caption tracks alphabetically by language name. Auto-dubbed videos also get an auto-generated (ASR) track for every dubbed audio language, and talks like TED carry dozens of manual translations. Taking the first track summarized English videos in Arabic or Afrikaans (fixed 2026-10-24, see `docs/works/2026-10-24-transcript-language/journal.md`).

`youtube-transcript-api` (1.2.x) does not expose which track is original; `is_generated` is true for the dubs too. `YouTubeSummarizer.find_original_language` in `cli/youtube_summarizer.py` reads the raw captions JSON through the library-internal `_fetcher._fetch_captions_json`, so a library upgrade can break it; `cli/test_youtube_summarizer.py` patches that attribute and fails if it disappears.

Signals checked on 29 real videos:
- Default audio track (`audioTracks[defaultAudioTrackIndex].audioTrackId`, e.g. `pt-BR.4`): the original on auto-dubbed videos, but uploader-declared, so match it only against ASR tracks.
- The only ASR track on a non-dubbed video: the spoken language.
- `defaultTranslationSourceTrackIndices`: favours English (manual subtitles, even an English AI dub) and is often absent; fallback only.
- Videos with only manual tracks (music videos with lyric translations) have no speech signal; the code prefers English, then the first listed track. A Spanish song with only Indonesian/Japanese/Portuguese/Spanish lyrics (`NUsoVlDFqZg`) still lands on the alphabetical first.

The default path now reuses the same captions JSON through `TranscriptList.build` for language selection and retrieval. The 2026-11-17 live audit confirmed three HTTP requests (watch page, player JSON, caption XML) instead of five, preserving transcript contents on five samples. Raw metadata still requires the library's private fetcher. Later requests hit a real YouTube IP block; reducing duplicate requests cannot guarantee service availability. See [the deep audit](../audit-2026-11-17.md).
