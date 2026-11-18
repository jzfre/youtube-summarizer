#!/usr/bin/env python3
"""Reproducible summary regression checks; automatic passes require human review.

--offline calibrates authored good/bad controls, not a model. --live opts into
billable calls. --responses grades saved {case_id: summary} output. Regex checks
cannot establish semantic correctness, and every model report says so explicitly.
"""

import argparse
import hashlib
import json
import re
import time
from pathlib import Path

from youtube_summarizer import (
    DEFAULT_MODEL, MAX_TRANSCRIPT_CHARS, SUMMARY_PROMPTS, SUMMARY_SYSTEM_PROMPT,
    SummarizerError, YouTubeSummarizer,
)

CASES_PATH = Path(__file__).parent / "evals" / "cases.json"


def load_cases(path=CASES_PATH):
    """Validate before executing any billable work; expand long-source fixtures."""
    cases = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(cases, list) or not cases:
        raise ValueError("Evaluation cases must be a nonempty list")
    ids = set()
    for case in cases:
        if not isinstance(case, dict):
            raise ValueError("Each case must be an object")
        case_id = case.get("id")
        if not isinstance(case_id, str) or not re.fullmatch(r"[a-z0-9-]+", case_id) or case_id in ids:
            raise ValueError("Case IDs must be unique lowercase slugs")
        ids.add(case_id)
        blocks = case.get("transcript_blocks")
        if blocks is not None:
            if "transcript" in case or not isinstance(blocks, list) or not blocks:
                raise ValueError(f"{case_id}: use either transcript or nonempty transcript_blocks")
            expanded = []
            size = 0
            for block in blocks:
                if not isinstance(block, dict) or not isinstance(block.get("text"), str):
                    raise ValueError(f"{case_id}: invalid transcript block")
                repeat = block.get("repeat", 1)
                if type(repeat) is not int or not 1 <= repeat <= 10_000:
                    raise ValueError(f"{case_id}: invalid block repetition")
                size += (len(block["text"]) + 1) * repeat
                if size > MAX_TRANSCRIPT_CHARS:
                    raise ValueError(f"{case_id}: transcript exceeds application limit")
                expanded.extend([block["text"]] * repeat)
            case["transcript"] = "\n".join(expanded)
        source = case.get("transcript")
        if not isinstance(source, str) or not source.strip() or len(source) > MAX_TRANSCRIPT_CHARS:
            raise ValueError(f"{case_id}: invalid transcript")
        case.setdefault("summary_type", "concise")
        if not isinstance(case["summary_type"], str) or case["summary_type"] not in SUMMARY_PROMPTS:
            raise ValueError(f"{case_id}: invalid summary style")
        if type(case.get("max_words")) is not int or case["max_words"] <= 0:
            raise ValueError(f"{case_id}: max_words must be a positive integer")
        if not isinstance(case.get("reference"), str) or not case["reference"].strip():
            raise ValueError(f"{case_id}: missing reference")
        facts = case.get("required_facts")
        if not isinstance(facts, dict) or not facts:
            raise ValueError(f"{case_id}: required_facts must be a nonempty object")
        patterns = []
        for label, aliases in facts.items():
            if not isinstance(label, str) or not label or not isinstance(aliases, list) or not aliases:
                raise ValueError(f"{case_id}: facts must have a label and pattern list")
            patterns.extend(aliases)
        for field in ("forbidden_patterns", "negative_controls", "review_checks"):
            values = case.get(field)
            if not isinstance(values, list) or any(not isinstance(v, str) or not v.strip() for v in values):
                raise ValueError(f"{case_id}: invalid {field}")
            if field != "forbidden_patterns" and not values:
                raise ValueError(f"{case_id}: empty {field}")
        patterns.extend(case["forbidden_patterns"])
        for pattern in patterns:
            if not isinstance(pattern, str) or not pattern:
                raise ValueError(f"{case_id}: invalid regex pattern")
            try:
                re.compile(pattern)
            except re.error as exc:
                raise ValueError(f"{case_id}: invalid regex pattern") from exc
    return cases


def grade_summary(case, summary):
    if not isinstance(summary, str) or not summary.strip():
        return {"passed": False, "fact_coverage": 0.0, "failures": ["empty summary"]}
    flags = re.IGNORECASE | re.DOTALL
    facts = {label: any(re.search(pattern, summary, flags) for pattern in aliases)
             for label, aliases in case["required_facts"].items()}
    failures = [f"missing fact: {label}" for label, present in facts.items() if not present]
    failures += [f"forbidden claim or instruction: {pattern}" for pattern in case["forbidden_patterns"]
                 if re.search(pattern, summary, flags)]
    if len(summary.split()) > case["max_words"]:
        failures.append(f"exceeds {case['max_words']}-word limit")
    if case.get("summary_type") == "bullet-points":
        bullets = re.findall(r"^\s*(?:[-*•]|\d+[.)])\s+\S", summary, re.MULTILINE)
        if len(bullets) < 2:
            failures.append("bullet-points style requires at least two bullet items")
    return {"passed": not failures, "fact_coverage": sum(facts.values()) / len(facts), "failures": failures}


def report_metadata(cases):
    fingerprint = lambda value: hashlib.sha256(value.encode("utf-8")).hexdigest()
    return {
        "suite_sha256": fingerprint(json.dumps(cases, sort_keys=True, ensure_ascii=False)),
        "prompt_sha256": fingerprint(SUMMARY_SYSTEM_PROMPT + json.dumps(SUMMARY_PROMPTS, sort_keys=True)),
        "case_count": len(cases),
    }


def run_offline(cases):
    results = []
    for case in cases:
        reference = grade_summary(case, case["reference"])
        controls = [grade_summary(case, summary) for summary in case["negative_controls"]]
        results.append({"id": case["id"], "passed": reference["passed"] and all(not item["passed"] for item in controls),
                        "reference": reference, "negative_controls_rejected": sum(not item["passed"] for item in controls),
                        "negative_controls_total": len(controls)})
    return {"mode": "offline-rubric-calibration", "model_evaluated": False,
            "quality_verdict": "not_evaluated", **report_metadata(cases),
            "passed": all(item["passed"] for item in results), "cases": results}


def model_report(mode, cases, results, **extra):
    """Keep automated findings separate from the unperformed semantic review."""
    passed = all(item["passed"] for item in results)
    return {"mode": mode, "quality_verdict": "requires_human_review" if passed else "automatic_checks_failed",
            "human_review_required": True, **report_metadata(cases), **extra,
            "passed": passed, "cases": results}


def reviewed_result(case, summary):
    return {"id": case["id"], "summary_type": case["summary_type"],
            "transcript_chars": len(case["transcript"]), "summary": summary,
            "review_checks": case["review_checks"], **grade_summary(case, summary)}


def run_responses(cases, responses):
    if not isinstance(responses, dict):
        raise ValueError("Responses must be a JSON object mapping case IDs to summaries")
    unknown = set(responses) - {case["id"] for case in cases}
    if unknown:
        raise ValueError("Responses contain unknown case IDs")
    results = [reviewed_result(case, responses.get(case["id"])) for case in cases]
    return model_report("saved-responses", cases, results)


def run_live(cases, model):
    summarizer = YouTubeSummarizer()
    results = []
    for case in cases:
        started = time.monotonic()
        try:
            summary = summarizer.summarize_text(case["transcript"], model=model, summary_type=case["summary_type"])
            result = reviewed_result(case, summary)
        except SummarizerError as exc:
            result = {"id": case["id"], "passed": False, "fact_coverage": 0.0,
                      "error_code": exc.code, "failures": [str(exc)]}
        result["duration_seconds"] = round(time.monotonic() - started, 3)
        results.append(result)
        if result.get("error_code") == "configuration_error":
            # A missing key affects the entire run; do not manufacture provider calls.
            for skipped in cases[len(results):]:
                results.append({"id": skipped["id"], "passed": False, "fact_coverage": 0.0,
                                "error_code": "configuration_error", "failures": ["Skipped after configuration failure"]})
            break
    return model_report("live-model", cases, results, model=model)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--offline", action="store_true", help="Calibrate good/bad controls; no API calls")
    mode.add_argument("--live", action="store_true", help="Make billable OpenAI calls, one per selected fixture")
    mode.add_argument("--responses", type=Path, help="Grade saved JSON mapping case IDs to summary strings")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--case", action="append", dest="case_ids", help="Select a case ID (repeatable); default: all")
    parser.add_argument("--output", type=Path, help="Also write the JSON report to this file")
    args = parser.parse_args()
    try:
        cases = load_cases()
        if args.case_ids:
            if set(args.case_ids) - {case["id"] for case in cases}:
                parser.error("Unknown --case ID")
            cases = [case for case in cases if case["id"] in args.case_ids]
        if args.offline:
            report = run_offline(cases)
        elif args.live:
            report = run_live(cases, args.model)
        else:
            report = run_responses(cases, json.loads(args.responses.read_text(encoding="utf-8")))
        output = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
        if args.output:
            args.output.write_text(output, encoding="utf-8")
    except (OSError, ValueError) as exc:
        parser.error(f"Cannot run evaluation: {exc}")
    print(output, end="")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
