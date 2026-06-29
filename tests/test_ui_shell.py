from fastapi.testclient import TestClient

from app.main import create_app


def test_ui_shell_is_served_from_root() -> None:
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Tact — Marketing Autonomy Engine" in response.text
    assert "/static/" in response.text
    assert 'id="view-dashboard"' in response.text
    assert 'id="campaign-form"' in response.text


def test_ui_shell_exposes_seven_button_nav_items_without_anchor_onclick() -> None:
    client = TestClient(create_app())

    response = client.get("/")
    js_response = client.get("/static/main.js")

    assert response.status_code == 200
    assert js_response.status_code == 200
    assert "<a " not in response.text
    assert "onclick=" not in response.text
    assert "<a " not in js_response.text
    assert "onclick=" not in js_response.text
    for label in (
        "ホーム",
        "キャンペーン",
        "ダッシュボード",
        "タスク",
        "クリエイティブ",
        "監査",
        "設定",
    ):
        assert label in js_response.text


def test_ui_static_assets_are_served() -> None:
    client = TestClient(create_app())

    css_response = client.get("/static/index.css")
    js_response = client.get("/static/main.js")

    assert css_response.status_code == 200
    assert "text/css" in css_response.headers["content-type"]
    assert "--bg:#eef2f8" in css_response.text.replace(" ", "")
    assert js_response.status_code == 200
    assert "javascript" in js_response.headers["content-type"]
    assert "Chart" in js_response.text
