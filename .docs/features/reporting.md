# Feature: Reporting

The Reporting feature provides a mechanism for users to flag inappropriate behavior, ensuring a safe community environment.

## Flow
1. **Trigger**: A user taps the "Report" button on another user's profile or within a chat interface.
2. **Data Collection**: The app prompts the user to select a reason for the report (e.g., Harassment, Fake Profile, Inappropriate Content) and optionally provide text details.
3. **Database Logging**: A record is inserted into a `reports` table containing:
   - `reporter_id`
   - `reported_id`
   - `reason`
   - `timestamp`
4. **Action**: Depending on backend logic, receiving multiple reports may automatically suspend a user, or flag them for manual review by an admin. Often, reporting a user also automatically triggers the "Block" action (`blocking.md`).
