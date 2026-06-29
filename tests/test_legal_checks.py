from app.legal_checks import run_rule_based_legal_check


def test_legal_check_passes_safe_copy() -> None:
    result = run_rule_based_legal_check(
        texts=[
            "はじめての広告案",
            "反応を見ながら、成果の出た配信先へ予算を広げます。",
        ]
    )

    assert result.status == "passed"
    assert result.findings == []


def test_legal_check_blocks_medical_cure_claims() -> None:
    result = run_rule_based_legal_check(
        texts=[
            "肌荒れが治る新習慣",
            "薬いらずで完治を目指す",
        ]
    )

    assert result.status == "blocked"
    assert {finding.rule_id for finding in result.findings} == {
        "yakkihou_medical_cure_claim"
    }


def test_legal_check_flags_absolute_claims_for_review() -> None:
    result = run_rule_based_legal_check(
        texts=[
            "必ず成果につながる",
            "No.1の支援品質",
        ]
    )

    assert result.status == "needs_review"
    assert {finding.severity for finding in result.findings} == {"review"}
