from __future__ import annotations

from abc import ABC, abstractmethod

from app.models.campaign import CampaignProposal


class CampaignRepository(ABC):
    @abstractmethod
    def save(self, proposal: CampaignProposal) -> CampaignProposal:
        """Persist a campaign proposal."""

    @abstractmethod
    def get(self, campaign_id: str) -> CampaignProposal | None:
        """Return a campaign proposal by id."""

    @abstractmethod
    def list(self) -> list[CampaignProposal]:
        """Return all campaign proposals."""


class InMemoryCampaignRepository(CampaignRepository):
    def __init__(self) -> None:
        self._items: dict[str, CampaignProposal] = {}

    def save(self, proposal: CampaignProposal) -> CampaignProposal:
        self._items[proposal.id] = proposal
        return proposal

    def get(self, campaign_id: str) -> CampaignProposal | None:
        return self._items.get(campaign_id)

    def list(self) -> list[CampaignProposal]:
        return list(self._items.values())
