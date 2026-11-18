"""Verify the rubric catches known factual errors and instruction following."""

import copy

import pytest

from eval_summary import grade_summary, load_cases, run_live, run_offline, run_responses
from youtube_summarizer import SummarizerError, YouTubeSummarizer

CASES = load_cases()


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["id"])
def test_reference_passes_and_bad_controls_fail(case):
    assert grade_summary(case, case["reference"])["passed"]
    for summary in case["negative_controls"]:
        assert not grade_summary(case, summary)["passed"]


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["id"])
def test_missing_or_oversized_summary_fails(case):
    assert not grade_summary(case, None)["passed"]
    assert not grade_summary(case, "")["passed"]
    assert not grade_summary(case, case["reference"] + " extra" * case["max_words"])["passed"]


def test_offline_calibrates_controls_without_model_calls(monkeypatch):
    monkeypatch.setattr(YouTubeSummarizer, "summarize_text", lambda *a, **kw: pytest.fail("Offline eval called model"))
    report = run_offline(CASES)
    assert report["passed"] and not report["model_evaluated"]
    assert sum(case["negative_controls_rejected"] for case in report["cases"]) == sum(len(case["negative_controls"]) for case in CASES)


def test_offline_detects_broken_control():
    cases = copy.deepcopy(CASES)
    cases[0]["negative_controls"][0] = cases[0]["reference"]
    assert not run_offline(cases)["passed"]


def test_saved_responses_fail_when_case_missing():
    responses = {case["id"]: case["reference"] for case in CASES}
    assert run_responses(CASES, responses)["passed"]
    responses.pop(CASES[0]["id"])
    assert not run_responses(CASES, responses)["passed"]


def test_live_sends_each_full_transcript_and_selected_model(monkeypatch):
    calls = []
    references = {case["transcript"]: case["reference"] for case in CASES}
    def summarize(self, transcript, model, summary_type):
        calls.append((transcript, model, summary_type))
        return references[transcript]
    monkeypatch.setattr(YouTubeSummarizer, "summarize_text", summarize)
    report = run_live(CASES, "chosen-model")
    assert report["passed"]
    assert calls == [(case["transcript"], "chosen-model", case["summary_type"]) for case in CASES]


def test_live_provider_failure_is_a_failed_eval(monkeypatch):
    def fail(*args, **kwargs):
        raise SummarizerError("provider_error", "Safe failure")
    monkeypatch.setattr(YouTubeSummarizer, "summarize_text", fail)
    report = run_live(CASES, "chosen-model")
    assert not report["passed"]
    assert all(case["failures"] == ["Safe failure"] for case in report["cases"])


def test_rejected_plan_mention_is_not_a_false_positive():
    case = next(case for case in CASES if case["id"] == "decision-and-negation")
    assert grade_summary(case, case["reference"] + " We have not approved Plan A.")["passed"]
    assert grade_summary(case, case["reference"] + " We never selected Plan A.")["passed"]


def test_numeric_substring_and_negated_decision_are_not_correct_facts():
    case = CASES[0]
    assert not grade_summary(case, case["reference"].replace("12 percent", "112 percent"))["passed"]
    assert grade_summary(case, case["reference"].replace("12 percent", "12%"))["passed"]
    case = CASES[1]
    assert not grade_summary(case, case["reference"].replace("chose Plan B", "never chose Plan B"))["passed"]


def test_suite_covers_all_styles_and_a_long_source_with_late_resolution():
    assert {case["summary_type"] for case in CASES} == {"concise", "detailed", "bullet-points", "key-insights"}
    case = next(case for case in CASES if case["id"] == "long-source-late-reversal")
    assert len(case["transcript"]) > 20_000
    assert case["transcript"].endswith("The accessibility inspection is complete.")
    assert "FINAL RESOLUTION" not in case["transcript"][:20_000]


def test_automatic_pass_never_claims_semantic_quality():
    responses = {case["id"]: case["reference"] for case in CASES}
    # Unanticipated hallucinations cannot be reliably detected by keyword rules.
    responses[CASES[0]["id"]] += " The pilot eliminated all maintenance costs forever."
    report = run_responses(CASES, responses)
    assert report["passed"]
    assert report["human_review_required"]
    assert report["quality_verdict"] == "requires_human_review"
    assert all(item["review_checks"] for item in report["cases"])
    assert len(report["suite_sha256"]) == len(report["prompt_sha256"]) == 64


def test_report_fingerprint_changes_when_source_changes():
    original = run_offline(CASES)
    changed = copy.deepcopy(CASES)
    changed[0]["transcript"] += " Changed source."
    assert run_offline(changed)["suite_sha256"] != original["suite_sha256"]


@pytest.mark.parametrize("update", [
    {"required_facts": {}}, {"required_facts": {"fact": []}},
    {"required_facts": {"fact": ["("]}}, {"negative_controls": []},
    {"max_words": True}, {"max_words": 0}, {"summary_type": "unknown"}, {"summary_type": []},
    {"review_checks": []}, {"transcript": ""},
])
def test_invalid_fixtures_fail_before_model_calls(tmp_path, update):
    import json
    case = copy.deepcopy(CASES[0])
    case.update(update)
    path = tmp_path / "cases.json"
    path.write_text(json.dumps([case]))
    with pytest.raises(ValueError):
        load_cases(path)


def test_duplicate_case_ids_and_oversized_blocks_fail(tmp_path):
    import json
    path = tmp_path / "cases.json"
    path.write_text(json.dumps([CASES[0], CASES[0]]))
    with pytest.raises(ValueError, match="unique"):
        load_cases(path)
    case = copy.deepcopy(CASES[0])
    del case["transcript"]
    case["transcript_blocks"] = [{"text": "x" * 100, "repeat": 10_000}]
    path.write_text(json.dumps([case]))
    with pytest.raises(ValueError, match="limit"):
        load_cases(path)


def test_unknown_response_ids_fail_instead_of_silently_misaligning():
    with pytest.raises(ValueError, match="unknown"):
        run_responses(CASES, {"misspelled-case-id": "Summary"})


def test_configuration_failure_stops_remaining_live_calls(monkeypatch):
    calls = []
    def fail(*args, **kwargs):
        calls.append(1)
        raise SummarizerError("configuration_error", "Missing API key")
    monkeypatch.setattr(YouTubeSummarizer, "summarize_text", fail)
    report = run_live(CASES, "chosen-model")
    assert not report["passed"]
    assert len(calls) == 1
    assert len(report["cases"]) == len(CASES)
    assert all(item["error_code"] == "configuration_error" for item in report["cases"])
