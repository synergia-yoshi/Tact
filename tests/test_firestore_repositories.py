from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime

from app.adapters.media import MediaPlanResponse
from app.firestore_repositories import FirestoreAuditRepository, FirestoreCampaignRepository
from app.models.campaign import CampaignBrief, CampaignProposal, CreativeDraft


class FakeDocumentSnapshot:
    def __init__(self, data: dict | None) -> None:
        self._data = deepcopy(data)
        self.exists = data is not None

    def to_dict(self) -> dict:
        return deepcopy(self._data)


class FakeDocumentReference:
    def __init__(self, store: dict[str, dict], document_id: str) -> None:
        self._store = store
        self._document_id = document_id

    def set(self, data: dict) -> None:
        self._store[self._document_id] = deepcopy(data)

    def get(self) -> FakeDocumentSnapshot:
        return FakeDocumentSnapshot(self._store.get(self._document_id))


class FakeCollectionReference:
    def __init__(self) -> None:
        self._store: dict[str, dict] = {}

    def document(self, document_id: str) -> FakeDocumentReference:
        return FakeDocumentReference(self._store, document_id)

    def stream(self) -> list[FakeDocumentSnapshot]:
        return [FakeDocumentSnapshot(data) for data in self._store.values()]


class FakeFirestoreClient:
    def __init__(self) -> None:
        self.collections: dict[str, FakeCollectionReference] = {}

    def collection(self, name: str) -> FakeCollectionReference:
        if name not in self.collections:
            self.collections[name] = FakeCollectionReference()
        return self.collections[name]


def _proposal() -> CampaignProposal:
    return CampaignProposal(
        brief=CampaignBrief(
            name="Durable Launch",
            objective="lead_generation",
            target_audience="operators",
            total_budget_jpy=100000,
            channels=["search"],
        ),
        creative=CreativeDraft(
            headline="Launch",
            body="Validate demand.",
            call_to_action="Start",
        ),
        media_plan=MediaPlanResponse(
            request_id="media_plan_1",
            account_id="mock-account",
            placements=[],
            estimated_reach=1000,
            estimated_cpa_jpy=1000,
            generated_at=datetime.now(tz=UTC),
        ),
    )


def test_firestore_campaign_repository_round_trips_campaigns() -> None:
    client = FakeFirestoreClient()
    repository = FirestoreCampaignRepository(client=client, collection_prefix="tact_test")
    proposal = _proposal()

    repository.save(proposal)

    assert repository.get(proposal.id) == proposal
    assert repository.list() == [proposal]


def test_firestore_audit_repository_appends_and_verifies_chain() -> None:
    client = FakeFirestoreClient()
    repository = FirestoreAuditRepository(client=client, collection_prefix="tact_test")

    first = repository.append(
        event_type="campaign.proposal.created",
        actor="system",
        subject_type="campaign",
        subject_id="cmp_1",
        summary="Created.",
    )
    second = repository.append(
        event_type="campaign.publish.requested",
        actor="system",
        subject_type="campaign",
        subject_id="cmp_1",
        summary="Approval requested.",
    )

    assert second.prev_hash == first.hash
    assert repository.verify().valid is True
    assert [entry.id for entry in repository.list_for_subject("campaign", "cmp_1")] == [
        first.id,
        second.id,
    ]
