# Feature: Profile

The User Profile is the primary way users present themselves to others in the zone.

## Data Structure (Supabase `profiles` table)
- `id`: UUID (matching auth token)
- `username`: Unique handle, validated during signup for uniqueness (`app/signup.jsx`).
- `full_name`: The user's actual name.
- `dob`: Date of Birth. Used to ensure age restrictions.
- `contact`: Phone number (kept private initially).

## Privacy Tiers
Connecti implements a tiered privacy model:
1. **Public View**: What users see when they are in the same zone. This is typically limited to `full_name`, `username`, and profile pictures.
2. **Connected View ("Reveal")**: Once users match, extended profile information (like contact details or extended bio) becomes visible.

## Profile Creation Flow
- New users are routed to `/app/create-profile.jsx` after signing up.
- The UI requires they fill out all necessary information before allowing them to access the `home` screens.
