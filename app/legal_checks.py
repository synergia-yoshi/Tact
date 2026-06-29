from __future__ import annotations

from app.models.legal import LegalCheckResult, LegalFinding

LEGAL_RULES = [
    {
        "rule_id": "yakkihou_medical_cure_claim",
        "severity": "block",
        "terms": ["治る", "完治", "治療", "薬いらず"],
        "message": "医療的な効果や治療を想起させる表現のため、公開前に確認が必要です。",
    },
    {
        "rule_id": "premium_representation_absolute_claim",
        "severity": "review",
        "terms": ["絶対", "必ず", "100%", "永久", "完全保証"],
        "message": "断定的な効果表現のため、公開前に根拠の確認が必要です。",
    },
    {
        "rule_id": "premium_representation_no1_claim",
        "severity": "review",
        "terms": ["No.1", "ナンバーワン", "業界一", "日本一"],
        "message": "最上級表現のため、公開前に根拠資料の確認が必要です。",
    },
]


def run_rule_based_legal_check(*, texts: list[str]) -> LegalCheckResult:
    joined_text = "\n".join(text for text in texts if text)
    findings: list[LegalFinding] = []
    for rule in LEGAL_RULES:
        for term in rule["terms"]:
            if term in joined_text:
                findings.append(
                    LegalFinding(
                        rule_id=rule["rule_id"],
                        severity=rule["severity"],
                        matched_text=term,
                        message=rule["message"],
                    )
                )

    if any(finding.severity == "block" for finding in findings):
        status = "blocked"
    elif findings:
        status = "needs_review"
    else:
        status = "passed"

    return LegalCheckResult(status=status, findings=findings)
