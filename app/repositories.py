from __future__ import annotations

from abc import ABC, abstractmethod

from app.models.audit import AuditEntry, AuditVerificationResult
from app.models.campaign import CampaignProposal


class CampaignRepository(ABC):
    @abstractmethod
    def save(self, proposal: CampaignProposal) -> CampaignProposal:
        """Persist a campaign proposal."""

    @abstractmethod
    def get(self, campaign_id: str, *, org_id: str | None = None) -> CampaignProposal | None:
        """Return a campaign proposal by id."""

    @abstractmethod
    def list(self, *, org_id: str | None = None) -> list[CampaignProposal]:
        """Return all campaign proposals."""


class InMemoryCampaignRepository(CampaignRepository):
    def __init__(self) -> None:
        self._items: dict[str, CampaignProposal] = {}

    def save(self, proposal: CampaignProposal) -> CampaignProposal:
        self._items[proposal.id] = proposal
        return proposal

    def get(self, campaign_id: str, *, org_id: str | None = None) -> CampaignProposal | None:
        proposal = self._items.get(campaign_id)
        if proposal is None:
            return None
        if org_id is not None and proposal.org_id != org_id:
            return None
        return proposal

    def list(self, *, org_id: str | None = None) -> list[CampaignProposal]:
        proposals = list(self._items.values())
        if org_id is None:
            return proposals
        return [proposal for proposal in proposals if proposal.org_id == org_id]


class AuditRepository(ABC):
    @abstractmethod
    def append(
        self,
        *,
        event_type: str,
        org_id: str,
        actor: str,
        subject_type: str,
        subject_id: str,
        summary: str,
        payload: dict | None = None,
        diff: dict | None = None,
        guardrail_result: dict | None = None,
    ) -> AuditEntry:
        """Append a server-generated audit entry."""

    @abstractmethod
    def list(self) -> list[AuditEntry]:
        """Return the audit ledger."""

    @abstractmethod
    def list_for_subject(
        self,
        subject_type: str,
        subject_id: str,
        *,
        org_id: str | None = None,
    ) -> list[AuditEntry]:
        """Return audit entries for one subject."""

    @abstractmethod
    def verify(self) -> AuditVerificationResult:
        """Verify append-only hash-chain continuity."""


class InMemoryAuditRepository(AuditRepository):
    def __init__(self) -> None:
        self._entries: list[AuditEntry] = []

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
        prev_hash = self._entries[-1].hash if self._entries else None
        entry = AuditEntry.create(
            event_type=event_type,
            org_id=org_id,
            actor=actor,
            subject_type=subject_type,
            subject_id=subject_id,
            summary=summary,
            payload=payload,
            diff=diff,
            guardrail_result=guardrail_result,
            prev_hash=prev_hash,
        )
        self._entries.append(entry)
        return entry.model_copy(deep=True)

    def list(self) -> list[AuditEntry]:
        return [entry.model_copy(deep=True) for entry in self._entries]

    def list_for_subject(
        self,
        subject_type: str,
        subject_id: str,
        *,
        org_id: str | None = None,
    ) -> list[AuditEntry]:
        return [
            entry.model_copy(deep=True)
            for entry in self._entries
            if entry.subject_type == subject_type and entry.subject_id == subject_id
            and (org_id is None or entry.org_id == org_id)
        ]

    def verify(self) -> AuditVerificationResult:
        previous_hash: str | None = None
        for index, entry in enumerate(self._entries, start=1):
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

        return AuditVerificationResult(valid=True, entries_checked=len(self._entries))
