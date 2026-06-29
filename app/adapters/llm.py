from __future__ import annotations

import hashlib
import json
from abc import ABC, abstractmethod
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


class LLMMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class LLMChatRequest(BaseModel):
    """OpenAI-compatible chat-completions style request."""

    model: str
    messages: list[LLMMessage]
    temperature: float = Field(default=0.2, ge=0, le=2)
    response_format: dict[str, str] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class LLMUsage(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class LLMChoice(BaseModel):
    index: int
    message: LLMMessage
    finish_reason: Literal["stop", "length", "content_filter"] = "stop"


class LLMChatResponse(BaseModel):
    """OpenAI-compatible chat-completions style response."""

    id: str
    object: Literal["chat.completion"] = "chat.completion"
    created: int
    model: str
    choices: list[LLMChoice]
    usage: LLMUsage


class LLMAdapter(ABC):
    @abstractmethod
    async def create_chat_completion(self, request: LLMChatRequest) -> LLMChatResponse:
        """Create a chat completion with the same boundary shape as a real LLM API."""


class MockLLMAdapter(LLMAdapter):
    """Deterministic LLM adapter for local development and tests."""

    async def create_chat_completion(self, request: LLMChatRequest) -> LLMChatResponse:
        payload = " ".join(message.content for message in request.messages)
        digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:10]
        created = int(datetime.now(tz=UTC).timestamp())

        content = json.dumps(
            {
                "headline": "はじめての広告案",
                "body": (
                    "まずは購入や問い合わせにつながりやすいお客様に絞って、"
                    "少額から反応を確認します。成果が見えた配信先へ予算を広げます。"
                ),
                "call_to_action": "少額で試してみる",
                "mock_trace_id": digest,
            },
            ensure_ascii=False,
        )

        prompt_tokens = max(1, len(payload.split()))
        completion_tokens = max(1, len(content.split()))

        return LLMChatResponse(
            id=f"chatcmpl_mock_{uuid4().hex}",
            created=created,
            model=request.model,
            choices=[
                LLMChoice(
                    index=0,
                    message=LLMMessage(role="assistant", content=content),
                )
            ],
            usage=LLMUsage(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=prompt_tokens + completion_tokens,
            ),
        )
