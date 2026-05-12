from src.core.utils import is_match


# ── is_match ──────────────────────────────────────────────────────────

def test_match_accepts_when_keyword_present():
    assert is_match("Junior QA Engineer", "", ["qa", "junior"], [])

def test_match_rejects_when_no_keyword():
    assert not is_match("Senior Developer", "", ["qa"], [])

def test_match_rejects_when_excluded():
    assert not is_match("Junior QA Engineer", "", ["qa"], ["senior", "junior"])

def test_match_is_case_insensitive():
    assert is_match("QA ENGINEER", "", ["qa"], [])  # keyword match is case-insensitive
    assert not is_match("SENIOR QA", "", ["qa"], ["Senior"])  # exclude is also case-insensitive

def test_match_accepts_with_empty_keywords():
    assert is_match("Any title", "", [], [])

def test_match_checks_description_too():
    assert is_match("Developer", "requires qa knowledge", ["qa"], [])
