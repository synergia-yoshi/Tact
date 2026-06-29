from app.repositories import InMemoryAuditRepository


def test_audit_repository_verifies_hash_chain_and_detects_tampering() -> None:
    repository = InMemoryAuditRepository()
    first = repository.append(
        event_type="campaign.proposal.created",
        actor="system",
        subject_type="campaign",
        subject_id="cmp_1",
        summary="Proposal created.",
        payload={"status": "proposed"},
    )
    second = repository.append(
        event_type="campaign.publish.requested",
        actor="system",
        subject_type="campaign",
        subject_id="cmp_1",
        summary="Publish approval requested.",
        payload={"action_id": "act_1"},
    )

    assert first.prev_hash is None
    assert second.prev_hash == first.hash
    assert repository.verify().valid is True

    repository._entries[0].payload["status"] = "approved"

    verification = repository.verify()
    assert verification.valid is False
    assert verification.broken_entry_id == first.id
