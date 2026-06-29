from app.config import Settings


def test_public_status_exposes_storage_backend_without_secret_fields() -> None:
    settings = Settings(
        STORAGE_BACKEND="firestore",
        GCP_PROJECT_ID="tact-prod",
        MEDIA_API_KEY="sm://projects/tact-prod/secrets/media-api-key/versions/latest",
    )

    status = settings.public_status

    assert status["storage_backend"] == "firestore"
    assert "gcp_project_id" not in status
    assert "media_api_key" not in status
