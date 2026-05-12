from src.monitors.telegram import is_lead

KEYWORDS = ["qa", "тестировщик", "manual qa", "junior", "стажер", "стажировка", "intern", "trainee", "без опыта"]
EXCLUDE  = ["senior", "lead", "middle", "middle 3+", "middle+", "5+ лет", "6+ лет", "3+ года", "4+ года"]


def test_matches_keyword_qa():
    assert is_lead("Ищем QA Engineer в команду", KEYWORDS, EXCLUDE)

def test_matches_keyword_junior():
    assert is_lead("Junior разработчик или тестировщик", KEYWORDS, EXCLUDE)

def test_matches_keyword_intern():
    assert is_lead("Открыта позиция intern QA — пишите @hr_contact", KEYWORDS, EXCLUDE)

def test_matches_keyword_стажировка():
    assert is_lead("Стажировка в IT компании для начинающих", KEYWORDS, EXCLUDE)

def test_matches_keyword_без_опыта():
    assert is_lead("Берём без опыта, обучим всему сами", KEYWORDS, EXCLUDE)

def test_matches_case_insensitive():
    assert is_lead("JUNIOR QA ENGINEER wanted", KEYWORDS, EXCLUDE)

def test_no_match_irrelevant_post():
    assert not is_lead("Продаю iPhone 15 Pro, состояние отличное", KEYWORDS, EXCLUDE)

def test_no_match_empty_text():
    assert not is_lead("", KEYWORDS, EXCLUDE)

def test_excluded_senior():
    assert not is_lead("Senior QA Engineer 5+ лет опыта", KEYWORDS, EXCLUDE)

def test_excluded_lead():
    assert not is_lead("QA Lead в продуктовую команду", KEYWORDS, EXCLUDE)

def test_excluded_middle():
    assert not is_lead("Middle QA — от 3 лет опыта", KEYWORDS, EXCLUDE)

def test_keyword_in_exclusion_post_still_excluded():
    assert not is_lead("Junior или Senior QA, опыт от 5 лет", KEYWORDS, EXCLUDE)

def test_matches_keyword_embedded_in_sentence():
    assert is_lead("Мы ищем человека на роль QA в стартап, опыт не нужен", KEYWORDS, EXCLUDE)

def test_matches_trainee():
    assert is_lead("Trainee position in QA department", KEYWORDS, EXCLUDE)
