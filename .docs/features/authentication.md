# Feature: Authentication

The Authentication module is responsible for managing user identity securely using Supabase Auth.

## Flow
1. **Login/Signup**: Users authenticate with email and password via `/app/login.jsx` and `/app/signup.jsx`.
2. **Session Persistence**: Supabase automatically stores the JWT session in the device's secure storage (configured via `AsyncStorage`).
3. **Session Verification**: The root `_layout.jsx` and `index.jsx` files wrap the app in an `AuthProvider` context. Upon app launch, the provider checks for an existing session. 
4. **Routing**: 
   - If no session, route to Login.
   - If session exists but no profile, route to Profile Creation.
   - If session and profile exist, route to Home.

## Provider Architecture
`AuthContext` exposes:
- `session`: The current Supabase session object.
- `user`: The current authenticated user.
- `loading`: Boolean indicating if session check is in progress.
- `signIn`, `signOut`, `signUp`: Helper functions wrapping Supabase API calls.
