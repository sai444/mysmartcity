"""Sample shorts so the feed is not empty on a fresh install. Clips live in ./demo."""

from pathlib import Path

DEMO_DIR = Path(__file__).resolve().parent / "demo"

DEMO_SHORTS = [
    {
        "id": "demo-short-lake",
        "kind": "user",
        "author_id": "demo-seller-anita",
        "author_name": "Anita",
        "caption": "Evening walk by the lake promenade. The new lights are finally on!",
        "file": "lake.webm",
    },
    {
        "id": "demo-short-market",
        "kind": "user",
        "author_id": "demo-seller-imran",
        "author_name": "Imran",
        "caption": "Saturday rush at Market Yard. Get here before 9 for the best mangoes.",
        "file": "market.webm",
    },
    {
        "id": "demo-short-park",
        "kind": "user",
        "author_id": "demo-seller-ravi",
        "author_name": "Ravi",
        "caption": "Kids' cricket at Gandhi Nagar park. Ward 1 vs Ward 2 rematch next week.",
        "file": "park.webm",
    },
    {
        "id": "demo-short-festival",
        "kind": "user",
        "author_id": "demo-seller-anita",
        "author_name": "Anita",
        "caption": "Setting up for the lake festival this weekend.",
        "file": "festival.webm",
    },
    {
        "id": "demo-short-ad-sweets",
        "kind": "ad",
        "author_id": "demo-city-desk",
        "author_name": "City desk",
        "caption": "Fresh sweets every morning. 10% off for MyNagari residents this week.",
        "file": "sweets.webm",
        "sponsor": "Lakshmi Sweets",
        "cta_label": "Visit shop",
        "cta_url": "/shop",
    },
    {
        "id": "demo-short-ad-grocery",
        "kind": "ad",
        "author_id": "demo-city-desk",
        "author_name": "City desk",
        "caption": "Groceries at your door in 30 minutes, anywhere in the city.",
        "file": "grocery.webm",
        "sponsor": "MyNagari Grocery",
        "cta_label": "Order now",
        "cta_url": "/grocery",
    },
    {
        "id": "demo-short-rice",
        "kind": "user",
        "author_id": "demo-seller-ravi",
        "author_name": "Ravi",
        "caption": "Fresh sona masuri at Neem Kirana this morning. Photo shorts work too.",
        "media_kind": "image",
    },
]
