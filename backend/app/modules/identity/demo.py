"""Local sample accounts. Passwords are shown on the sign-in screen."""

from app.modules.civic.seed import W1, W2

DEMO_USERS = [
    {
        "email": "admin@example.com",
        "password": "nagari-admin",
        "display_name": "Meera Iyer",
        "role": "admin",
        "ui_mode": "modern",
        "ward_id": W1,
    },
    {
        "email": "asha@example.com",
        "password": "nagari-home",
        "display_name": "Asha Rao",
        "role": "resident",
        "ui_mode": "normal",
        "ward_id": W2,
    },
]
