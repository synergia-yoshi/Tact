from __future__ import annotations

from app.models.audit import AuditEntry, AuditVerificationResult
from app.models.campaign import CampaignProposal
from app.repositories import AuditRepository, CampaignRepository
from app.security import mask_sensitive_data


class FirestoreCampaignRepository(CampaignRepository):
    def __init__(self, *, client: object, collection_prefix: str) -> None:
        self._collection = client.collection(f"{collection_prefix}_campaigns")

    def save(self, proposal: CampaignProposal) -> CampaignProposal:
        self._collection.document(proposal.id).set(proposal.model_dump(mode="json"))
        return proposal

    def get(self, campaign_id: str, *, org_id: str | None = None) -> CampaignProposal | None:
        snapshot = self._collection.document(campaign_id).get()
        if not snapshot.exists:
            return None
        proposal = CampaignProposal.model_validate(snapshot.to_dict())
        if org_id is not None and proposal.org_id != org_id:
            return None
        return proposal

    def list(self, *, org_id: str | None = None) -> list[CampaignProposal]:
        proposals = [
            CampaignProposal.model_validate(snapshot.to_dict())
            for snapshot in self._collection.stream()
        ]
        if org_id is None:
            return proposals
        return [proposal for proposal in proposals if proposal.org_id == org_id]


class FirestoreAuditRepository(AuditRepository):
    def __init__(self, *, client: object, collection_prefix: str) -> None:
        self._client = client
        self._collection = client.collection(f"{collection_prefix}_audit_entries")

    def append(
        self,
        *,
        event_type: str,
        org_id: str = "dev-org",
        actor: str,
        subject_type: str,
        subject_id: str,
        summary: str,
        payload: dict | None = None,
        diff: dict | None = None,
        guardrail_result: dict | None = None,
    ) -> AuditEntry:
        previous = self._last_entry()
        entry = AuditEntry.create(
            event_type=event_type,
            org_id=org_id,
            actor=actor,
            subject_type=subject_type,
            subject_id=subject_id,
            summary=summary,
            payload=mask_sensitive_data(payload or {}),
            diff=mask_sensitive_data(diff or {}),
            guardrail_result=mask_sensitive_data(guardrail_result or {}),
            prev_hash=previous.hash if previous else None,
        )
        self._create_entry(entry)
        return entry

    def list(self) -> list[AuditEntry]:
        return self._ordered_entries()

    def list_for_subject(
        self,
        subject_type: str,
        subject_id: str,
        *,
        org_id: str | None = None,
    ) -> list[AuditEntry]:
        return [
            entry
            for entry in self._ordered_entries()
            if entry.subject_type == subject_type and entry.subject_id == subject_id
            and (org_id is None or entry.org_id == org_id)
        ]

    def verify(self) -> AuditVerificationResult:
        previous_hash: str | None = None
        entries = self._ordered_entries()
        for index, entry in enumerate(entries, start=1):
            if entry.prev_hash != previous_hash:
                return AuditVerificationResult(
                    valid=False,
                    entries_checked=index,
                    broken_entry_id=entry.id,
                    reason="prev_hash does not match the previous entry hash",
                )
            if not entry.has_valid_hash():
                return AuditVerificationResult(
                    valid=False,
                    entries_checked=index,
                    broken_entry_id=entry.id,
                    reason="entry hash does not match its canonical payload",
                )
            previous_hash = entry.hash
        return AuditVerificationResult(valid=True, entries_checked=len(entries))

    def _last_entry(self) -> AuditEntry | None:
        entries = self._ordered_entries()
        return entries[-1] if entries else None

    def _create_entry(self, entry: AuditEntry) -> None:
        document = self._collection.document(entry.id)
        if hasattr(document, "create"):
            document.create(entry.model_dump(mode="json"))
            return
        snapshot = document.get()
        if getattr(snapshot, "exists", False):
            raise RuntimeError("Audit entry already exists; refusing to overwrite")
        document.set(entry.model_dump(mode="json"))

    def _ordered_entries(self) -> list[AuditEntry]:
        entries = [
            AuditEntry.model_validate(snapshot.to_dict()) for snapshot in self._collection.stream()
        ]
        return self._chain_order(entries)

    def _chain_order(self, entries: list[AuditEntry]) -> list[AuditEntry]:
        if not entries:
            return []

        entries_by_prev_hash: dict[str | None, list[AuditEntry]] = {}
        for entry in entries:
            entries_by_prev_hash.setdefault(entry.prev_hash, []).append(entry)

        roots = entries_by_prev_hash.get(None, [])
        if len(roots) != 1:
            return sorted(entries, key=lambda entry: (entry.created_at, entry.id))

        ordered = [roots[0]]
        seen_hashes = {roots[0].hash}
        current = roots[0]
        while True:
            next_entries = entries_by_prev_hash.get(current.hash, [])
            if len(next_entries) != 1:
                remaining = [entry for entry in entries if entry.hash not in seen_hashes]
                return ordered + sorted(remaining, key=lambda entry: (entry.created_at, entry.id))

            current = next_entries[0]
            if current.hash in seen_hashes:
                remaining = [entry for entry in entries if entry.hash not in seen_hashes]
                return ordered + sorted(remaining, key=lambda entry: (entry.created_at, entry.id))

            ordered.append(current)
            seen_hashes.add(current.hash)


def create_firestore_client(*, project_id: str | None, database: str | None) -> object:
    try:
        from google.cloud import firestore
    except ImportError as error:
        raise RuntimeError(
            "Install the gcp extra to use Firestore: pip install -e '.[gcp]'"
        ) from error

    kwargs = {}
    if project_id:
        kwargs["project"] = project_id
    if database:
        kwargs["database"] = database
    return firestore.Client(**kwargs)
