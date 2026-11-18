"""Exercise the installed OpenAI SDK over real loopback HTTP, without paid calls.

These establish wire/error contracts, not the quality of model-generated text.
"""

from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import time
from threading import Thread

import pytest
from openai import OpenAI

from eval_summary import load_cases
from youtube_summarizer import SUMMARY_PROMPTS, SummarizerError, YouTubeSummarizer


def completion(content="A completed summary.", finish_reason="stop", refusal=None):
    return {"id": "chatcmpl-local-fixture", "object": "chat.completion", "created": 1,
            "model": "contract-test", "choices": [{"index": 0, "finish_reason": finish_reason,
            "message": {"role": "assistant", "content": content, "refusal": refusal}}]}


@contextmanager
def provider(responses, delay=0):
    captured = []
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            captured.append({"path": self.path, "body": json.loads(self.rfile.read(int(self.headers["Content-Length"])))})
            status, payload = responses[min(len(captured) - 1, len(responses) - 1)]
            if delay:
                time.sleep(delay)
            encoded = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("Retry-After", "0.01")
            self.end_headers()
            try:
                self.wfile.write(encoded)
            except BrokenPipeError:
                pass  # Expected when the timeout test closes its socket.
        def log_message(self, *args):
            pass
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    worker = Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/v1", captured
    finally:
        server.shutdown()
        worker.join(timeout=2)
        server.server_close()


def test_real_sdk_preserves_unicode_full_source_style_and_optional_cap(monkeypatch):
    source = load_cases()[-1]["transcript"] + "\n日本語: 最終決定。"
    with provider([(200, completion("日本語の要約。"))]) as (url, captured):
        monkeypatch.setenv("OPENAI_BASE_URL", url)
        summarizer = YouTubeSummarizer(api_key="local-test-key")
        try:
            assert summarizer.summarize_text(source, model="contract-test", summary_type="detailed", max_tokens=1234) == "日本語の要約。"
        finally:
            summarizer.client.close()
    assert len(captured) == 1
    request = captured[0]
    assert request["path"] == "/v1/chat/completions"
    assert request["body"]["model"] == "contract-test"
    assert request["body"]["messages"][1] == {"role": "user", "content": source}
    assert SUMMARY_PROMPTS["detailed"] in request["body"]["messages"][0]["content"]
    assert request["body"]["max_completion_tokens"] == 1234
    assert "temperature" not in request["body"]
    assert "max_tokens" not in request["body"]


def test_real_sdk_retries_one_transient_response_then_returns_success(monkeypatch):
    with provider([(503, {"error": {"message": "temporary", "type": "server_error"}}), (200, completion())]) as (url, captured):
        monkeypatch.setenv("OPENAI_BASE_URL", url)
        summarizer = YouTubeSummarizer(api_key="local-test-key")
        try:
            assert summarizer.summarize_text("Source", model="contract-test") == "A completed summary."
        finally:
            summarizer.client.close()
    assert len(captured) == 2


@pytest.mark.parametrize("status,expected_calls,expected_code", [(401, 1, "configuration_error"), (403, 1, "configuration_error"), (404, 1, "configuration_error"), (400, 1, "provider_error"), (429, 2, "provider_rate_limited"), (503, 2, "provider_error")])
def test_real_sdk_errors_are_bounded_and_never_expose_provider_payload(monkeypatch, status, expected_calls, expected_code):
    with provider([(status, {"error": {"message": "private-provider-detail-and-secret-key", "type": "api_error"}})]) as (url, captured):
        monkeypatch.setenv("OPENAI_BASE_URL", url)
        summarizer = YouTubeSummarizer(api_key="local-test-key")
        try:
            with pytest.raises(SummarizerError) as error:
                summarizer.summarize_text("Source", model="contract-test")
            assert error.value.code == expected_code
            assert "private-provider-detail" not in str(error.value)
        finally:
            summarizer.client.close()
    assert len(captured) == expected_calls


@pytest.mark.parametrize("payload", [
    completion("Some content alongside refusal.", refusal="Cannot comply"),
    completion("Incomplete fragment", finish_reason="length"),
    completion("", finish_reason="stop"),
    {"id": "empty", "object": "chat.completion", "created": 1, "model": "contract-test", "choices": []},
])
def test_real_sdk_incomplete_refused_or_empty_responses_are_failures(monkeypatch, payload):
    with provider([(200, payload)]) as (url, captured):
        monkeypatch.setenv("OPENAI_BASE_URL", url)
        summarizer = YouTubeSummarizer(api_key="local-test-key")
        try:
            with pytest.raises(SummarizerError) as error:
                summarizer.summarize_text("Source", model="contract-test")
            assert error.value.code == "provider_error"
        finally:
            summarizer.client.close()
    assert len(captured) == 1


def test_real_sdk_context_overflow_is_distinguished_from_provider_failure(monkeypatch):
    payload = {"error": {"message": "Too many tokens", "type": "invalid_request_error", "code": "context_length_exceeded"}}
    with provider([(400, payload)]) as (url, captured):
        monkeypatch.setenv("OPENAI_BASE_URL", url)
        summarizer = YouTubeSummarizer(api_key="local-test-key")
        try:
            with pytest.raises(SummarizerError) as error:
                summarizer.summarize_text("Source", model="contract-test")
            assert error.value.code == "transcript_too_long"
        finally:
            summarizer.client.close()
    assert len(captured) == 1


def test_real_sdk_read_timeout_retries_once_then_returns_typed_failure():
    with provider([(200, completion())], delay=0.2) as (url, captured):
        summarizer = YouTubeSummarizer(api_key="local-test-key")
        # Reduce only the transport clock to keep the test fast; use a real SDK,
        # sockets and the application's one-retry policy.
        summarizer.client = OpenAI(api_key="local-test-key", base_url=url, timeout=0.05, max_retries=1)
        try:
            with pytest.raises(SummarizerError) as error:
                summarizer.summarize_text("Source", model="contract-test")
            assert error.value.code == "provider_timeout"
        finally:
            summarizer.client.close()
    assert len(captured) == 2
