from fastapi.testclient import TestClient

from app.main import create_app


def test_ui_shell_is_served_from_root() -> None:
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Tact - Marketing Autonomy Engine" in response.text
    assert 'href="/static/styles.css"' in response.text
    assert 'src="/static/app.js"' in response.text


def test_ui_shell_exposes_six_button_nav_items_without_anchor_onclick() -> None:
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    assert response.text.count('class="nav-item') == 6
    assert "<a " not in response.text
    assert "onclick=" not in response.text
    for label in ("ホーム", "キャンペーン", "タスク", "クリエイティブ", "監査", "設定"):
        assert label in response.text


def test_ui_static_assets_are_served() -> None:
    client = TestClient(create_app())

    css_response = client.get("/static/styles.css")
    js_response = client.get("/static/app.js")

    assert css_response.status_code == 200
    assert "text/css" in css_response.headers["content-type"]
    assert "--bg: #eef2f8" in css_response.text
    assert js_response.status_code == 200
    assert "javascript" in js_response.headers["content-type"]
    assert "function setView" in js_response.text
