"""Run the installed YouTube library against recorded-shape HTTP responses.

These tests replace only requests' transport adapter. Metadata extraction, track
selection, requests preparation, XML decoding, and error classification are real.
They intentionally have no route to the network.
"""
import json
from html import escape
from urllib.parse import parse_qs, urlsplit

import pytest
from requests import Response
from requests.adapters import BaseAdapter

from youtube_summarizer import SummarizerError, YouTubeSummarizer

VIDEO = "VIDEO_ID_11"


def track(language, *, generated=False, text=None):
    return {
        "languageCode": language,
        "name": {"runs": [{"text": language}]},
        "baseUrl": f"https://www.youtube.com/api/timedtext?lang={language}&kind={'asr' if generated else 'manual'}",
        "isTranslatable": False,
        **({"kind": "asr"} if generated else {}),
    }


class YouTubeTransport(BaseAdapter):
    def __init__(self, captions, *, status=None, watch_status=200, xml=None):
        self.captions = captions
        self.playability = status or {"status": "OK"}
        self.watch_status = watch_status
        self.xml = xml
        self.requests = []

    def send(self, request, **kwargs):
        self.requests.append((request, kwargs))
        assert kwargs["timeout"] == (10, 30)
        path = urlsplit(request.url).path
        response = Response()
        response.request = request
        response.url = request.url
        response.status_code = 200
        response.encoding = "utf-8"
        if path == "/watch":
            response.status_code = self.watch_status
            content = '<html>{"INNERTUBE_API_KEY":"fixture-only-key"}</html>'
        elif path == "/youtubei/v1/player":
            assert json.loads(request.body)["videoId"] == VIDEO
            content = json.dumps({"playabilityStatus": self.playability,
                                  "captions": {"playerCaptionsTracklistRenderer": self.captions}})
        elif path == "/api/timedtext":
            query = parse_qs(urlsplit(request.url).query)
            text = f"{query['lang'][0]} {query['kind'][0]} Olá 世界 & friends"
            content = self.xml if self.xml is not None else f'<transcript><text start="0" dur="1">{escape(text)}</text></transcript>'
        else:
            raise AssertionError(f"Unexpected HTTP request path {path}")
        response._content = content.encode()
        return response

    def close(self):
        pass


def install(captions, **kwargs):
    summarizer = YouTubeSummarizer()
    adapter = YouTubeTransport(captions, **kwargs)
    summarizer.http_client.mount("https://", adapter)
    summarizer.http_client.mount("http://", adapter)
    return summarizer, adapter


def test_original_language_uses_one_metadata_snapshot_and_decodes_real_xml():
    captions = {
        "captionTracks": [track("en", generated=True), track("pt", generated=True)],
        "audioTracks": [{"audioTrackId": "en-US.10"}, {"audioTrackId": "pt-BR.4"}],
        "defaultAudioTrackIndex": 1,
        "defaultTranslationSourceTrackIndices": [0],
    }
    summarizer, transport = install(captions)
    assert summarizer.get_transcript(VIDEO) == "pt asr Olá 世界 & friends"
    assert len(transport.requests) == 3, "watch page + player JSON + caption XML, with no duplicate metadata fetch"
    assert [request.method for request, _ in transport.requests] == ["GET", "POST", "GET"]


def test_manual_track_preferred_within_selected_original_language():
    summarizer, transport = install({"captionTracks": [track("en"), track("ko", generated=True), track("ko")]})
    assert summarizer.get_transcript(VIDEO).startswith("ko manual")
    assert len(transport.requests) == 3


def test_explicit_language_priority_beats_manual_track_in_lower_priority_language():
    summarizer, _ = install({"captionTracks": [track("en"), track("fr", generated=True)]})
    assert summarizer.get_transcript(VIDEO, ["fr", "en"]).startswith("fr asr")


@pytest.mark.parametrize("status", [
    {"status": "LOGIN_REQUIRED", "reason": "This video may be inappropriate for some users."},
    {"status": "UNPLAYABLE", "reason": "This video is not available in your country"},
    {"status": "ERROR", "reason": "Video unavailable"},
])
@pytest.mark.parametrize("operation", ["get_transcript", "list_available_transcripts"])
def test_playability_access_errors_are_not_reported_as_summary_provider_failure(status, operation):
    summarizer, _ = install({"captionTracks": []}, status=status)
    with pytest.raises(SummarizerError) as error:
        getattr(summarizer, operation)(VIDEO)
    assert error.value.code == "transcript_unavailable"


@pytest.mark.parametrize("operation", ["get_transcript", "list_available_transcripts"])
def test_youtube_rate_block_is_distinct_from_summary_provider_failure(operation):
    summarizer, _ = install({}, watch_status=429)
    with pytest.raises(SummarizerError) as error:
        getattr(summarizer, operation)(VIDEO)
    assert error.value.code == "youtube_blocked"


def test_http_500_is_a_youtube_provider_error():
    summarizer, _ = install({}, watch_status=500)
    with pytest.raises(SummarizerError) as error:
        summarizer.get_transcript(VIDEO)
    assert error.value.code == "youtube_provider_error"


@pytest.mark.parametrize("xml", ["<transcript></transcript>", '<transcript><text start="0">  </text></transcript>'])
def test_valid_but_empty_caption_xml_is_unavailable(xml):
    summarizer, _ = install({"captionTracks": [track("en")]}, xml=xml)
    with pytest.raises(SummarizerError) as error:
        summarizer.get_transcript(VIDEO)
    assert error.value.code == "transcript_unavailable"


def test_malformed_xml_fails_without_leaking_response():
    summarizer, _ = install({"captionTracks": [track("en")]}, xml="private malformed provider response")
    with pytest.raises(SummarizerError) as error:
        summarizer.get_transcript(VIDEO)
    assert error.value.code == "youtube_provider_error"
    assert "private" not in str(error.value)
