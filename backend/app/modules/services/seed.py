from app.modules.civic.seed import W1, W2

HOME = "svc-cat-home"
PERSONAL = "svc-cat-personal"
HEALTH = "svc-cat-health"
VEHICLE = "svc-cat-vehicle"

PLUMBING = "svc-sub-plumbing"
ELECTRICAL = "svc-sub-electrical"
CARPENTRY = "svc-sub-carpentry"
CLEANING = "svc-sub-cleaning"
TUITION = "svc-sub-tuition"
TAILORING = "svc-sub-tailoring"
NURSE = "svc-sub-nurse"
TWOWHEELER = "svc-sub-twowheeler"

DEMO_CATEGORIES = [
    {"id": HOME, "name": "Home", "sort_order": 0, "active": True},
    {"id": PERSONAL, "name": "Personal", "sort_order": 1, "active": True},
    {"id": HEALTH, "name": "Health", "sort_order": 2, "active": True},
    {"id": VEHICLE, "name": "Vehicle", "sort_order": 3, "active": True},
]

DEMO_SUBCATEGORIES = [
    {
        "id": PLUMBING,
        "category_id": HOME,
        "name": "Plumbing",
        "response_hours": 2,
        "completion_hours": 24,
        "sla_note": "Urgent leaks are visited the same day.",
        "sort_order": 0,
        "active": True,
    },
    {
        "id": ELECTRICAL,
        "category_id": HOME,
        "name": "Electrical",
        "response_hours": 4,
        "completion_hours": 48,
        "sla_note": "Power faults that affect the house get first attention.",
        "sort_order": 1,
        "active": True,
    },
    {
        "id": CARPENTRY,
        "category_id": HOME,
        "name": "Carpentry",
        "response_hours": 24,
        "completion_hours": 72,
        "sla_note": "Measure on the first visit; finish on a booked slot.",
        "sort_order": 2,
        "active": True,
    },
    {
        "id": CLEANING,
        "category_id": HOME,
        "name": "House cleaning",
        "response_hours": 12,
        "completion_hours": 24,
        "sla_note": "Confirm the slot the same day you call.",
        "sort_order": 3,
        "active": True,
    },
    {
        "id": TUITION,
        "category_id": PERSONAL,
        "name": "Home tuition",
        "response_hours": 24,
        "completion_hours": None,
        "sla_note": "Trial class within two days of the first call.",
        "sort_order": 0,
        "active": True,
    },
    {
        "id": TAILORING,
        "category_id": PERSONAL,
        "name": "Tailoring",
        "response_hours": 24,
        "completion_hours": 72,
        "sla_note": "Alterations in three days; new stitching by the date you agree.",
        "sort_order": 1,
        "active": True,
    },
    {
        "id": NURSE,
        "category_id": HEALTH,
        "name": "Home nurse",
        "response_hours": 6,
        "completion_hours": None,
        "sla_note": "A nurse calls back the same day for a visit plan.",
        "sort_order": 0,
        "active": True,
    },
    {
        "id": TWOWHEELER,
        "category_id": VEHICLE,
        "name": "Two-wheeler service",
        "response_hours": 8,
        "completion_hours": 24,
        "sla_note": "Pickup the same day if you call before noon.",
        "sort_order": 0,
        "active": True,
    },
]

DEMO_LISTINGS = [
    {
        "id": "svc-list-ravi-plumb",
        "provider_id": "city",
        "provider_name": "Ravi Plumbing",
        "title": "Leak and tap repair",
        "details": "Kitchen and bathroom leaks, tap replacement, and tank overflow. I carry common washers and PVC fittings.",
        "subcategory_id": PLUMBING,
        "price_paise": 45000,
        "ward_id": W1,
        "area_text": "Gandhi Nagar and nearby wards",
        "contact_name": "Ravi",
        "contact_phone": "98450 22011",
        "status": "approved",
    },
    {
        "id": "svc-list-meena-elec",
        "provider_id": "city",
        "provider_name": "Meena Electricals",
        "title": "Fan, switch, and wiring check",
        "details": "New points, MCBs, and fan installation. I work in occupied houses and clean up after the job.",
        "subcategory_id": ELECTRICAL,
        "price_paise": 60000,
        "ward_id": W1,
        "area_text": "Gandhi Nagar, Market Ward",
        "contact_name": "Meena Iyer",
        "contact_phone": "98450 22022",
        "status": "approved",
    },
    {
        "id": "svc-list-asha-tutor",
        "provider_id": "city",
        "provider_name": "Asha Tuition",
        "title": "Class 6–10 maths at home",
        "details": "Two or three sessions a week. First class is a short trial so you can see if the pace fits.",
        "subcategory_id": TUITION,
        "price_paise": 40000,
        "ward_id": W2,
        "area_text": "Lake View",
        "contact_name": "Asha Rao",
        "contact_phone": "98450 22033",
        "status": "approved",
    },
]
