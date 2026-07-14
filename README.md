# 🌍 Connecti — Privacy-First Social Reconnection Platform

> **Reconnect with people you already know, when life brings you together again.**

![Status](https://img.shields.io/badge/Status-Prototype-orange)
![Platform](https://img.shields.io/badge/Platform-React%20Native-blue)
![Backend](https://img.shields.io/badge/Backend-Node.js-green)
![AI](https://img.shields.io/badge/AI-Sentence%20Transformers-red)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

---

## 📖 Overview

Connecti is a **privacy-first social reconnection platform** designed to help people reconnect with **friends they already know**, rather than introducing strangers.

Today's social media platforms keep us digitally connected, but often fail to encourage meaningful real-world interactions. Many times we unknowingly pass by old classmates, friends, colleagues, teammates, or acquaintances in metros, malls, airports, colleges, conferences, or workplaces without ever realizing they were nearby.

**Connecti bridges this gap.**

Instead of continuously exposing users' live locations, Connecti uses **geofencing, mutual consent, phased identity reveal, and AI-powered relationship intelligence** to enable meaningful offline reconnections while preserving privacy.

> **Current Status:** 🚧 Working Prototype (Actively Under Development)

---

# 💡 Inspiration

The idea originated from a simple question during a metro journey.

> *"What if one of my closest friends is travelling in another coach on the same metro route?"*

We use the same route every day, but unless we constantly message each other, we'd never know.

That moment inspired Connecti.

Technology helps us stay connected online.

Connecti helps us reconnect in real life.

---

# 🚨 Problem Statement

Modern networking platforms face several challenges:

- 📱 Increasing digital interaction but declining real-world interaction
- 🤝 Missing opportunities to reconnect with people already known
- 📍 Continuous location sharing creates privacy concerns
- 🔍 Existing apps rely on manual searching
- ⏰ Valuable reconnection opportunities disappear forever

---

# ✅ Solution

Connecti combines:

- 📍 Intelligent Geofencing
- 🔒 Privacy-first architecture
- 🤝 Mutual consent
- 🧠 AI-powered relationship intelligence
- 🎁 Reward-driven engagement

Instead of exposing users continuously, Connecti only activates when users voluntarily participate.

---

# 🌊 Four Phase Discovery Journey

## Phase 1 — 👋 Wave

Users enter a predefined hotspot location.

Examples include:

- 🚇 Metro Stations
- 🏫 Colleges
- 🏢 Offices
- ☕ Cafés
- 🛍️ Shopping Malls
- 🎤 Conferences
- 💻 Hackathons

The application sends a notification asking whether they would like to **Wave**.

If accepted:

- User presence is stored for **30 minutes**
- Identity remains hidden
- Location is never exposed
- Participation is completely voluntary

---

## Phase 2 — 🕵️ Show Hint

If another existing friend also activates Wave within the same hotspot:

The backend detects a potential reconnection.

Instead of revealing identities immediately, Connecti displays contextual hints such as:

- Gender
- Shared college
- Shared workplace
- Mutual friends
- Shared hobbies
- Last meeting period
- Common interests

Both users independently decide whether to continue.

If either user declines, the process ends immediately.

---

## Phase 3 — 🎭 Reveal

Only when **both users mutually agree** are identities revealed.

Successful reveals reward users with:

🪙 Connecti Coins

These virtual rewards encourage engagement and become part of the platform's future ecosystem.

---

## Phase 4 — 🤝 Connect

Users may decide to meet offline.

Bluetooth Low Energy (BLE) verifies whether the physical meetup actually occurred.

Successful meetups unlock:

- 🎁 Larger rewards
- 🏷️ Discount coupons
- ☕ Partner business offers

---

# 🧠 AI Features

Connecti uses AI as a **decision-support system**, not as a chatbot.

---

## 1️⃣ Relationship Strength Engine

**Question it answers:**

> *"How strong is the relationship between these two users?"*

Generates a score between **0–100**.

### Features Considered

- Shared School
- Shared College
- Shared Workplace
- Mutual Friends
- Common Interests
- Common Skills
- Previous Meetups
- Meeting Recency
- Semantic Profile Similarity

### AI Component

User profiles are converted into embeddings using **Sentence Transformers**.

Cosine similarity measures semantic closeness between users.

Example:

User A

```
DTU
Machine Learning
Photography
Football
```

User B

```
DTU
Artificial Intelligence
Photography
Football
```

Even though wording differs, semantic embeddings capture their similarity.

---

## 2️⃣ Explainable AI

Instead of producing only a score,

Connecti explains *why* that score was generated.

Example:

> You both studied at DTU, have five mutual friends, share interests in AI and Football, and have highly similar profiles.

This improves transparency and trust.

---

## 3️⃣ Reunion Probability Engine

Relationship strength alone doesn't determine whether reconnecting today is meaningful.

This engine estimates:

> **How valuable would reconnecting right now actually be?**

Inputs include:

- Relationship Strength
- Mutual Friends
- Previous Meetups
- Semantic Similarity
- Meeting Recency

The weighted score passes through **Sigmoid Normalization** to produce a reunion probability.

Example:

| Friend | Relationship Strength | Reunion Probability |
|---------|----------------------|---------------------|
| Rahul | 95 | 52% |
| Aman | 78 | 91% |

A strong friendship doesn't always imply that reconnecting today is equally valuable.

---

# 🏗️ System Architecture

```text
                 React Native App
                        │
                  REST APIs
                        │
                Node.js + Express
                        │
        ┌───────────────┴───────────────┐
        │                               │
 PostgreSQL                       WebSockets
        │                               │
     PostGIS                  Real-time Events
        │
   AI Recommendation Engine (Python)
        │
 ├── Relationship Strength Engine
 ├── Explainable AI
 └── Reunion Probability Engine
        │
 Bluetooth Low Energy Verification
```

---

# ⚙️ Tech Stack

## 📱 Mobile

- React Native
- Expo

## ⚡ Backend

- Node.js
- Express.js

## 🗄 Database

- PostgreSQL

## 🌍 Spatial Intelligence

- PostGIS

## 🤖 AI / Machine Learning

- Python
- Scikit-learn
- Sentence Transformers
- NumPy
- Pandas

## 📡 Communication

- REST APIs
- WebSockets

## 📍 Location

- Geofencing
- GPS
- BLE (Bluetooth Low Energy)

---

# 🔐 Privacy First

Unlike traditional location-sharing applications:

✅ Users never broadcast live locations

✅ Users opt in voluntarily

✅ Identity reveal requires mutual consent

✅ Location is never continuously shared

✅ Stranger discovery is intentionally not supported

---

# 💰 Business Model

Connecti aims to partner with:

- ☕ Cafés
- 🍔 Restaurants
- 📚 Bookstores
- 🛍️ Shopping Malls
- 🎤 Event Organizers

Example:

Two friends reconnect.

The app recommends a nearby partner café.

They verify their meetup using Connecti.

The café offers a discount.

The café gains customers.

Users enjoy rewards.

Connecti earns a partner commission.

---

# 🚀 Future Roadmap

- 🍎 iOS Support
- 🤖 LLM-powered smart recommendations
- 🎯 AI meetup suggestions
- 📅 Event discovery
- 📈 Social analytics dashboard
- 🏢 Corporate networking mode
- 🎓 College networking mode
- 🎤 Conference networking mode
- 🤝 Hackathon networking mode

---

# 📚 What I Learned

Building Connecti helped me gain practical experience in:

- Mobile Application Development
- Real-time Communication
- Backend API Design
- Geospatial Computing
- AI Recommendation Systems
- Semantic Search
- Vector Embeddings
- Privacy-centric Product Design
- Event-driven Architecture
- Startup Product Thinking

---

# 🚧 Current Status

- ✅ Working Prototype
- ✅ Core User Flow Designed
- ✅ AI Engines Implemented
- ✅ Backend Architecture Completed
- ✅ Privacy-first Workflow Designed
- ⏳ Official Public Deployment In Progress

---

# 🤝 Contributions

This project is currently being actively developed.

Suggestions, discussions, and feedback are always welcome!

---

# ⭐ If you like the idea...

Give the repository a ⭐ and follow the journey as Connecti continues to evolve into a privacy-first social reconnection platform.
