from app.adapters.llm import LLMChatRequest, LLMMessage, MockLLMAdapter
from app.adapters.media import MediaPlanRequest, MediaPublishRequest, MockMediaAdapter


async def test_mock_llm_uses_chat_completion_shape() -> None:
    adapter = MockLLMAdapter()
    response = await adapter.create_chat_completion(
        LLMChatRequest(
            model="tact-mock-v3",
            messages=[LLMMessage(role="user", content="Create a launch campaign.")],
        )
    )

    assert response.object == "chat.completion"
    assert response.choices[0].message.role == "assistant"
    assert response.usage.total_tokens == (
        response.usage.prompt_tokens + response.usage.completion_tokens
    )


async def test_mock_media_plan_and_publish_use_media_api_shape() -> None:
    adapter = MockMediaAdapter()
    plan = await adapter.create_plan(
        MediaPlanRequest(
            account_id="mock-account",
            campaign_name="Launch",
            objective="lead_generation",
            total_budget_jpy=100_001,
            target_audience="B2B SaaS operators",
            channels=["search", "social"],
        )
    )

    assert plan.account_id == "mock-account"
    assert sum(placement.budget_jpy for placement in plan.placements) == 100_001
    assert {placement.channel for placement in plan.placements} == {"search", "social"}
    assert plan.placements[0].creative_spec["optimization_metric"] == "qualified_leads"
    assert plan.placements[0].creative_spec["bid_strategy"] == "target_cpa"

    publish = await adapter.publish_campaign(
        MediaPublishRequest(
            account_id="mock-account",
            campaign_id="campaign-001",
            placements=plan.placements,
            creative={"headline": "Launch", "body": "Try it now"},
        )
    )

    assert publish.status == "scheduled"
    assert publish.external_campaign_id.startswith("mock_media_")


async def test_mock_media_plan_changes_budget_mix_by_objective() -> None:
    adapter = MockMediaAdapter()
    plan = await adapter.create_plan(
        MediaPlanRequest(
            account_id="mock-account",
            campaign_name="Brand Lift",
            objective="awareness",
            total_budget_jpy=1_000_000,
            target_audience="new buyers",
            channels=["display", "social", "search"],
        )
    )

    budgets = {placement.channel: placement.budget_jpy for placement in plan.placements}

    assert budgets["display"] > budgets["social"] > budgets["search"]
    assert sum(budgets.values()) == 1_000_000
    assert plan.placements[0].creative_spec["optimization_metric"] == "reach"
    assert plan.placements[0].creative_spec["bid_strategy"] == "target_cpm"
